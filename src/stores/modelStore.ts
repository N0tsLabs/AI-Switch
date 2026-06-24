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

/** 服务商配置：双 URL 字段，Anthropic 字段用于 ClaudeCode，OpenAI 字段用于 OpenCode。
 *  同一个服务商可以同时填两个（一个 provider 服两套工具），也可以只填一个。 */
export interface Provider {
  id: string;
  name: string;
  /** Anthropic 格式 Base URL（用于 ClaudeCode） */
  anthropicUrl?: string;
  /** OpenAI 格式 Base URL（用于 OpenCode） */
  openaiUrl?: string;
  apiKey: string;
  models: string[];              // 从 API 读取或手动添加的模型 ID 列表
  modelCapabilities: Record<string, ModelCapability>;  // 每个模型的能力标记
  /** @deprecated 旧版单 url 字段，保留读取兼容；新代码用 anthropicUrl/openaiUrl */
  url?: string;
  /** @deprecated 旧版 apiFormat，从 anthropicUrl/openaiUrl 推断 */
  apiFormat?: ApiFormat;
}

interface ModelState {
  providers: Provider[];
  addProvider: (p: Provider) => void;
  updateProvider: (id: string, p: Partial<Provider>) => void;
  removeProvider: (id: string) => void;
  setProviderModels: (id: string, models: string[]) => void;
  setModelCapability: (providerId: string, modelId: string, cap: Partial<ModelCapability>) => void;
  /** 整体替换服务商列表（用于云同步下载） */
  replaceAll: (providers: Provider[]) => void;
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

  replaceAll: (providers) => {
    set({ providers });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  },
}));
