import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useAuthStore } from '../stores/authStore';
import { readLocalConfigs, detectApiKeys, type LocalConfigs } from '../lib/tauri';

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

export default function Dashboard() {
  const navigate = useNavigate();
  const providers = useModelStore((s) => s.providers);
  const { profiles, activeProfileId } = useProfileStore();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const greeting = useMemo(getGreeting, []);
  const { user: githubUser } = useAuthStore();
  const [localModels, setLocalModels] = useState<{ id: string; source: string }[]>([]);

  useEffect(() => {
    Promise.all([readLocalConfigs(), detectApiKeys()])
      .then(([configs, keys]) => setLocalModels(extractModels(configs, keys)))
      .catch(() => {});
  }, []);

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
          className="card-sm text-left hover:border-zinc-600 transition-colors cursor-pointer">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${githubUser ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            <span className="text-xs text-zinc-500">云同步</span>
          </div>
          <p className="text-sm text-zinc-300">{githubUser ? `已连接 ${githubUser.login}` : '未连接'}</p>
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
