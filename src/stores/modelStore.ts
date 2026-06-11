import { create } from 'zustand';

/** API 格式类型 */
export type ApiFormat = 'openai' | 'anthropic';

/** 单个模型的能力标记 */
export interface ModelCapability {
  modelId: string;
  supportsImage: boolean;
  supportsVideo: boolean;
  context1M: boolean;  // 1M 上下文长度
}

/** 服务商配置 */
export interface Provider {
  id: string;
  name: string;
  apiFormat: ApiFormat;
  url: string;
  apiKey: string;
  models: string[];              // 从 API 读取或手动添加的模型 ID 列表
  modelCapabilities: Record<string, ModelCapability>;  // 每个模型的能力标记
}

interface ModelState {
  providers: Provider[];
  addProvider: (p: Provider) => void;
  updateProvider: (id: string, p: Partial<Provider>) => void;
  removeProvider: (id: string) => void;
  setProviderModels: (id: string, models: string[]) => void;
  setModelCapability: (providerId: string, modelId: string, cap: Partial<ModelCapability>) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'ai-switch-models';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useModelStore = create<ModelState>((set, get) => ({
  providers: [],

  addProvider: (p) => set((s) => {
    const next = [...s.providers, { ...p, id: p.id || genId() }];
    return { providers: next };
  }),

  updateProvider: (id, partial) => set((s) => ({
    providers: s.providers.map((p) => p.id === id ? { ...p, ...partial } : p),
  })),

  removeProvider: (id) => set((s) => ({
    providers: s.providers.filter((p) => p.id !== id),
  })),

  setProviderModels: (id, models) => set((s) => ({
    providers: s.providers.map((p) => p.id === id ? { ...p, models } : p),
  })),

  setModelCapability: (providerId, modelId, cap) => set((s) => ({
    providers: s.providers.map((p) => {
      if (p.id !== providerId) return p;
      const existing = p.modelCapabilities[modelId] || { modelId, supportsImage: false, supportsVideo: false };
      return {
        ...p,
        modelCapabilities: {
          ...p.modelCapabilities,
          [modelId]: { ...existing, ...cap },
        },
      };
    }),
  })),

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        set({ providers: JSON.parse(raw) });
      }
    } catch { /* ignore */ }
  },

  saveToStorage: () => {
    const { providers } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  },
}));
