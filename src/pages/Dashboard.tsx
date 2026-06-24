import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  readLocalConfigs,
  detectApiKeys,
  getConfigPaths,
  syncCheckVersion,
  type LocalConfigs,
  type ConfigPaths,
} from '../lib/tauri';

/** 根据时间返回问候语 */
function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 6) return { text: '夜深了，注意休息', emoji: '🌙' };
  if (h < 9) return { text: '早上好', emoji: '🌅' };
  if (h < 12) return { text: '上午好', emoji: '☀️' };
  if (h < 14) return { text: '中午好', emoji: '🍜' };
  if (h < 18) return { text: '下午好', emoji: '🌤' };
  if (h < 22) return { text: '晚上好', emoji: '🌆' };
  return { text: '夜深了，注意休息', emoji: '🌙' };
}

function normalizeModelId(id: string): string {
  return id.replace(/\[.*?\]$/, '').trim();
}

/** 从本机配置提取可用模型列表 */
function extractModels(configs: LocalConfigs, apiKeys: Record<string, string | null>) {
  const models: { id: string; source: string }[] = [];
  const seen = new Set<string>();

  if (configs.claude.settings) {
    const env = (configs.claude.settings.env as Record<string, string>) || {};
    const model = env.ANTHROPIC_MODEL;
    const apiKey = env.ANTHROPIC_AUTH_TOKEN;
    if (model && apiKey && !seen.has(normalizeModelId(model))) {
      seen.add(normalizeModelId(model));
      models.push({ id: model, source: 'claude' });
    }
  }

  if (configs.opencode.agents) {
    const agents = (configs.opencode.agents.agents as Record<string, unknown>) || {};
    Object.values(agents).forEach((agent: unknown) => {
      const a = agent as Record<string, unknown>;
      const modelStr = (a.model as string) || '';
      const rawId = modelStr.replace(/^(opencode|openai)\//, '');
      const modelId = normalizeModelId(rawId);
      if (!modelId || seen.has(modelId)) return;
      const id = modelId.toLowerCase();
      const needsKey = id.includes('claude') ? 'ANTHROPIC_API_KEY'
        : id.includes('gpt') || id.includes('openai') ? 'OPENAI_API_KEY'
        : id.includes('gemini') ? 'GOOGLE_API_KEY' : null;
      if (!needsKey || apiKeys[needsKey]) {
        seen.add(modelId);
        models.push({ id: modelId, source: 'opencode' });
      }
    });
  }
  return models;
}

/** 一键导入：将本机配置导入为模型服务商（每个模型一个服务商） */
function importToProviders(
  configs: LocalConfigs,
  addProvider: (p: import('../stores/modelStore').Provider) => void,
) {
  let imported = 0;
  const seen = new Set<string>();

  // Claude Code → 每个模型创建一个 Anthropic 服务商
  if (configs.claude.settings) {
    const env = (configs.claude.settings.env as Record<string, string>) || {};
    const apiKey = env.ANTHROPIC_AUTH_TOKEN || '';
    const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

    // 收集所有配置的模型
    const modelKeys = ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL'];
    for (const key of modelKeys) {
      const model = env[key];
      if (model && apiKey && !seen.has(model)) {
        seen.add(model);
        addProvider({
          id: `claude-${model}-${Date.now()}`,
          name: model,
          anthropicUrl: baseUrl,
          apiKey,
          models: [model],
          modelCapabilities: {},
        });
        imported++;
      }
    }
  }

  // OpenCode agents → 每个模型创建一个服务商
  if (configs.opencode.agents) {
    const agents = (configs.opencode.agents.agents as Record<string, unknown>) || {};

    Object.values(agents).forEach((agent: unknown) => {
      const a = agent as Record<string, unknown>;
      const modelStr = (a.model as string) || '';
      const rawId = modelStr.replace(/^(opencode|openai)\//, '');
      const modelId = normalizeModelId(rawId);
      if (!modelId || seen.has(modelId)) return;
      seen.add(modelId);

      const id = modelId.toLowerCase();
      let openaiUrl: string | undefined = 'https://api.openai.com/v1';

      if (id.includes('claude') || id.includes('anthropic')) {
        // claude 模型应该用 anthropicUrl，但因为我们没有 key 没法用 Claude，写到 openaiUrl 留个占位也无意义
        // 跳过 claude 命名（用户应该在 ClaudeCode 那侧单独导入）
        return;
      } else if (id.includes('gemini') || id.includes('google')) {
        openaiUrl = 'https://generativelanguage.googleapis.com/v1beta';
      } else if (id.includes('deepseek')) {
        openaiUrl = 'https://api.deepseek.com/v1';
      }

      addProvider({
        id: `opencode-${modelId}-${Date.now()}`,
        name: modelId,
        openaiUrl,
        apiKey: '',
        models: [modelId],
        modelCapabilities: {},
      });
      imported++;
    });
  }

  return imported;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const providers = useModelStore((s) => s.providers);
  const addProvider = useModelStore((s) => s.addProvider);
  const { profiles, activeProfileId } = useProfileStore();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);
  const greeting = useMemo(() => getGreeting(), []);
  const { user: githubUser } = useAuthStore();
  const [localModels, setLocalModels] = useState<{ id: string; source: string }[]>([]);
  const [localConfigs, setLocalConfigs] = useState<LocalConfigs | null>(null);
  const [configPaths, setConfigPaths] = useState<ConfigPaths | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // 云同步状态：探测云端 version，60 秒轮询
  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  const [cloudNotFound, setCloudNotFound] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudChecking, setCloudChecking] = useState(false);

  useEffect(() => {
    Promise.all([readLocalConfigs(), detectApiKeys(), getConfigPaths()])
      .then(([configs, keys, paths]) => {
        setLocalConfigs(configs);
        setLocalModels(extractModels(configs, keys));
        setConfigPaths(paths);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!githubUser) {
      setCloudVersion(null);
      setCloudNotFound(false);
      setCloudError(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      setCloudChecking(true);
      try {
        const info = await syncCheckVersion();
        if (cancelled) return;
        setCloudVersion(info.version);
        setCloudNotFound(info.notFound);
        setCloudError(info.error ?? null);
      } catch (e) {
        if (cancelled) return;
        setCloudError('前端错误: ' + String(e));
      } finally {
        if (!cancelled) setCloudChecking(false);
      }
    };
    // 1.5s 后首次探测
    const initial = setTimeout(tick, 1500);
    // 60s 轮询
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [githubUser, lastSyncedVersion]);

  const handleImportLocal = async () => {
    if (!localConfigs) return;
    setImporting(true);
    setImportMsg('');
    try {
      const count = importToProviders(localConfigs, addProvider);
      if (count > 0) {
        useModelStore.getState().saveToStorage();
        setImportMsg(`导入成功！已添加 ${count} 个服务商到模型设置`);
      } else {
        setImportMsg('未检测到可导入的配置');
      }
    } catch (e) {
      setImportMsg('导入失败: ' + String(e));
    } finally {
      setImporting(false);
    }
  };

  const totalModels = providers.reduce((n, p) => n + p.models.length, 0);

  return (
    <div className="max-w-4xl space-y-6">
      {/* 欢迎语 */}
      <div className="card bg-gradient-to-br from-zinc-900 to-zinc-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              {greeting.emoji} {greeting.text}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {githubUser ? `欢迎回来，${githubUser.login}` : 'AI-Switch 配置管理工具'}
            </p>
          </div>
          {githubUser && githubUser.avatar_url && (
            <img src={githubUser.avatar_url} className="w-10 h-10 rounded-full ring-2 ring-zinc-700" alt="" />
          )}
        </div>
      </div>

      {/* 快速操作 */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => navigate('/sync')}
          className="card-sm text-left hover:border-zinc-600 transition-colors cursor-pointer relative">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-2 h-2 rounded-full ${getSyncDotColor(!!githubUser, cloudChecking, cloudError)}`} />
            <span className="text-xs text-zinc-500">云同步</span>
            {cloudChecking && <div className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin ml-auto" />}
          </div>
          <p className="text-sm text-zinc-300 leading-tight">
            {getSyncStatusText(!!githubUser, cloudChecking, cloudError, cloudVersion, cloudNotFound, lastSyncedVersion)}
          </p>
        </button>
        <button onClick={() => navigate('/models')}
          className="card-sm text-left hover:border-zinc-600 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${providers.length > 0 ? 'bg-blue-500' : 'bg-zinc-600'}`} />
            <span className="text-xs text-zinc-500">服务商</span>
          </div>
          <p className="text-sm text-zinc-300">{providers.length} 个已配置</p>
        </button>
        <button onClick={() => navigate('/profiles')}
          className="card-sm text-left hover:border-zinc-600 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${profiles.length > 0 ? 'bg-purple-500' : 'bg-zinc-600'}`} />
            <span className="text-xs text-zinc-500">方案</span>
          </div>
          <p className="text-sm text-zinc-300">{profiles.length} 个方案</p>
        </button>
      </div>

      {/* Agent 工具检测 */}
      <AgentToolsCard
        configs={localConfigs}
        paths={configPaths}
        onManage={() => navigate('/tools')}
      />

      {/* 数据概览 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '服务商', value: providers.length, color: 'text-blue-400' },
          { label: '模型', value: totalModels, color: 'text-emerald-400' },
          { label: '方案', value: profiles.length, color: 'text-purple-400' },
          { label: '本机模型', value: localModels.length, color: 'text-amber-400' },
        ].map((s) => (
          <div key={s.label} className="card-sm text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-zinc-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 本机配置一键导入 */}
      {localModels.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-300">本机配置检测</h2>
              <p className="text-xs text-zinc-500 mt-1">
                检测到 {localModels.length} 个模型，可一键导入到服务商设置
              </p>
            </div>
            <button
              onClick={handleImportLocal}
              disabled={importing}
              className="btn btn-primary btn-sm"
            >
              {importing ? '导入中...' : '一键导入'}
            </button>
          </div>
          <div className="space-y-1.5">
            {localModels.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                <span className="text-sm text-zinc-300">{m.id}</span>
                <span className="text-xs text-zinc-500">{m.source === 'claude' ? 'Claude Code' : 'OpenCode'}</span>
              </div>
            ))}
          </div>
          {importMsg && (
            <p className={`text-xs mt-2 ${importMsg.includes('成功') ? 'text-emerald-400' : 'text-red-400'}`}>
              {importMsg}
            </p>
          )}
        </div>
      )}

      {/* 当前方案 */}
      {activeProfile && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-zinc-400">当前方案</h2>
            <span className="tag tag-blue">使用中</span>
          </div>
          <p className="text-sm text-white font-medium">{activeProfile.name}</p>
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 mb-1">Claude Code</p>
              <p className="text-zinc-300">{activeProfile.claude.enabledModel || '未配置'}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 mb-1">OpenCode</p>
              <p className="text-zinc-300">{activeProfile.opencode.models.length} 个模型</p>
            </div>
          </div>
        </div>
      )}

      {/* 引导 */}
      {!githubUser && (
        <div className="card border-dashed border-zinc-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300 font-medium">连接 GitHub</p>
              <p className="text-xs text-zinc-500 mt-1">同步配置到私有仓库，跨设备共享</p>
            </div>
            <button onClick={() => navigate('/sync')} className="btn btn-primary btn-sm">去连接</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 云同步状态指示器颜色 */
function getSyncDotColor(
  loggedIn: boolean,
  checking: boolean,
  error: string | null,
): string {
  if (!loggedIn) return 'bg-zinc-600';
  if (error) return 'bg-red-500';
  if (checking) return 'bg-zinc-500';
  return 'bg-emerald-500';
}

/** 云同步状态文字（两行以内） */
function getSyncStatusText(
  loggedIn: boolean,
  checking: boolean,
  error: string | null,
  cloudVersion: number | null,
  cloudNotFound: boolean,
  lastSyncedVersion: number | null,
): string {
  if (!loggedIn) return '未连接 GitHub';
  if (error) return `检查失败：${error}`;
  if (checking) return '正在检查云端…';
  if (cloudNotFound) return '云端尚无备份';
  // cloudVersion === null 但 notFound=false：云端有 profiles.json 但没有 version 字段（旧数据）
  // 按 v0 处理，避免永远卡在「等待探测…」
  const cv = cloudVersion ?? 0;
  if (lastSyncedVersion === null) return `云端 v${cv} · 待同步`;
  if (cv > lastSyncedVersion) {
    return `云端 v${cv} · 本地 v${lastSyncedVersion}`;
  }
  return `v${cv} · 已同步`;
}

/** Agent 工具检测卡片 */
function AgentToolsCard({
  configs,
  paths,
  onManage,
}: {
  configs: LocalConfigs | null;
  paths: ConfigPaths | null;
  onManage: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const claudeDetected = configs?.detected.claude ?? false;
  const opencodeDetected = configs?.detected.opencode ?? false;

  return (
    <div className="card">
      <div className="w-full flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left hover:opacity-80 transition-opacity py-1"
        >
          <span className="text-zinc-500 text-xs w-3">{expanded ? '▾' : '▸'}</span>
          <span className="text-zinc-300 font-medium text-sm">Agent 工具</span>
          <span className="text-[10px] text-zinc-600 flex items-center gap-1.5 ml-2">
            <span>🟣 {claudeDetected ? '已配置' : '未检测'}</span>
            <span>·</span>
            <span>🟢 {opencodeDetected ? '已配置' : '未检测'}</span>
          </span>
        </button>
        <button onClick={onManage} className="btn btn-ghost btn-sm shrink-0">
          前往管理
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-3">
            按配置文件存在与否判断是否已配置
          </p>
          <div className="grid grid-cols-2 gap-3">
            <AgentRow
              name="Claude Code"
              detected={claudeDetected}
              path={paths?.claude_settings ?? null}
              emoji="🟣"
            />
            <AgentRow
              name="OpenCode"
              detected={opencodeDetected}
              path={paths?.opencode_agents ?? null}
              emoji="🟢"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AgentRow({
  name,
  detected,
  path,
  emoji,
}: {
  name: string;
  detected: boolean;
  path: string | null;
  emoji: string;
}) {
  return (
    <div className={`rounded-lg p-3 ${
      detected
        ? 'bg-emerald-500/5 border border-emerald-500/20'
        : 'bg-zinc-800/40 border border-zinc-800'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <span className="text-sm text-white font-medium">{name}</span>
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
          detected
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-zinc-700/50 text-zinc-500'
        }`}>
          {detected ? '已配置' : '未检测到'}
        </span>
      </div>
      {path && (
        <p className="text-[10px] text-zinc-600 mt-2 truncate font-mono" title={path}>
          {path}
        </p>
      )}
    </div>
  );
}
