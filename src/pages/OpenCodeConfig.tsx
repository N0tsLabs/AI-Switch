import { useState, useEffect } from 'react';
import { useModelStore } from '../stores/modelStore';
import { readOpencodeAgents, writeOpencodeAgents, readFileContent, writeFileContent, getConfigPaths } from '../lib/tauri';
import { CapabilityTags } from '../components/CapabilityTag';
import { useToast } from '../components/useToast';

export default function OpenCodeConfig() {
  const providers = useModelStore((s) => s.providers);

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

      const current = await readOpencodeAgents();
      current.agents = agents;
      current.categories = categories;
      await writeOpencodeAgents(current);
      toast('已保存到 oh-my-openagent.json', 'success');
    } catch (e) {
      toast('保存失败: ' + String(e), 'error');
    }
  };

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
