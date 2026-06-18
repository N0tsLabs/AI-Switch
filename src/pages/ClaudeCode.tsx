import { useState, useEffect } from 'react';
import { useModelStore } from '../stores/modelStore';
import { readClaudeSettings, writeClaudeSettings, readFileContent, writeFileContent, getConfigPaths } from '../lib/tauri';
import { useToast } from '../components/useToast';

const MODEL_FIELDS = [
  { key: 'default', envKey: 'ANTHROPIC_MODEL', label: '默认模型', desc: '主模型，未指定时使用' },
  { key: 'sonnet', envKey: 'ANTHROPIC_DEFAULT_SONNET_MODEL', label: 'Sonnet 模型', desc: '中等能力，平衡速度与质量' },
  { key: 'opus', envKey: 'ANTHROPIC_DEFAULT_OPUS_MODEL', label: 'Opus 模型', desc: '最强能力，适合复杂任务' },
  { key: 'haiku', envKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', label: 'Haiku 模型', desc: '最快最省，适合简单任务' },
] as const;

export default function ClaudeCode() {
  const providers = useModelStore((s) => s.providers);

  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<Record<string, string>>({ default: '', sonnet: '', opus: '', haiku: '' });
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
    readClaudeSettings()
      .then((settings) => {
        const env = (settings.env as Record<string, string>) || {};
        setApiUrl(env.ANTHROPIC_BASE_URL || '');
        setApiKey(env.ANTHROPIC_AUTH_TOKEN || '');
        setModels({
          default: env.ANTHROPIC_MODEL || '',
          sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
          opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
          haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allModels = providers.flatMap((p) =>
    p.models.map((m) => ({ label: `${p.name} / ${m}`, modelId: m }))
  );

  const updateModel = (key: string, value: string) => {
    setModels((prev) => ({ ...prev, [key]: value }));
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
      const current = await readClaudeSettings();
      const env = (current.env as Record<string, string>) || {};
      env.ANTHROPIC_BASE_URL = apiUrl;
      env.ANTHROPIC_AUTH_TOKEN = apiKey;
      env.ANTHROPIC_MODEL = resolveModelName(models.default);
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolveModelName(models.sonnet);
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolveModelName(models.opus);
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolveModelName(models.haiku);
      current.env = env;
      await writeClaudeSettings(current);
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
      <h1 className="text-2xl font-bold text-white mb-1">🟣 Claude Code</h1>
      <p className="text-zinc-500 text-sm mb-8">配置 API 地址和各模型变体</p>

      <div className="space-y-6">
        {/* API 设置 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-medium text-zinc-400">API 设置</h2>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">API Base URL</label>
            <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.anthropic.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
        </section>

        {/* 四个模型变体 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-zinc-400">模型配置</h2>
              <p className="text-xs text-zinc-600">每个变体可独立配置不同模型，留空则使用默认值</p>
            </div>
            {/* 一键切换服务商 */}
            {providers.length > 0 && (
              <select onChange={(e) => {
                const provider = providers.find((p) => p.id === e.target.value);
                if (provider && provider.models.length > 0) {
                  const model = provider.models[0];
                  setModels({ default: model, sonnet: model, opus: model, haiku: model });
                }
                e.target.value = '';
              }} defaultValue=""
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500">
                <option value="" disabled>🔄 切换服务商</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}（{p.models.length} 个模型）</option>
                ))}
              </select>
            )}
          </div>
          {allModels.length === 0 ? (
            <p className="text-xs text-zinc-500">请先在<a href="/models" className="text-blue-400 hover:underline">模型设置</a>中添加服务商和模型</p>
          ) : (
            <div className="space-y-3">
              {MODEL_FIELDS.map((f) => (
                <div key={f.key} className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-white">{f.label}</label>
                    <span className="text-[10px] text-zinc-600">{f.desc}</span>
                  </div>
                  <select value={models[f.key]} onChange={(e) => updateModel(f.key, e.target.value)}
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
