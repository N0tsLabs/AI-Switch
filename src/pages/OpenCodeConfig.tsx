import { useState, useEffect } from 'react';
import { useModelStore } from '../stores/modelStore';
import { useSettingsStore, type OpenCodeToggles } from '../stores/settingsStore';
import {
  readOpencodeAgents,
  mergeOpencodeManaged,
  extractOpencodeManaged,
  mergeOpencodeExtras,
  readOpencodeConfig,
  readFileContent,
  writeFileContent,
  getConfigPaths,
  type ExtraOp,
} from '../lib/tauri';
import { CapabilityTags } from '../components/CapabilityTag';
import { useToast } from '../components/useToast';

export default function OpenCodeConfig() {
  const providers = useModelStore((s) => s.providers);
  const opencodeToggles = useSettingsStore((s) => s.opencode);
  const setOpencodeToggle = useSettingsStore((s) => s.setOpencodeToggle);

  // 已添加的模型 ID 列表（能力从 modelStore 读取）
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // 编辑器
  const [showEditor, setShowEditor] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editorPath, setEditorPath] = useState('');
  const [editorError, setEditorError] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [configPaths, setConfigPaths] = useState<import('../lib/tauri').ConfigPaths | null>(null);

  // 已管理数据快照（agents + categories）
  const [snapshot, setSnapshot] = useState<{
    agents: Record<string, unknown> | null;
    categories: Record<string, unknown> | null;
  } | null>(null);
  const [showSnapshot, setShowSnapshot] = useState(false);

  const refreshSnapshot = async () => {
    try {
      const data = await extractOpencodeManaged();
      setSnapshot(data);
    } catch {
      setSnapshot({ agents: null, categories: null });
    }
  };

  useEffect(() => {
    getConfigPaths().then(setConfigPaths).catch(() => {});
    readOpencodeAgents()
      .then((agents) => {
        const agentMap = (agents.agents as Record<string, unknown>) || {};
        const ids: string[] = [];
        Object.values(agentMap).forEach((agent: unknown) => {
          const a = agent as Record<string, unknown>;
          const modelStr = (a.model as string) || '';
          const rawId = modelStr.replace(/^(opencode|openai)\//, '');
          const modelId = rawId.replace(/\[.*?\]$/, '').trim();
          if (modelId && !ids.includes(modelId)) ids.push(modelId);
        });
        setModelIds(ids);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    refreshSnapshot();
  }, []);

  // 从 modelStore 获取模型的能力信息
  const getModelCap = (modelId: string) => {
    for (const p of providers) {
      if (p.modelCapabilities[modelId]) return p.modelCapabilities[modelId];
    }
    return null;
  };

  // 所有可用模型（从 modelStore 读取）
  const allModels = providers.flatMap((p) =>
    p.models.map((m) => {
      const cap = p.modelCapabilities[m];
      return {
        providerId: p.id,
        modelId: m,
        label: `${p.name} / ${m}`,
        supportsImage: cap?.supportsImage || false,
        supportsVideo: cap?.supportsVideo || false,
        context1M: cap?.context1M || false,
      };
    })
  );

  const addModel = (modelId: string) => {
    if (!modelIds.includes(modelId)) setModelIds([...modelIds, modelId]);
  };

  const removeModel = (modelId: string) => {
    setModelIds(modelIds.filter((m) => m !== modelId));
  };

  // 保存到 oh-my-openagent.json
  const handleSave = async () => {
    try {
      const agents: Record<string, unknown> = {};
      const categories: Record<string, unknown> = {};

      modelIds.forEach((modelId, i) => {
        const agentName = i === 0 ? 'primary' : `agent-${i}`;
        const cap = getModelCap(modelId);
        const modelStr = `opencode/${modelId}`;
        agents[agentName] = {
          model: modelStr,
          ...(cap?.supportsImage ? { supports_image: true } : {}),
          ...(cap?.supportsVideo ? { supports_video: true } : {}),
          ...(cap?.context1M ? { context_length: '1M' } : {}),
          fallback_models: modelIds
            .filter((m) => m !== modelId)
            .slice(0, 2)
            .map((m) => ({ model: `opencode/${m}` })),
        };
      });

      if (modelIds.length > 0) {
        categories['default'] = {
          model: `opencode/${modelIds[0]}`,
          fallback_models: modelIds.slice(1, 3).map((m) => ({ model: `opencode/${m}` })),
        };
      }

      // 1. 用 key-level merge：仅合并 agents + categories，保留其他顶层字段
      await mergeOpencodeManaged({ agents, categories });

      // 2. 写入 3 个行为开关（snapshot / share / autoupdate）
      //    snapshot=true → 写入 true；snapshot=false → 删除 key（OpenCode 默认 true）
      //    share 默认 manual；设置为 manual 时移除 key
      const t = opencodeToggles;
      const extras: ExtraOp[] = [
        {
          path: ['snapshot'],
          value: t.snapshot ? true : null,
        },
        {
          path: ['share'],
          value: t.share === 'manual' ? null : t.share,
        },
        {
          path: ['autoupdate'],
          value: t.autoupdate === 'on' ? null : t.autoupdate,
        },
      ];
      await mergeOpencodeExtras(extras);

      await refreshSnapshot();
      toast('已保存到 oh-my-openagent.json', 'success');
    } catch (e) {
      toast('保存失败: ' + String(e), 'error');
    }
  };

  /** 首次打开时从 opencode.json 推断 3 个开关状态（仅在 store 全为默认时） */
  useEffect(() => {
    const isDefault =
      opencodeToggles.snapshot === false &&
      opencodeToggles.share === 'manual' &&
      opencodeToggles.autoupdate === 'on';
    if (!isDefault) return;
    readOpencodeConfig()
      .then((cfg: Record<string, unknown>) => {
        if (cfg.snapshot === false) setOpencodeToggle('snapshot', false);
        if (cfg.share === 'auto' || cfg.share === 'disabled') {
          setOpencodeToggle('share', cfg.share);
        }
        if (cfg.autoupdate === false || cfg.autoupdate === 'notify') {
          setOpencodeToggle('autoupdate', cfg.autoupdate);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 编辑器
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
      setEditorDirty(false);
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
      <h1 className="text-2xl font-bold text-white mb-1">🟢 OpenCode</h1>
      <p className="text-zinc-500 text-sm mb-8">添加/移除模型，能力配置在模型设置中统一管理</p>

      <div className="space-y-6">
        {/* 已添加的模型 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">已添加模型</h2>
          {modelIds.length === 0 ? (
            <p className="text-xs text-zinc-600">暂无模型，请从下方可用模型中添加</p>
          ) : (
            <div className="space-y-1">
              {modelIds.map((modelId) => {
                const cap = getModelCap(modelId);
                return (
                  <div key={modelId}
                    className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2.5">
                    <span className="flex-1 text-sm text-zinc-300 truncate">{modelId}</span>
                    {/* 能力标签（只读，来自模型设置） */}
                    <CapabilityTags cap={cap} />
                    <button onClick={() => removeModel(modelId)}
                      className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-zinc-600">模型的图片/视频/上下文能力在「模型设置」中统一配置</p>
        </section>

        {/* 可用模型 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">可用模型（点击添加）</h2>
          {allModels.length === 0 ? (
            <p className="text-xs text-zinc-500">请先在<a href="/models" className="text-blue-400 hover:underline">模型设置</a>中添加服务商</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {allModels.map((m) => {
                const selected = modelIds.includes(m.modelId);
                return (
                  <button key={m.modelId} disabled={selected}
                    onClick={() => addModel(m.modelId)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      selected ? 'bg-emerald-500/10 text-emerald-400 cursor-default' : 'hover:bg-zinc-800/50 text-zinc-300 cursor-pointer'
                    }`}>
                    <span className="flex-1 truncate">{m.label}</span>
                    <div className="flex items-center gap-1.5">
                      {m.supportsImage && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">图片</span>}
                      {m.supportsVideo && <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded">视频</span>}
                      {m.context1M && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">1M</span>}
                    </div>
                    {selected && <span className="text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* OpenCode 行为开关（已接入云同步，默认折叠） */}
        <OpenCodeTogglesSection toggles={opencodeToggles} setToggle={setOpencodeToggle} />

        {/* 已管理数据快照 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button onClick={() => setShowSnapshot((s) => !s)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>📦</span>
              <span>查看已管理的模型数据</span>
              <span className="text-[10px] text-zinc-600">（oh-my-openagent.json → agents + categories）</span>
            </div>
            <span className="text-zinc-500 text-xs">{showSnapshot ? '▾' : '▸'}</span>
          </button>
          {showSnapshot && (
            <div className="px-5 pb-4 pt-1 border-t border-zinc-800">
              {snapshot === null ? (
                <p className="text-xs text-zinc-600 py-2">加载中...</p>
              ) : (
                <div className="space-y-4 mt-2">
                  {/* agents */}
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wider">agents</p>
                    {!snapshot.agents || Object.keys(snapshot.agents).length === 0 ? (
                      <p className="text-xs text-zinc-600">（空）</p>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(snapshot.agents).map(([name, agent]) => {
                          const a = agent as Record<string, unknown>;
                          const model = (a.model as string) || '';
                          const caps: string[] = [];
                          if (a.supports_image) caps.push('图片');
                          if (a.supports_video) caps.push('视频');
                          if (a.context_length) caps.push(`ctx=${a.context_length}`);
                          const fallbacks = (a.fallback_models as Array<{ model: string }>) || [];
                          return (
                            <div key={name} className="text-xs font-mono bg-zinc-800/40 rounded-lg px-3 py-2">
                              <div className="flex items-baseline gap-2">
                                <span className="text-emerald-400 shrink-0 min-w-[100px]">{name}</span>
                                <span className="text-zinc-500">→</span>
                                <span className="text-zinc-200">{model}</span>
                                {caps.length > 0 && (
                                  <span className="text-zinc-600 text-[10px]">（{caps.join(' · ')}）</span>
                                )}
                              </div>
                              {fallbacks.length > 0 && (
                                <p className="text-[10px] text-zinc-600 mt-1 pl-[112px]">
                                  fallback: {fallbacks.map((f) => f.model).join(', ')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* categories */}
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wider">categories</p>
                    {!snapshot.categories || Object.keys(snapshot.categories).length === 0 ? (
                      <p className="text-xs text-zinc-600">（空）</p>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(snapshot.categories).map(([name, cat]) => {
                          const c = cat as Record<string, unknown>;
                          const model = (c.model as string) || '';
                          const fallbacks = (c.fallback_models as Array<{ model: string }>) || [];
                          return (
                            <div key={name} className="text-xs font-mono bg-zinc-800/40 rounded-lg px-3 py-2">
                              <div className="flex items-baseline gap-2">
                                <span className="text-emerald-400 shrink-0 min-w-[100px]">{name}</span>
                                <span className="text-zinc-500">→</span>
                                <span className="text-zinc-200">{model}</span>
                              </div>
                              {fallbacks.length > 0 && (
                                <p className="text-[10px] text-zinc-600 mt-1 pl-[112px]">
                                  fallback: {fallbacks.map((f) => f.model).join(', ')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 操作按钮 */}
        <div className="flex justify-between items-center">
          <button onClick={() => configPaths && openEditor(configPaths.opencode_agents)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
            📝 打开 oh-my-openagent.json 编辑器
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

/** OpenCode 行为开关：默认折叠，点击头部展开 */
function OpenCodeTogglesSection({
  toggles,
  setToggle,
}: {
  toggles: OpenCodeToggles;
  setToggle: <K extends keyof OpenCodeToggles>(key: K, value: OpenCodeToggles[K]) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = `snapshot ${toggles.snapshot ? 'on' : 'off'} · share ${toggles.share} · autoupdate ${toggles.autoupdate}`;
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 py-3 hover:bg-zinc-800/40 transition-colors text-left"
      >
        <span className="text-zinc-500 text-xs w-3 shrink-0">{open ? '▾' : '▸'}</span>
        <span className="text-sm font-medium text-zinc-300">行为开关</span>
        {!open && <span className="text-[10px] text-zinc-500 ml-2 truncate">{summary}</span>}
        <span className="text-[10px] text-zinc-600 ml-auto">已接入云同步</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-600 -mt-1">
            写入 oh-my-openagent.json 顶层字段。已接入云同步。
          </p>

          {/* snapshot — bool 开关 */}
          <label className="flex items-start gap-3 bg-zinc-800/40 hover:bg-zinc-800/70 rounded-lg px-3 py-2.5 cursor-pointer transition-colors">
            <button
              type="button"
              role="switch"
              aria-checked={toggles.snapshot}
              onClick={() => setToggle('snapshot', !toggles.snapshot)}
              className={`relative shrink-0 w-9 h-5 rounded-full transition-colors mt-0.5 ${
                toggles.snapshot ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                toggles.snapshot ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-white">启用文件变更快照</span>
                <code className="text-[10px] text-zinc-500 shrink-0">snapshot = true/false</code>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">关闭后无法回滚文件改动。关闭时从配置中移除 key（OpenCode 默认 true）。</p>
            </div>
          </label>

          {/* share — 三态 */}
          <SegmentRow
            label="会话分享模式"
            hint="share = manual/auto/disabled"
            desc="manual：手动分享；auto：自动分享；disabled：禁用分享"
            value={toggles.share}
            options={[
              { value: 'manual', label: '手动' },
              { value: 'auto', label: '自动' },
              { value: 'disabled', label: '禁用' },
            ]}
            onChange={(v) => setToggle('share', v as OpenCodeToggles['share'])}
          />

          {/* autoupdate — 三态 */}
          <SegmentRow
            label="自动更新"
            hint="autoupdate = true/false/notify"
            desc="true：自动升级；notify：仅通知；false：禁用更新"
            value={toggles.autoupdate}
            options={[
              { value: 'on', label: '启用' },
              { value: 'notify', label: '通知' },
              { value: 'off', label: '禁用' },
            ]}
            onChange={(v) => setToggle('autoupdate', v as OpenCodeToggles['autoupdate'])}
          />
        </div>
      )}
    </section>
  );
}

/** 三态/多态控件：标签 + 描述 + 一行选项 */
function SegmentRow<T extends string>({
  label,
  hint,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  desc: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-start gap-3 bg-zinc-800/40 rounded-lg px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-white">{label}</span>
          <code className="text-[10px] text-zinc-500 shrink-0">{hint}</code>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
        <div className="inline-flex gap-1 mt-2 p-0.5 bg-zinc-900/60 rounded-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                value === opt.value
                  ? 'bg-emerald-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
