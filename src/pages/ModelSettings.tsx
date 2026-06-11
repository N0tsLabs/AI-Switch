import { useState } from 'react';
import { useModelStore, type Provider } from '../stores/modelStore';
import { fetchOpenaiModels } from '../lib/tauri';
import { useToast } from '../components/Toast';

function ProviderForm({ onSave, initial }: { onSave: (p: Provider) => void; initial?: Provider }) {
  const [name, setName] = useState(initial?.name || '');
  const [openaiUrl, setOpenaiUrl] = useState(initial?.apiFormat === 'openai' ? (initial?.url || '') : '');
  const [anthropicUrl, setAnthropicUrl] = useState(initial?.apiFormat === 'anthropic' ? (initial?.url || '') : '');
  const [apiKey, setApiKey] = useState(initial?.apiKey || '');

  // 已保存的模型列表
  const [models, setModels] = useState<string[]>(initial?.models || []);
  const [caps, setCaps] = useState(initial?.modelCapabilities || {});

  // 获取到的待选模型列表
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchedSelected, setFetchedSelected] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newModel, setNewModel] = useState('');

  // 获取模型列表（不自动添加，只展示待选）
  const handleFetchModels = async () => {
    if (!openaiUrl) { setError('请先填写 OpenAI 格式 URL'); return; }
    setLoading(true);
    setError('');
    setFetchedModels([]);
    setFetchedSelected(new Set());
    try {
      const result = await fetchOpenaiModels(openaiUrl, apiKey);
      if (result.error) {
        setError(result.error);
      } else {
        const ids = result.models.map((m) => m.id);
        setFetchedModels(ids);
        // 默认全选未添加的
        const alreadyAdded = new Set(models);
        setFetchedSelected(new Set(ids.filter((id) => !alreadyAdded.has(id))));
      }
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // 切换待选模型的勾选
  const toggleFetched = (id: string) => {
    setFetchedSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 全选/取消全选待选模型
  const toggleAllFetched = () => {
    const alreadyAdded = new Set(models);
    const selectable = fetchedModels.filter((id) => !alreadyAdded.has(id));
    if (fetchedSelected.size === selectable.length) {
      setFetchedSelected(new Set());
    } else {
      setFetchedSelected(new Set(selectable));
    }
  };

  // 把勾选的待选模型添加到已保存列表
  const addSelected = () => {
    const toAdd = fetchedSelected.size > 0
      ? [...fetchedSelected]
      : fetchedModels.filter((id) => !models.includes(id));
    const newModels = [...models];
    const newCaps = { ...caps };
    toAdd.forEach((id) => {
      if (!newModels.includes(id)) {
        newModels.push(id);
        if (!newCaps[id]) {
          newCaps[id] = { modelId: id, supportsImage: false, supportsVideo: false, context1M: false };
        }
      }
    });
    setModels(newModels);
    setCaps(newCaps);
    // 清空待选
    setFetchedModels([]);
    setFetchedSelected(new Set());
  };

  // 手动添加
  const addManualModel = () => {
    if (!newModel.trim()) return;
    if (!models.includes(newModel.trim())) {
      setModels([...models, newModel.trim()]);
      setCaps((prev) => ({
        ...prev,
        [newModel.trim()]: { modelId: newModel.trim(), supportsImage: false, supportsVideo: false, context1M: false },
      }));
    }
    setNewModel('');
  };

  const removeModel = (id: string) => {
    setModels(models.filter((m) => m !== id));
    setCaps((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const toggleCap = (modelId: string, key: 'supportsImage' | 'supportsVideo' | 'context1M') => {
    setCaps((prev) => {
      const existing = prev[modelId] || { modelId, supportsImage: false, supportsVideo: false, context1M: false };
      return { ...prev, [modelId]: { ...existing, [key]: !existing[key] } };
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const url = openaiUrl || anthropicUrl;
    const apiFormat = openaiUrl ? 'openai' : 'anthropic';
    onSave({
      id: initial?.id || '',
      name: name.trim(),
      apiFormat,
      url,
      apiKey,
      models,
      modelCapabilities: caps,
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      {/* 名称 */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">服务商名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 OpenAI、Anthropic、自定义"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
      </div>

      {/* 双 URL */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">OpenAI 格式 URL <span className="text-zinc-600">（支持读取模型列表）</span></label>
          <input value={openaiUrl} onChange={(e) => setOpenaiUrl(e.target.value)} placeholder="https://api.openai.com"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Anthropic 格式 URL <span className="text-zinc-600">（填写任一即可）</span></label>
          <input value={anthropicUrl} onChange={(e) => setAnthropicUrl(e.target.value)} placeholder="https://api.anthropic.com"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">API Key</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
      </div>

      {/* 上下文长度（仅 Anthropic 格式） */}
      {anthropicUrl && (
        <p className="text-[10px] text-zinc-600">Anthropic 模型支持勾选 1M 上下文，模型名会自动拼接 [1M] 后缀</p>
      )}

      {/* 读取模型列表 */}
      <div className="flex gap-2 items-center">
        <button onClick={handleFetchModels} disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white text-sm rounded-lg transition-colors">
          {loading ? '读取中...' : '📡 读取模型列表'}
        </button>
        {!openaiUrl && <span className="text-xs text-zinc-600">需填写 OpenAI 格式 URL 才能读取</span>}
        {error && <span className="text-xs text-red-400 truncate max-w-md">{error}</span>}
      </div>

      {/* 待选模型列表（获取后展示） */}
      {fetchedModels.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">从 API 获取到 {fetchedModels.length} 个模型，勾选要添加的：</span>
            <button onClick={toggleAllFetched} className="text-xs text-blue-400 hover:text-blue-300">
              {fetchedSelected.size === fetchedModels.filter((id) => !models.includes(id)).length ? '取消全选' : '全选未添加'}
            </button>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {fetchedModels.map((m) => {
              const alreadyAdded = models.includes(m);
              return (
                <label key={m} className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                  alreadyAdded ? 'text-zinc-600' : fetchedSelected.has(m) ? 'bg-blue-500/10 text-blue-300' : 'hover:bg-zinc-700/30 text-zinc-400'
                }`}>
                  <input type="checkbox" disabled={alreadyAdded}
                    checked={alreadyAdded || fetchedSelected.has(m)}
                    onChange={() => toggleFetched(m)}
                    className="accent-blue-500 rounded" />
                  <span className="font-mono truncate">{m}</span>
                  {alreadyAdded && <span className="text-zinc-600">已添加</span>}
                </label>
              );
            })}
          </div>
          <button onClick={addSelected} disabled={fetchedSelected.size === 0}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white text-xs rounded-lg transition-colors">
            添加选中的 {fetchedSelected.size} 个模型
          </button>
        </div>
      )}

      {/* 手动添加 */}
      <div className="flex gap-2">
        <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="手动添加模型 ID"
          onKeyDown={(e) => e.key === 'Enter' && addManualModel()}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
        <button onClick={addManualModel}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors">
          添加
        </button>
      </div>

      {/* 已保存的模型列表 */}
      {models.length > 0 && (
        <div>
          <label className="block text-xs text-zinc-500 mb-2">已保存的模型（配置图片/视频支持）</label>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {models.map((m) => (
              <div key={m} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
                <span className="flex-1 text-sm text-zinc-300 truncate">{m}</span>
                <label className="flex items-center gap-1 text-xs text-zinc-500 cursor-pointer">
                  <input type="checkbox" checked={caps[m]?.supportsImage || false}
                    onChange={() => toggleCap(m, 'supportsImage')} className="rounded border-zinc-600" />
                  图片
                </label>
                <label className="flex items-center gap-1 text-xs text-zinc-500 cursor-pointer">
                  <input type="checkbox" checked={caps[m]?.supportsVideo || false}
                    onChange={() => toggleCap(m, 'supportsVideo')} className="rounded border-zinc-600" />
                  视频
                </label>
                <label className="flex items-center gap-1 text-xs text-zinc-500 cursor-pointer">
                  <input type="checkbox" checked={caps[m]?.context1M || false}
                    onChange={() => toggleCap(m, 'context1M')} className="rounded border-zinc-600" />
                  1M
                </label>
                <button onClick={() => removeModel(m)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={!name.trim() || (!openaiUrl && !anthropicUrl)}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white text-sm rounded-lg transition-colors">
          保存
        </button>
      </div>
    </div>
  );
}

export default function ModelSettings() {
  const { providers, addProvider, updateProvider, removeProvider, saveToStorage } = useModelStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const handleSave = (p: Provider) => {
    if (editing) { updateProvider(editing, p); }
    else { addProvider({ ...p, id: '' }); }
    setEditing(null);
    setShowNew(false);
    saveToStorage();
    toast('服务商已保存', 'success');
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-1">模型设置</h1>
      <p className="text-zinc-500 text-sm mb-8">配置 AI 服务商和模型，设置图片/视频支持能力</p>
      <div className="space-y-4">
        {providers.map((p) => (
          <div key={p.id}>
            {editing === p.id ? (
              <ProviderForm initial={p} onSave={handleSave} />
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{p.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{p.apiFormat === 'openai' ? 'OpenAI' : 'Anthropic'}</span>
                    <span className="text-xs text-zinc-600">{p.models.length} 模型</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 truncate max-w-lg">{p.url}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(p.id)} className="text-xs text-zinc-400 hover:text-white px-2 py-1">编辑</button>
                  <button onClick={() => { removeProvider(p.id); saveToStorage(); }} className="text-xs text-zinc-400 hover:text-red-400 px-2 py-1">删除</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {showNew ? (
          <ProviderForm onSave={handleSave} />
        ) : (
          <button onClick={() => setShowNew(true)} className="w-full border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-4 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            + 添加服务商
          </button>
        )}
      </div>
    </div>
  );
}
