import { useState } from 'react';
import { useModelStore, type Provider, type ApiKey, getActiveKeyValue } from '../stores/modelStore';
import { fetchOpenaiModels, testProviderUrl, type TestResult } from '../lib/tauri';
import { useToast } from '../components/useToast';
import { ApiKeyEditor } from '../components/ApiKeyEditor';

function ProviderForm({ onSave, initial }: { onSave: (p: Provider) => void; initial?: Provider }) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name || '');
  // 双 URL 字段：Anthropic 用于 ClaudeCode，OpenAI 用于 OpenCode
  // 旧版 Provider 有单一 url 字段，从这里迁移到对应格式
  const initAnthropicUrl = initial?.anthropicUrl
    ?? (initial?.apiFormat === 'anthropic' ? initial?.url : '')
    ?? '';
  const initOpenaiUrl = initial?.openaiUrl
    ?? (initial?.apiFormat === 'openai' ? initial?.url : '')
    ?? '';
  const [anthropicUrl, setAnthropicUrl] = useState(initAnthropicUrl);
  const [openaiUrl, setOpenaiUrl] = useState(initOpenaiUrl);

  // 多 Key 管理：本地草稿状态，保存时整体交给 onSave
  const [keys, setKeys] = useState<ApiKey[]>(initial?.apiKeys ?? []);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(
    initial?.selectedKeyId ?? keys[0]?.id ?? null,
  );
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null); // null = 关闭
  const [isNewKey, setIsNewKey] = useState(false);

  // 已保存的模型列表
  const [models, setModels] = useState<string[]>(initial?.models || []);
  const [caps, setCaps] = useState(initial?.modelCapabilities || {});

  // 获取到的待选模型列表
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchedSelected, setFetchedSelected] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newModel, setNewModel] = useState('');

  // URL 连通性测试状态
  const [openaiTest, setOpenaiTest] = useState<'idle' | 'testing' | TestResult>('idle');
  const [anthropicTest, setAnthropicTest] = useState<'idle' | 'testing' | TestResult>('idle');

  const handleTestUrl = async (format: 'openai' | 'anthropic') => {
    const targetUrl = format === 'openai' ? openaiUrl : anthropicUrl;
    if (!targetUrl) {
      toast('请先填写 URL', 'error');
      return;
    }
    const activeKey = keys.find((k) => k.id === selectedKeyId)?.value ?? '';
    if (!activeKey) {
      toast('请先添加并选中一个 API Key', 'error');
      return;
    }
    const setter = format === 'openai' ? setOpenaiTest : setAnthropicTest;
    setter('testing');
    try {
      const firstModel = models[0];
      const result = await testProviderUrl(targetUrl, activeKey, format, firstModel);
      setter(result);
      // 记录到 key 上（成功）
      setKeys((prev) => prev.map((k) =>
        k.id === selectedKeyId
          ? { ...k, lastTestOk: result.ok, lastTestAt: Date.now(), lastTestMessage: result.message }
          : k,
      ));
    } catch (e) {
      const failed: TestResult = { ok: false, status: 0, message: String(e), latencyMs: 0 };
      setter(failed);
      // 失败也要更新 key 的测试状态（对称）
      setKeys((prev) => prev.map((k) =>
        k.id === selectedKeyId
          ? { ...k, lastTestOk: false, lastTestAt: Date.now(), lastTestMessage: failed.message }
          : k,
      ));
    }
  };

  // 获取模型列表（OpenAI 端点专用）
  const handleFetchModels = async () => {
    if (!openaiUrl) { setError('请先填写 OpenAI 格式 URL'); return; }
    const activeKey = keys.find((k) => k.id === selectedKeyId)?.value ?? '';
    if (!activeKey) { setError('请先添加并选中一个 API Key'); return; }
    setLoading(true);
    setError('');
    setFetchedModels([]);
    setFetchedSelected(new Set());
    try {
      const result = await fetchOpenaiModels(openaiUrl, activeKey);
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
    onSave({
      id: initial?.id || '',
      name: name.trim(),
      anthropicUrl: anthropicUrl.trim() || undefined,
      openaiUrl: openaiUrl.trim() || undefined,
      apiKeys: keys,
      selectedKeyId,
      models,
      modelCapabilities: caps,
    });
  };

  // Key 操作辅助
  const saveKey = (k: Omit<ApiKey, 'createdAt'>) => {
    if (isNewKey) {
      const newKey: ApiKey = {
        ...k,
        id: `k-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
      };
      const nextKeys = [...keys, newKey];
      setKeys(nextKeys);
      // 新建的第一个 Key 自动设为默认
      if (nextKeys.length === 1 || !selectedKeyId) setSelectedKeyId(newKey.id);
    } else {
      // 编辑现有：清除旧的连通性测试结果（key 内容已变，旧的 ✓/✗ 不再可信）
      setKeys((prev) => prev.map((x) =>
        x.id === k.id
          ? { ...x, label: k.label, value: k.value, lastTestOk: undefined, lastTestAt: undefined, lastTestMessage: undefined }
          : x,
      ));
    }
    setEditingKey(null);
    setIsNewKey(false);
  };

  const removeKey = (id: string) => {
    setKeys((prev) => {
      const next = prev.filter((k) => k.id !== id);
      // 若删的是激活 key，自动切到第一个剩余
      if (id === selectedKeyId) {
        setSelectedKeyId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const setActiveKey = (id: string) => setSelectedKeyId(id);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      {/* 名称 */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">服务商名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 OpenAI、Anthropic、自定义"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
      </div>

      {/* 双 URL：OpenAI 用于 OpenCode，Anthropic 用于 ClaudeCode。按需填写 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            OpenAI 格式 URL <span className="text-zinc-600">（用于 OpenCode）</span>
          </label>
          <div className="flex gap-2">
            <input value={openaiUrl} onChange={(e) => setOpenaiUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            <button type="button" onClick={() => handleTestUrl('openai')}
              disabled={!openaiUrl || openaiTest === 'testing'}
              className="shrink-0 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs rounded-lg transition-colors">
              {openaiTest === 'testing' ? '测试中…' : '测试'}
            </button>
          </div>
          <TestResultRow result={openaiTest} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Anthropic 格式 URL <span className="text-zinc-600">（用于 Claude Code）</span>
          </label>
          <div className="flex gap-2">
            <input value={anthropicUrl} onChange={(e) => setAnthropicUrl(e.target.value)}
              placeholder="https://api.anthropic.com"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            <button type="button" onClick={() => handleTestUrl('anthropic')}
              disabled={!anthropicUrl || anthropicTest === 'testing'}
              className="shrink-0 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs rounded-lg transition-colors">
              {anthropicTest === 'testing' ? '测试中…' : '测试'}
            </button>
          </div>
          <TestResultRow result={anthropicTest} />
        </div>
      </div>
      <p className="text-[10px] text-zinc-600 -mt-2">按需填写：只填 ClaudeCode 要用的填 Anthropic URL，只填 OpenCode 要用的填 OpenAI URL。一个服务商可同时填两个。</p>

      {/* API Key 列表（多 key + 默认 key，可切换） */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs text-zinc-500">API Key 列表</label>
          <button type="button"
            onClick={() => { setIsNewKey(true); setEditingKey({ id: '', label: '', value: '', createdAt: 0 }); }}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] rounded transition-colors">
            + 添加新 Key
          </button>
        </div>
        {keys.length === 0 ? (
          <p className="text-xs text-zinc-600 py-3 text-center bg-zinc-800/30 rounded-lg">
            尚未添加任何 Key，点击右上方「+ 添加」
          </p>
        ) : (
          <div className="space-y-1.5">
            {keys.map((k) => {
              const isActive = k.id === selectedKeyId;
              return (
                <div key={k.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  isActive
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-zinc-800/40 border-zinc-700'
                }`}>
                  <span className="text-base shrink-0">🔑</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white truncate">{k.label}</span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                          默认
                        </span>
                      )}
                      {k.lastTestOk !== undefined && (
                        <span className={`text-[10px] shrink-0 ${k.lastTestOk ? 'text-emerald-400' : 'text-red-400'}`}>
                          {k.lastTestOk ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-600 truncate font-mono">
                      {k.value.slice(0, 8)}…{k.value.slice(-4)}
                    </p>
                  </div>
                  {!isActive && (
                    <button type="button" onClick={() => setActiveKey(k.id)}
                      className="shrink-0 px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] rounded">
                      设为默认
                    </button>
                  )}
                  <button type="button" onClick={() => { setIsNewKey(false); setEditingKey(k); }}
                    className="shrink-0 text-zinc-500 hover:text-white px-1.5" title="编辑">
                    ✎
                  </button>
                  <button type="button" onClick={() => removeKey(k.id)}
                    className="shrink-0 text-zinc-500 hover:text-red-400 px-1.5" title="删除">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 上下文长度提示（仅 Anthropic） */}
      {anthropicUrl && (
        <p className="text-[10px] text-zinc-600 -mt-2">Anthropic 模型支持勾选 1M 上下文，模型名会自动拼接 [1M] 后缀</p>
      )}

      {/* 读取模型列表（OpenAI 端点） */}
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
        <button onClick={handleSave} disabled={!name.trim() || (!anthropicUrl && !openaiUrl)}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white text-sm rounded-lg transition-colors">
          保存
        </button>
      </div>

      {/* Key 编辑弹窗 */}
      {editingKey && (
        <ApiKeyEditor
          provider={{ ...initial, anthropicUrl, openaiUrl } as Provider}
          existing={isNewKey ? null : editingKey}
          otherLabels={keys.filter((k) => k.id !== editingKey.id).map((k) => k.label)}
          onSave={saveKey}
          onCancel={() => { setEditingKey(null); setIsNewKey(false); }}
        />
      )}
    </div>
  );
}

export default function ModelSettings() {
  const { providers, addProvider, updateProvider, removeProvider, saveToStorage } = useModelStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // 列表里每个 URL 的测试状态：{ providerId: 'idle' | 'testing' | TestResult }
  const [openaiTests, setOpenaiTests] = useState<Record<string, 'idle' | 'testing' | TestResult>>({});
  const [anthropicTests, setAnthropicTests] = useState<Record<string, 'idle' | 'testing' | TestResult>>({});

  const handleTestListUrl = async (
    providerId: string,
    p: Provider,
    format: 'openai' | 'anthropic',
  ) => {
    const targetUrl = format === 'openai' ? p.openaiUrl : p.anthropicUrl;
    if (!targetUrl) return;
    const setter = format === 'openai' ? setOpenaiTests : setAnthropicTests;
    setter((prev) => ({ ...prev, [providerId]: 'testing' }));
    try {
      const result = await testProviderUrl(targetUrl, getActiveKeyValue(p), format, p.models[0]);
      setter((prev) => ({ ...prev, [providerId]: result }));
    } catch (e) {
      setter((prev) => ({
        ...prev,
        [providerId]: { ok: false, status: 0, message: String(e), latencyMs: 0 },
      }));
    }
  };

  /** 测一个 provider 的所有 URL（并行） */
  const handleTestAll = (p: Provider) => {
    if (p.openaiUrl) handleTestListUrl(p.id, p, 'openai');
    if (p.anthropicUrl) handleTestListUrl(p.id, p, 'anthropic');
  };

  /** 任意 URL 正在测试中 → 禁用「测试」按钮 */
  const isAnyTesting = (providerId: string): boolean => {
    return openaiTests[providerId] === 'testing' || anthropicTests[providerId] === 'testing';
  };

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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{p.name}</span>
                    {p.openaiUrl && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">OpenAI</span>
                    )}
                    {p.anthropicUrl && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300">Anthropic</span>
                    )}
                    <span className="text-xs text-zinc-600">{p.models.length} 模型</span>
                  </div>
                  {/* 激活的 API Key */}
                  {p.apiKeys.length > 0 && (
                    <div className="text-xs text-zinc-500 mt-1.5 space-y-0.5">
                      <p>
                        🔑 默认 Key：
                        <span className="text-zinc-300 ml-1">
                          {p.apiKeys.find((k) => k.id === p.selectedKeyId)?.label ?? '未选择'}
                        </span>
                        {p.apiKeys.length > 1 && (
                          <span className="text-zinc-600 ml-1">（共 {p.apiKeys.length} 个）</span>
                        )}
                      </p>
                    </div>
                  )}
                  <div className="text-xs text-zinc-500 mt-1.5 space-y-1">
                    {p.openaiUrl && (
                      <ProviderUrlRow emoji="🟢" url={p.openaiUrl} test={openaiTests[p.id]} />
                    )}
                    {p.anthropicUrl && (
                      <ProviderUrlRow emoji="🟣" url={p.anthropicUrl} test={anthropicTests[p.id]} />
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  <button onClick={() => setEditing(p.id)} className="text-xs text-zinc-400 hover:text-white px-2 py-1">编辑</button>
                  <button onClick={() => handleTestAll(p)} disabled={isAnyTesting(p.id)}
                    className="text-xs text-zinc-400 hover:text-white px-2 py-1 disabled:text-zinc-600">
                    {isAnyTesting(p.id) ? '测试中…' : '测试'}
                  </button>
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

/** 显示单个 URL 的测试结果（idle = 不显示） */
function TestResultRow({ result }: { result: 'idle' | 'testing' | TestResult }) {
  if (result === 'idle') return null;
  if (result === 'testing') {
    return (
      <p className="text-[10px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
        正在测试…
      </p>
    );
  }
  if (result.ok) {
    return (
      <p className="text-[10px] text-emerald-400 mt-1.5">
        ✓ {result.message} · {result.latencyMs}ms
      </p>
    );
  }
  return (
    <p className="text-[10px] text-red-400 mt-1.5 break-all">
      ✗ {result.message}
    </p>
  );
}

/** 列表卡片中一行 URL：emoji + URL + 测试状态 */
function ProviderUrlRow({
  emoji,
  url,
  test,
}: {
  emoji: string;
  url: string;
  test: 'idle' | 'testing' | TestResult | undefined;
}) {
  let statusIcon = <span className="text-zinc-600">○</span>;
  let statusText = '未测试';
  if (test === 'testing') {
    statusIcon = <span className="w-2.5 h-2.5 border border-zinc-400 border-t-transparent rounded-full animate-spin inline-block" />;
    statusText = '测试中…';
  } else if (test && test !== 'idle') {
    if (test.ok) {
      statusIcon = <span className="text-emerald-400">✓</span>;
      statusText = `${test.latencyMs}ms`;
    } else {
      statusIcon = <span className="text-red-400">✗</span>;
      statusText = `HTTP ${test.status || '?'}`;
    }
  }
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0">{emoji}</span>
      <span className="font-mono truncate flex-1 min-w-0" title={url}>{url}</span>
      <span className="shrink-0 flex items-center gap-1 text-[10px] text-zinc-500">
        {statusIcon}
        <span>{statusText}</span>
      </span>
    </div>
  );
}
