import { useState } from 'react';
import { useProfileStore, type Profile } from '../stores/profileStore';
import { useModelStore } from '../stores/modelStore';
import { writeClaudeSettings, writeOpencodeAgents } from '../lib/tauri';
import { useToast } from '../components/useToast';

export default function ProfileSwitch() {
  const { profiles, activeProfileId, addProfile, updateProfile, removeProfile, setActiveProfile, saveToStorage } = useProfileStore();
  const providers = useModelStore((s) => s.providers);
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClaudeModel, setEditClaudeModel] = useState('');
  const [editClaudeUrl, setEditClaudeUrl] = useState('');
  const [editClaudeKey, setEditClaudeKey] = useState('');
  const [editOpencodeModels, setEditOpencodeModels] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 所有可用模型
  const allModels = providers.flatMap((p) =>
    p.models.map((m) => ({ providerName: p.name, modelId: m, label: `${p.name} / ${m}` }))
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    addProfile({
      name: newName.trim(),
      claude: { enabledModel: '', apiUrl: '', apiKey: '' },
      opencode: { models: [] },
    });
    setNewName('');
    setShowNew(false);
    saveToStorage();
  };

  const startEdit = (p: Profile) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditClaudeModel(p.claude.enabledModel);
    setEditClaudeUrl(p.claude.apiUrl);
    setEditClaudeKey(p.claude.apiKey);
    setEditOpencodeModels(p.opencode.models.map((m) => m.modelId));
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateProfile(editingId, {
      name: editName.trim(),
      claude: {
        enabledModel: editClaudeModel,
        apiUrl: editClaudeUrl,
        apiKey: editClaudeKey,
      },
      opencode: {
        models: editOpencodeModels.map((modelId) => ({
          providerId: 'imported',
          modelId,
          supportsImage: false,
          supportsVideo: false,
        })),
      },
    });
    setEditingId(null);
    saveToStorage();
  };

  const handleDelete = (id: string) => {
    removeProfile(id);
    setConfirmDelete(null);
    saveToStorage();
  };

  const [applying, setApplying] = useState<string | null>(null);

  /** 应用方案：将 Profile 配置写入 Claude Code 和 OpenCode 配置文件 */
  const handleApply = async (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;

    setApplying(id);
    try {
      // 1. 写入 Claude Code settings.json
      const claudeSettings: Record<string, unknown> = {};
      const env: Record<string, string> = {};
      if (profile.claude.apiUrl) env.ANTHROPIC_BASE_URL = profile.claude.apiUrl;
      if (profile.claude.apiKey) env.ANTHROPIC_AUTH_TOKEN = profile.claude.apiKey;
      if (profile.claude.enabledModel) env.ANTHROPIC_MODEL = profile.claude.enabledModel;
      if (Object.keys(env).length > 0) claudeSettings.env = env;
      if (Object.keys(claudeSettings).length > 0) {
        await writeClaudeSettings(claudeSettings);
      }

      // 2. 写入 OpenCode oh-my-openagent.json
      if (profile.opencode.models.length > 0) {
        const agents: Record<string, unknown> = {};
        const categories: Record<string, unknown> = {};
        const modelIds = profile.opencode.models.map((m) => m.modelId);

        modelIds.forEach((modelId, i) => {
          const agentName = i === 0 ? 'primary' : `agent-${i}`;
          const modelStr = `opencode/${modelId}`;
          agents[agentName] = {
            model: modelStr,
            fallback_models: modelIds
              .filter((m) => m !== modelId)
              .slice(0, 2)
              .map((m) => ({ model: `opencode/${m}` })),
          };
        });

        categories['default'] = {
          model: `opencode/${modelIds[0]}`,
          fallback_models: modelIds.slice(1, 3).map((m) => ({ model: `opencode/${m}` })),
        };

        await writeOpencodeAgents({ agents, categories });
      }

      setActiveProfile(id);
      saveToStorage();
      toast(`方案「${profile.name}」已应用`, 'success');
    } catch (e) {
      toast('应用方案失败: ' + String(e), 'error');
    } finally {
      setApplying(null);
    }
  };

  const toggleEditModel = (modelId: string) => {
    setEditOpencodeModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]
    );
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-1">🔄 切换方案</h1>
      <p className="text-zinc-500 text-sm mb-4">管理 Profile，一键切换不同配置方案</p>

      {/* 说明 */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-8">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">什么是方案？</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          方案是一组配置快照，可以保存不同场景下的模型配置。比如「工作模式」用高性能模型，「省钱模式」用经济模型。
          点击「应用此方案」会将该方案的配置写入 Claude Code 和 OpenCode 的配置文件，立即生效。
          你也可以不创建方案，直接在 Claude Code / OpenCode 页面手动配置。
        </p>
      </div>

      <div className="space-y-3">
        {profiles.map((p: Profile) => {
          const isActive = p.id === activeProfileId;
          const isEditing = editingId === p.id;

          return (
            <div key={p.id}
              className={`bg-zinc-900 border rounded-xl p-5 transition-colors ${
                isActive ? 'border-blue-500/50 bg-blue-500/5' : 'border-zinc-800'
              }`}>
              {isEditing ? (
                /* ===== 编辑模式 ===== */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">方案名称</label>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>

                  {/* Claude 配置 */}
                  <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-zinc-400 font-medium">🟣 Claude Code</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-zinc-600 mb-0.5">启用模型</label>
                        <select value={editClaudeModel} onChange={(e) => setEditClaudeModel(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white">
                          <option value="">未配置</option>
                          {allModels.map((m) => (
                            <option key={m.modelId} value={m.modelId}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-600 mb-0.5">API URL</label>
                        <input value={editClaudeUrl} onChange={(e) => setEditClaudeUrl(e.target.value)}
                          placeholder="https://api.anthropic.com"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-600 mb-0.5">API Key</label>
                      <input type="password" value={editClaudeKey} onChange={(e) => setEditClaudeKey(e.target.value)}
                        placeholder="sk-ant-..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" />
                    </div>
                  </div>

                  {/* OpenCode 配置 */}
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-400 font-medium mb-2">🟢 OpenCode 模型</p>
                    {allModels.length === 0 ? (
                      <p className="text-xs text-zinc-600">请先在模型设置中添加服务商</p>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {allModels.map((m) => (
                          <label key={m.modelId}
                            className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer ${
                              editOpencodeModels.includes(m.modelId) ? 'bg-blue-500/10 text-blue-300' : 'text-zinc-400 hover:bg-zinc-700/50'
                            }`}>
                            <input type="checkbox" checked={editOpencodeModels.includes(m.modelId)}
                              onChange={() => toggleEditModel(m.modelId)} className="accent-blue-500" />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg">取消</button>
                    <button onClick={handleSaveEdit} disabled={!editName.trim()}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white text-xs rounded-lg">保存</button>
                  </div>
                </div>
              ) : (
                /* ===== 展示模式 ===== */
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-white">{p.name}</span>
                      {isActive && (
                        <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">当前使用</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!isActive && (
                        <button onClick={() => handleApply(p.id)}
                          disabled={applying === p.id}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white text-xs rounded-lg transition-colors">
                          {applying === p.id ? '应用中...' : '应用此方案'}
                        </button>
                      )}
                      <button onClick={() => startEdit(p)}
                        className="text-xs text-zinc-400 hover:text-white px-2 py-1">编辑</button>
                      {confirmDelete === p.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleDelete(p.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded">确认删除</button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded">取消</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(p.id)}
                          className="text-xs text-zinc-500 hover:text-red-400 px-2 py-1">删除</button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <p className="text-zinc-500 mb-1">🟣 Claude Code</p>
                      <p className="text-zinc-300">{p.claude.enabledModel || '未配置'}</p>
                      {p.claude.apiUrl && <p className="text-zinc-600 truncate mt-0.5">{p.claude.apiUrl}</p>}
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <p className="text-zinc-500 mb-1">🟢 OpenCode</p>
                      {p.opencode.models.length === 0 ? (
                        <p className="text-zinc-600">未配置</p>
                      ) : (
                        <div className="space-y-0.5">
                          {p.opencode.models.slice(0, 3).map((m) => (
                            <p key={m.modelId} className="text-zinc-300 truncate">{m.modelId}</p>
                          ))}
                          {p.opencode.models.length > 3 && (
                            <p className="text-zinc-600">+{p.opencode.models.length - 3} 更多</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-600 mt-2">
                    创建于 {new Date(p.createdAt).toLocaleDateString()} · 更新于 {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                </>
              )}
            </div>
          );
        })}

        {/* 新建 */}
        {showNew ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <label className="block text-xs text-zinc-500 mb-2">方案名称</label>
            <div className="flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="如 日常开发、省钱模式"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              <button onClick={handleCreate} disabled={!newName.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white text-sm rounded-lg transition-colors">
                创建
              </button>
              <button onClick={() => { setShowNew(false); setNewName(''); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
                取消
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)}
            className="w-full border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-4 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            + 创建新方案
          </button>
        )}
      </div>
    </div>
  );
}
