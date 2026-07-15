import { create } from 'zustand';

/** Profile 中 Claude Code 的配置 */
export interface ClaudeProfileConfig {
  /** 选中的服务商 ID */
  providerId: string;
  /** 启用的模型 ID */
  enabledModel: string;
}

/** Profile 中 OpenCode 的模型配置 */
export interface OpencodeModelConfig {
  providerId: string;
  modelId: string;
  supportsImage: boolean;
  supportsVideo: boolean;
}

/** Profile 中 OpenCode 的配置 */
export interface OpencodeProfileConfig {
  models: OpencodeModelConfig[];
}

/** 一个完整的 Profile */
export interface Profile {
  id: string;
  name: string;
  claude: ClaudeProfileConfig;
  opencode: OpencodeProfileConfig;
  createdAt: number;
  updatedAt: number;
}

interface ProfileState {
  profiles: Profile[];
  activeProfileId: string | null;
  addProfile: (p: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProfile: (id: string, p: Partial<Profile>) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
  /** 整体替换 Profile 列表和 activeId（用于云同步下载） */
  replaceAll: (profiles: Profile[], activeProfileId: string | null) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'ai-switch-profiles';
const ACTIVE_KEY = 'ai-switch-active-profile';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfileId: null,

  addProfile: (p) => {
    const { profiles } = get();
    const now = Date.now();
    const profile: Profile = { ...p, id: genId(), createdAt: now, updatedAt: now };
    const next = [...profiles, profile];
    set({ profiles: next });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  updateProfile: (id, partial) => {
    const { profiles } = get();
    const next = profiles.map((p) =>
      p.id === id ? { ...p, ...partial, updatedAt: Date.now() } : p
    );
    set({ profiles: next });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  removeProfile: (id) => {
    const { profiles, activeProfileId } = get();
    const next = profiles.filter((p) => p.id !== id);
    const newActive = activeProfileId === id ? null : activeProfileId;
    set({ profiles: next, activeProfileId: newActive });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (newActive) {
      localStorage.setItem(ACTIVE_KEY, newActive);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  },

  setActiveProfile: (id) => {
    set({ activeProfileId: id });
    localStorage.setItem(ACTIVE_KEY, id);
  },

  replaceAll: (profiles, activeProfileId) => {
    set({ profiles, activeProfileId });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    if (activeProfileId) {
      localStorage.setItem(ACTIVE_KEY, activeProfileId);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const active = localStorage.getItem(ACTIVE_KEY);
      if (raw) set({ profiles: JSON.parse(raw) });
      if (active) set({ activeProfileId: active });
    } catch { /* ignore */ }
  },

  saveToStorage: () => {
    const { profiles, activeProfileId } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    if (activeProfileId) localStorage.setItem(ACTIVE_KEY, activeProfileId);
  },
}));
