import { useState } from 'react';
import { useProfileStore, type Profile } from '../stores/profileStore';
import { useModelStore } from '../stores/modelStore';
import { mergeClaudeEnv, mergeOpencodeManaged } from '../lib/tauri';
import { useToast } from '../components/useToast';

export default function ProfileSwitch() {
  const { profiles, activeProfileId, addProfile, updateProfile, removeProfile, setActiveProfile, saveToStorage } = useProfileStore();
  const providers = useModelStore((s) => s.providers);
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClaudeProviderId, setEditClaudeProviderId] = useState('');
  const [editClaudeModel, setEditClaudeModel] = useState('');
  const [editOpencodeModels, setEditOpencodeModels] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 所有可用模型
  const allModels = providers.flatMap((p) =>
    p.models.map((m) => ({ providerId: p.id, providerName: p.name, modelId: m, label: `${p.name} / ${m}` }))
  );

  // 当前选中的 Claude 服务商
  const selectedClaudeProvider = providers.find((p) => p.id === editClaudeProviderId);

  const handleCreate = () => {
    if (!newName.trim()) return;
    addProfile({
      name: newName.trim(),
      claude: { providerId: '', enabledModel: '' },
      opencode: { models: [] },
    });
    setNewName('');
    setShowNew(false);
    saveToStorage();
  };

  const startEdit = (p: Profile) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditClaudeProviderId(p.claude.providerId);
    setEditClaudeModel(p.claude.enabledModel);
    setEditOpencodeModels(p.opencode.models.map((m) => m.modelId));
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateProfile(editingId, {
      name: editName.trim(),
      claude: {
        providerId: editClaudeProviderId,
        enabledModel: editClaudeModel,
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

  /** 应用方案：将 Profile 配置合并到 Claude Code 和 OpenCode 配置文件中
   *  使用 key-level merge 命令，仅修改模型相关字段，保留本地其他 key */
  const handleApply = async (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;

    setApplying(id);
    try {
      // 1. Claude Code settings.json — 校验 provider 填了 Anthropic URL
      const provider = providers.find((p) => p.id === profile.claude.providerId);
      if (!provider) {
        toast(`方案「${profile.name}」引用的服务商不存在（已删除？），无法应用`, 'error');
        return;
      }
      if (!provider.anthropicUrl) {
        toast(
          `方案「${profile.name}」引用的「${provider.name}」未填写 Anthropic URL，无法用于 Claude Code`,
          'error',
        );
        return;
      }
      if (!provider.apiKey) {
        toast(`「${provider.name}」缺少 API Key`, 'error');
        return;
      }
      const env: Record<string, string> = {};
      env.ANTHROPIC_BASE_URL = provider.anthropicUrl;
      env.ANTHROPIC_AUTH_TOKEN = provider.apiKey;
      if (profile.claude.enabledModel) {
        // 若该模型在 modelStore 中标记了 context1M，自动追加 [1M] 后缀
        const cap = provider.modelCapabilities[profile.claude.enabledModel];
        env.ANTHROPIC_MODEL = cap?.context1M
          ? `${profile.claude.enabledModel}[1M]`
          : profile.claude.enabledModel;
      }
      await mergeClaudeEnv(env);

      // 2. OpenCode oh-my-openagent.json — 仅合并 agents + categories 顶层字段
      if (profile.opencode.models.length > 0) {
        const agents: Record<string, unknown> = {};
        const categories: Record<string, unknown> = {};
        const modelIds = profile.opencode.models.map((m) => m.modelId);

        modelIds.forEach((modelId, i) => {
          const agentName = i === 0 ? 'primary' : `agent-${i}`;
          // 从 modelStore 查能力
          let cap = null;
          for (const p of providers) {
            if (p.modelCapabilities[modelId]) { cap = p.modelCapabilities[modelId]; break; }
          }
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

        categories['default'] = {
          model: `opencode/${modelIds[0]}`,
          fallback_models: modelIds.slice(1, 3).map((m) => ({ model: `opencode/${m}` })),
        };

        await mergeOpencodeManaged({ agents, categories });
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

  /** 服务商选择变更时，自动选中该服务商的第一个模型 */
  const handleProviderChange = (providerId: string) => {
    setEditClaudeProviderId(providerId);
    const provider = providers.find((p) => p.id === providerId);
    if (provider && provider.models.length > 0) {
      setEditClaudeModel(provider.models[0]);
    } else {
      setEditClaudeModel('');
    }
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
          API 地址和 Key 在「模型设置」中配置，方案里只选择用哪个服务商和模型。
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

                  {/* Claude 配置 — 只选服务商和模型 */}
                  <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-zinc-400 font-medium">🟣 Claude Code</p>
                    <div>
                      <label className="block text-xs text-zinc-600 mb-0.5">选择服务商</label>
                      <select value={editClaudeProviderId} onChange={(e) => handleProviderChange(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white">
                        <option value="">未选择</option>
                        {providers.filter((p) => !!p.anthropicUrl).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    {providers.filter((p) => !!p.anthropicUrl).length === 0 && (
                      <p className="text-[10px] text-amber-400">
                        ⚠ 暂无填了 Anthropic URL 的服务商，请到「模型设置」补充
                      </p>
                    )}
                    {selectedClaudeProvider && selectedClaudeProvider.models.length > 0 && (
                      <div>
                        <label className="block text-xs text-zinc-600 mb-0.5">选择模型</label>
                        <select value={editClaudeModel} onChange={(e) => setEditClaudeModel(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white">
                          {selectedClaudeProvider.models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    )}
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
                      {p.claude.providerId && (() => {
                        const prov = providers.find((pp) => pp.id === p.claude.providerId);
                        return prov ? <p className="text-zinc-600 truncate mt-0.5">{prov.name}</p> : null;
                      })()}
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
