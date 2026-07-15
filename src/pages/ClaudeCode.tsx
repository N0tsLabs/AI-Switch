import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useModelStore, getActiveKeyValue } from '../stores/modelStore';
import {
  readClaudeSettings,
  mergeClaudeEnv,
  mergeClaudeExtras,
  extractClaudeEnv,
  readFileContent,
  writeFileContent,
  getConfigPaths,
  type ExtraOp,
} from '../lib/tauri';
import { useSettingsStore, type ClaudeToggles } from '../stores/settingsStore';
import { useToast } from '../components/useToast';

const MODEL_FIELDS = [
  { key: 'default', envKey: 'ANTHROPIC_MODEL', label: '默认模型', desc: '主模型，未指定时使用' },
  { key: 'sonnet', envKey: 'ANTHROPIC_DEFAULT_SONNET_MODEL', label: 'Sonnet 模型', desc: '中等能力，平衡速度与质量' },
  { key: 'opus', envKey: 'ANTHROPIC_DEFAULT_OPUS_MODEL', label: 'Opus 模型', desc: '最强能力，适合复杂任务' },
  { key: 'haiku', envKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', label: 'Haiku 模型', desc: '最快最省，适合简单任务' },
] as const;

export default function ClaudeCode() {
  const providers = useModelStore((s) => s.providers);
  const claudeToggles = useSettingsStore((s) => s.claude);
  const setClaudeToggle = useSettingsStore((s) => s.setClaudeToggle);
  const persistedSelectedProviderId = useSettingsStore((s) => s.claudeSelectedProviderId);
  const setPersistedSelectedProviderId = useSettingsStore((s) => s.setClaudeSelectedProviderId);
  const persistedModels = useSettingsStore((s) => s.claudeModels);
  const setPersistedModels = useSettingsStore((s) => s.setClaudeModels);

  // 本地 state 初始从 store 拿（store 持久化）
  const [selectedProviderId, setSelectedProviderId] = useState(persistedSelectedProviderId ?? '');
  const [models, setModelsState] = useState(persistedModels);

  // 切换服务商时：若当前选中的模型不在新 provider 的模型列表里，
  // 自动把第一个模型填进所有变体；否则保留用户已配置的
  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setPersistedSelectedProviderId(providerId || null);
    const p = providers.find((x) => x.id === providerId);
    if (!p || p.models.length === 0) return;
    const allModelIds = new Set(p.models);
    const anyOutOfRange = Object.values(models).some((m) => m && !allModelIds.has(m));
    if (anyOutOfRange) {
      const m = p.models[0];
      setModels({ default: m, sonnet: m, opus: m, haiku: m });
    }
  };
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // 编辑器
  const [showEditor, setShowEditor] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editorPath, setEditorPath] = useState('');
  const [editorError, setEditorError] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [configPaths, setConfigPaths] = useState<import('../lib/tauri').ConfigPaths | null>(null);

  // 已管理数据快照（env 字段 + 顶层 extras）
  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);
  const [snapshotExtras, setSnapshotExtras] = useState<Record<string, unknown> | null>(null);
  const [showSnapshot, setShowSnapshot] = useState(false);

  const refreshSnapshot = async () => {
    try {
      const env = await extractClaudeEnv();
      setSnapshot(env);
    } catch { setSnapshot({}); }
    try {
      const full = await readClaudeSettings();
      const extras: Record<string, unknown> = {};
      const fields = [
        'includeCoAuthoredBy', 'skipWebFetchPreflight', 'skipDangerousModePermissionPrompt',
        'alwaysThinkingEnabled', 'autoCompactEnabled', 'fileCheckpointingEnabled',
        'autoMemoryEnabled', 'disableRemoteControl', 'remoteControlAtStartup',
        'respondToBashCommands', 'disableSkillShellExecution',
        'prefersReducedMotion', 'respectGitignore', 'disableAllHooks',
      ];
      for (const f of fields) {
        if ((full as Record<string, unknown>)[f] !== undefined) {
          extras[f] = (full as Record<string, unknown>)[f];
        }
      }
      const perms = full.permissions as Record<string, unknown> | undefined;
      if (perms?.defaultMode !== undefined) extras.permissions = { defaultMode: perms.defaultMode };
      setSnapshotExtras(extras);
    } catch { setSnapshotExtras({}); }
  };

  /** 从本地 settings.json 推断 15 个开关的当前值（仅在 store 为空时调用一次） */
  const inferTogglesFromSettings = (settings: Record<string, unknown>): Partial<ClaudeToggles> => {
    const perms = settings.permissions as Record<string, unknown> | undefined;
    return {
      includeCoAuthoredByOff: settings.includeCoAuthoredBy === false,
      skipWebFetchPreflight: settings.skipWebFetchPreflight === true,
      bypassPermissions: perms?.defaultMode === 'bypassPermissions',
      skipDangerousModePermissionPrompt: settings.skipDangerousModePermissionPrompt === true,
      alwaysThinkingEnabled: settings.alwaysThinkingEnabled === true,
      autoCompactEnabled: settings.autoCompactEnabled === true,
      fileCheckpointingEnabled: settings.fileCheckpointingEnabled === true,
      autoMemoryEnabled: settings.autoMemoryEnabled === true,
      disableRemoteControl: settings.disableRemoteControl === true,
      remoteControlAtStartup: settings.remoteControlAtStartup === true,
      respondToBashCommands: settings.respondToBashCommands === true,
      disableSkillShellExecution: settings.disableSkillShellExecution === true,
      prefersReducedMotion: settings.prefersReducedMotion === true,
      respectGitignore: settings.respectGitignore === true,
      disableAllHooks: settings.disableAllHooks === true,
    };
  };

  useEffect(() => {
    getConfigPaths().then(setConfigPaths).catch(() => {});
    readClaudeSettings()
      .then((settings) => {
        const env = (settings.env as Record<string, string>) || {};
        const currentUrl = env.ANTHROPIC_BASE_URL || '';
        const currentKey = env.ANTHROPIC_AUTH_TOKEN || '';
        // 根据当前 API 信息匹配服务商
        const matched = providers.find(
          (p) => p.anthropicUrl === currentUrl && getActiveKeyValue(p) === currentKey,
        );
        if (matched) {
          setSelectedProviderId(matched.id);
          setPersistedSelectedProviderId(matched.id);
        }
        // 若 store 中已有模型配置，优先使用；否则从 settings.json 读
        const storeHasModels = Object.values(persistedModels).some((v) => v);
        if (!storeHasModels) {
          setModels({
            default: env.ANTHROPIC_MODEL || '',
            sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
            opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
            haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '',
          });
        }

        // 仅在 settingsStore 为初始状态时从 settings.json 推断（首次启动 / 迁移场景）
        const storeAllDefault = Object.values(claudeToggles).every((v) => v === false);
        if (storeAllDefault) {
          const inferred = inferTogglesFromSettings(settings);
          // 仅把=true 的写入 store（false 表示无设置）
          for (const [k, v] of Object.entries(inferred)) {
            if (v === true) setClaudeToggle(k as keyof ClaudeToggles, true);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    refreshSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  const allModels = providers.flatMap((p) =>
    p.models.map((m) => ({ label: `${p.name} / ${m}`, modelId: m }))
  );

  // Claude Code 仅支持填了 Anthropic URL 的服务商
  const anthropicProviders = providers.filter((p) => !!p.anthropicUrl);

  // 同步包装：本地 setModels 同时持久化到 store
  // 支持 setModels({...}) 和 setModels(prev => ...) 两种用法
  const setModels = (
    arg: typeof persistedModels | ((prev: typeof persistedModels) => typeof persistedModels),
  ) => {
    const updater = typeof arg === 'function' ? arg : () => arg;
    setModelsState((prev) => {
      const next = updater(prev);
      setPersistedModels(next);
      return next;
    });
  };

  // 给模型名拼接 [1M] 后缀（如果该模型在 modelStore 中标记了 context1M）
  const resolveModelName = (modelId: string): string => {
    if (!modelId) return '';
    for (const p of providers) {
      const cap = p.modelCapabilities[modelId];
      if (cap?.context1M) return `${modelId}[1M]`;
    }
    return modelId;
  };

  const handleSave = async () => {
    try {
      // 校验：选中的服务商必须填了 Anthropic URL
      const provider = providers.find((p) => p.id === selectedProviderId);
      if (!provider) {
        toast('请先选择服务商', 'error');
        return;
      }
      if (!provider.anthropicUrl) {
        toast(
          `「${provider.name}」未填写 Anthropic URL，无法用于 Claude Code。请到「模型设置」补充。`,
          'error',
        );
        return;
      }
      // 从 apiKeys 中读取当前激活 key 的 value
      const keyValue = getActiveKeyValue(provider);
      if (!keyValue) {
        toast(`「${provider.name}」未指定激活的 API Key，请到「模型设置」`, 'error');
        return;
      }

      // 1. 用 key-level merge：仅修改 env 字段，保留 permissions/hooks/statusLine 等其他 key
      const env: Record<string, string> = {};
      env.ANTHROPIC_BASE_URL = provider.anthropicUrl;
      env.ANTHROPIC_AUTH_TOKEN = keyValue;
      env.ANTHROPIC_MODEL = resolveModelName(models.default);
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolveModelName(models.sonnet);
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolveModelName(models.opus);
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolveModelName(models.haiku);
      await mergeClaudeEnv(env);

      // 2. 15 个行为开关：从 settingsStore 读取状态，构建 ExtraOp 批量写入
      //    ON → 写入对应值；OFF → 删除 key（使用 Claude 默认）
      const t = claudeToggles;
      const extras: ExtraOp[] = [
        { path: ['includeCoAuthoredBy'], value: t.includeCoAuthoredByOff ? false : null },
        { path: ['skipWebFetchPreflight'], value: t.skipWebFetchPreflight ? true : null },
        { path: ['permissions', 'defaultMode'], value: t.bypassPermissions ? 'bypassPermissions' : null },
        { path: ['skipDangerousModePermissionPrompt'], value: t.skipDangerousModePermissionPrompt ? true : null },
        { path: ['alwaysThinkingEnabled'], value: t.alwaysThinkingEnabled ? true : null },
        { path: ['autoCompactEnabled'], value: t.autoCompactEnabled ? true : null },
        { path: ['fileCheckpointingEnabled'], value: t.fileCheckpointingEnabled ? true : null },
        { path: ['autoMemoryEnabled'], value: t.autoMemoryEnabled ? true : null },
        { path: ['disableRemoteControl'], value: t.disableRemoteControl ? true : null },
        { path: ['remoteControlAtStartup'], value: t.remoteControlAtStartup ? true : null },
        { path: ['respondToBashCommands'], value: t.respondToBashCommands ? true : null },
        { path: ['disableSkillShellExecution'], value: t.disableSkillShellExecution ? true : null },
        { path: ['prefersReducedMotion'], value: t.prefersReducedMotion ? true : null },
        { path: ['respectGitignore'], value: t.respectGitignore ? true : null },
        { path: ['disableAllHooks'], value: t.disableAllHooks ? true : null },
      ];
      await mergeClaudeExtras(extras);

      await refreshSnapshot();
      toast('已保存到 settings.json', 'success');
    } catch (e) {
      toast('保存失败: ' + String(e), 'error');
    }
  };

  const openEditor = async (path: string) => {
    try {
      const content = await readFileContent(path);
      setEditorContent(content);
      setEditorPath(path);
      setEditorError('');
      setEditorDirty(false);
      setShowEditor(true);
    } catch (e) { setEditorError(String(e)); }
  };

  const formatJson = () => {
    try {
      setEditorContent(JSON.stringify(JSON.parse(editorContent), null, 2));
      setEditorError('');
    } catch (e) { setEditorError('JSON 格式错误: ' + String(e)); }
  };

  const saveEditor = async () => {
    try { JSON.parse(editorContent); } catch (e) { setEditorError('JSON 格式错误: ' + String(e)); return; }
    try { await writeFileContent(editorPath, editorContent); setEditorDirty(false); setShowEditor(false); }
    catch (e) { setEditorError(String(e)); }
  };

  if (loading) {
    return <div className="max-w-4xl flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-1">🟣 Claude Code</h1>
      <p className="text-zinc-500 text-sm mb-8">选择服务商和模型，API 配置在「模型设置」中管理</p>

      <div className="space-y-6">
        {/* 服务商选择（仅 Anthropic 格式） */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-medium text-zinc-400">选择服务商</h2>
          {providers.length === 0 ? (
            <p className="text-xs text-zinc-500">请先在<Link to="/models" className="text-blue-400 hover:underline">模型设置</Link>中添加服务商</p>
          ) : anthropicProviders.length === 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1.5">
              <p className="text-xs text-amber-300 font-medium">⚠ Claude Code 需要 Anthropic 格式服务商</p>
              <p className="text-xs text-amber-400/80">
                {providers.length === 0
                  ? '请到「模型设置」添加一个服务商，并填写 Anthropic URL。'
                  : '当前服务商都未填写 Anthropic URL。请到「模型设置」为某个服务商补充 Anthropic URL。'}
              </p>
            </div>
          ) : (
            <select value={selectedProviderId} onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">未选择</option>
              {anthropicProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.name}（{p.models.length} 个模型）</option>
              ))}
            </select>
          )}
          {selectedProviderId && (() => {
            const prov = providers.find((p) => p.id === selectedProviderId);
            if (!prov) return null;
            return (
              <div className="text-xs text-zinc-500 space-y-0.5">
                <p>OpenAI URL：{prov.openaiUrl || <span className="text-zinc-600">未填写</span>}</p>
                <p>Anthropic URL：{prov.anthropicUrl || <span className="text-amber-400">未填写</span>}</p>
              </div>
            );
          })()}
        </section>

        {/* 行为开关（默认折叠） */}
        <CollapsibleSection
          title="行为开关"
          hint="已接入云同步"
          summary={`${countOnToggles(claudeToggles)} / 15 已开启`}
        >
          <p className="text-xs text-zinc-600 -mt-1">
            默认关闭（使用 Claude 默认行为），开启后会写入 settings.json 对应字段。
          </p>

          {/* 权限与默认行为 */}
          <ToggleGroup title="权限 & 默认行为">
            <ToggleRow
              label="默认开启扩展思考"
              hint="alwaysThinkingEnabled = true"
              desc="所有会话默认启用 extended thinking"
              checked={claudeToggles.alwaysThinkingEnabled}
              onChange={(v) => setClaudeToggle('alwaysThinkingEnabled', v)}
            />
            <ToggleRow
              label="自动压缩上下文"
              hint="autoCompactEnabled = true"
              desc="对话接近上下文上限时自动压缩"
              checked={claudeToggles.autoCompactEnabled}
              onChange={(v) => setClaudeToggle('autoCompactEnabled', v)}
            />
            <ToggleRow
              label="文件快照（/rewind）"
              hint="fileCheckpointingEnabled = true"
              desc="为 /rewind 命令保存文件变更快照"
              checked={claudeToggles.fileCheckpointingEnabled}
              onChange={(v) => setClaudeToggle('fileCheckpointingEnabled', v)}
            />
            <ToggleRow
              label="自动记忆（auto memory）"
              hint="autoMemoryEnabled = true"
              desc="跨会话自动记录关键信息"
              checked={claudeToggles.autoMemoryEnabled}
              onChange={(v) => setClaudeToggle('autoMemoryEnabled', v)}
            />
            <ToggleRow
              label="Bypass 权限模式"
              hint="permissions.defaultMode = bypassPermissions"
              desc="跳过所有权限询问（危险，请谨慎）"
              checked={claudeToggles.bypassPermissions}
              onChange={(v) => setClaudeToggle('bypassPermissions', v)}
            />
            <ToggleRow
              label="跳过危险模式提示"
              hint="skipDangerousModePermissionPrompt = true"
              desc="进入危险模式时不弹警告"
              checked={claudeToggles.skipDangerousModePermissionPrompt}
              onChange={(v) => setClaudeToggle('skipDangerousModePermissionPrompt', v)}
            />
            <ToggleRow
              label="跳过 Web 预检"
              hint="skipWebFetchPreflight = true"
              desc="抓取网页前不再弹确认提示"
              checked={claudeToggles.skipWebFetchPreflight}
              onChange={(v) => setClaudeToggle('skipWebFetchPreflight', v)}
            />
            <ToggleRow
              label="关闭 Claude 署名"
              hint="includeCoAuthoredBy = false"
              desc="提交时不附带 'Co-Authored-By: Claude'"
              checked={claudeToggles.includeCoAuthoredByOff}
              onChange={(v) => setClaudeToggle('includeCoAuthoredByOff', v)}
            />
          </ToggleGroup>

          {/* 远程 & 集成 */}
          <ToggleGroup title="远程 & 集成">
            <ToggleRow
              label="禁用远程控制"
              hint="disableRemoteControl = true"
              desc="关闭 Remote Control 通道（隐私/安全）"
              checked={claudeToggles.disableRemoteControl}
              onChange={(v) => setClaudeToggle('disableRemoteControl', v)}
            />
            <ToggleRow
              label="启动即连远程控制"
              hint="remoteControlAtStartup = true"
              desc="每次启动会话自动连接 Remote Control"
              checked={claudeToggles.remoteControlAtStartup}
              onChange={(v) => setClaudeToggle('remoteControlAtStartup', v)}
            />
            <ToggleRow
              label="响应 ! shell 命令"
              hint="respondToBashCommands = true"
              desc="运行 ! 前缀 shell 命令后给出 AI 回应"
              checked={claudeToggles.respondToBashCommands}
              onChange={(v) => setClaudeToggle('respondToBashCommands', v)}
            />
            <ToggleRow
              label="禁用 skills shell 执行"
              hint="disableSkillShellExecution = true"
              desc="skills/commands 中的 ! shell 不被执行"
              checked={claudeToggles.disableSkillShellExecution}
              onChange={(v) => setClaudeToggle('disableSkillShellExecution', v)}
            />
            <ToggleRow
              label="禁用所有 hooks"
              hint="disableAllHooks = true"
              desc="关闭所有 hooks 和 status line"
              checked={claudeToggles.disableAllHooks}
              onChange={(v) => setClaudeToggle('disableAllHooks', v)}
            />
          </ToggleGroup>

          {/* UI & 文件 */}
          <ToggleGroup title="UI & 文件">
            <ToggleRow
              label="减少动画"
              hint="prefersReducedMotion = true"
              desc="降低界面动效强度（无障碍）"
              checked={claudeToggles.prefersReducedMotion}
              onChange={(v) => setClaudeToggle('prefersReducedMotion', v)}
            />
            <ToggleRow
              label="@ 选择器忽略 .gitignore"
              hint="respectGitignore = true"
              desc="@ 文件选择器遵守 .gitignore 规则"
              checked={claudeToggles.respectGitignore}
              onChange={(v) => setClaudeToggle('respectGitignore', v)}
            />
          </ToggleGroup>
        </CollapsibleSection>

        {/* 四个模型变体 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-zinc-400">模型配置</h2>
            <p className="text-xs text-zinc-600">每个变体可独立配置不同模型，留空则使用默认值</p>
          </div>
          {allModels.length === 0 ? (
            <p className="text-xs text-zinc-500">请先在<Link to="/models" className="text-blue-400 hover:underline">模型设置</Link>中添加服务商和模型</p>
          ) : (
            <div className="space-y-3">
              {MODEL_FIELDS.map((f) => (
                <div key={f.key} className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-white">{f.label}</label>
                    <span className="text-[10px] text-zinc-600">{f.desc}</span>
                  </div>
                  <select value={models[f.key]} onChange={(e) => setModels((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="">未配置（使用默认）</option>
                    {allModels.map((m) => {
                      const cap = providers.find((p) => p.modelCapabilities[m.modelId])?.modelCapabilities[m.modelId];
                      return (
                        <option key={m.modelId} value={m.modelId}>
                          {m.label}{cap?.context1M ? ' (1M)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 已管理数据快照 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button onClick={() => setShowSnapshot((s) => !s)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>📦</span>
              <span>查看已管理的数据</span>
              <span className="text-[10px] text-zinc-600">（~/.claude/settings.json）</span>
            </div>
            <span className="text-zinc-500 text-xs">{showSnapshot ? '▾' : '▸'}</span>
          </button>
          {showSnapshot && (
            <div className="px-5 pb-4 pt-1 border-t border-zinc-800 space-y-4">
              {/* env 字段 */}
              <div>
                <p className="text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wider mt-2">env</p>
                {snapshot === null ? (
                  <p className="text-xs text-zinc-600">加载中...</p>
                ) : Object.keys(snapshot).length === 0 ? (
                  <p className="text-xs text-zinc-600">（暂无）</p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(snapshot).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-3 text-xs font-mono">
                        <span className="text-blue-400 shrink-0 min-w-[260px]">{k}</span>
                        <span className="text-zinc-500">=</span>
                        <span className="text-zinc-300 break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 顶层 extras（4 个开关） */}
              <div>
                <p className="text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wider">行为开关</p>
                {snapshotExtras === null ? (
                  <p className="text-xs text-zinc-600">加载中...</p>
                ) : Object.keys(snapshotExtras).length === 0 ? (
                  <p className="text-xs text-zinc-600">（暂无 — 4 个开关均使用 Claude 默认值）</p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(snapshotExtras).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-3 text-xs font-mono">
                        <span className="text-emerald-400 shrink-0 min-w-[260px]">{k}</span>
                        <span className="text-zinc-500">=</span>
                        <span className="text-zinc-300 break-all">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 操作按钮 */}
        <div className="flex justify-between items-center">
          <button onClick={() => configPaths && openEditor(configPaths.claude_settings)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
            📝 打开 settings.json 编辑器
          </button>
          <button onClick={handleSave}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors">
            💾 保存配置
          </button>
        </div>

        {editorError && <p className="text-xs text-red-400">{editorError}</p>}
      </div>

      {/* 编辑器 Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowEditor(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[800px] h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
              <div>
                <h3 className="text-sm font-medium text-white">编辑配置文件</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{editorPath}</p>
              </div>
              <button onClick={() => setShowEditor(false)} className="text-zinc-500 hover:text-white text-lg">✕</button>
            </div>
            <textarea value={editorContent}
              onChange={(e) => { setEditorContent(e.target.value); setEditorDirty(true); setEditorError(''); }}
              className="flex-1 p-4 bg-zinc-950 text-zinc-300 font-mono text-xs leading-relaxed resize-none focus:outline-none" spellCheck={false} />
            <div className="flex justify-between items-center px-5 py-3 border-t border-zinc-800 shrink-0">
              <div className="flex gap-2">
                <button onClick={formatJson} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg">✨ 格式化</button>
                {editorDirty && <span className="text-xs text-zinc-600 self-center">未保存</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowEditor(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg">取消</button>
                <button onClick={saveEditor} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 折叠 section：默认折叠，点击头部展开 */
function CollapsibleSection({
  title,
  hint,
  summary,
  children,
}: {
  title: string;
  hint?: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 py-3 hover:bg-zinc-800/40 transition-colors text-left"
      >
        <span className="text-zinc-500 text-xs w-3 shrink-0">{open ? '▾' : '▸'}</span>
        <span className="text-sm font-medium text-zinc-300">{title}</span>
        {summary && !open && <span className="text-[10px] text-zinc-500 ml-2">{summary}</span>}
        {hint && <span className="text-[10px] text-zinc-600 ml-auto">{hint}</span>}
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4 border-t border-zinc-800">{children}</div>}
    </section>
  );
}

/** 统计 ClaudeToggles 中开启的个数 */
function countOnToggles(t: import('../stores/settingsStore').ClaudeToggles): number {
  return Object.values(t).filter((v) => v === true).length;
}

/** 开关分组标题 */
function ToggleGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** 单行开关：标签 + 描述 + 当前写入值 hint */
function ToggleRow({
  label,
  hint,
  desc,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 bg-zinc-800/40 hover:bg-zinc-800/70 rounded-lg px-3 py-2.5 cursor-pointer transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors mt-0.5 ${
          checked ? 'bg-emerald-500' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-white">{label}</span>
          <code className="text-[10px] text-zinc-500 shrink-0">{hint}</code>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
      </div>
    </label>
  );
}
