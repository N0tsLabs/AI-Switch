import { create } from 'zustand';
import { useProfileStore } from './profileStore';
import { useSettingsStore } from './settingsStore';

/** API 格式类型 */
export type ApiFormat = 'openai' | 'anthropic';

/** 单个模型的能力标记 */
export interface ModelCapability {
  modelId: string;
  supportsImage: boolean;
  supportsVideo: boolean;
  context1M: boolean;  // 1M 上下文长度
}

/** 单个 API Key：可起别名方便识别和切换 */
export interface ApiKey {
  id: string;            // 内部唯一 ID
  label: string;         // 别名，如「公司卡」「个人备用」
  value: string;         // 实际 key（明文存储）
  createdAt: number;
  lastTestOk?: boolean;  // 最近一次连通性测试结果
  lastTestAt?: number;
  lastTestMessage?: string;
}

/** 服务商配置：双 URL 字段，Anthropic 字段用于 ClaudeCode，OpenAI 字段用于 OpenCode。
 *  同一个服务商可以同时填两个（一个 provider 服两套工具），也可以只填一个。
 *  支持多 key + selectedKeyId 标记当前激活。 */
export interface Provider {
  id: string;
  name: string;
  /** Anthropic 格式 Base URL（用于 ClaudeCode） */
  anthropicUrl?: string;
  /** OpenAI 格式 Base URL（用于 OpenCode） */
  openaiUrl?: string;
  /** 多 key 列表（v0.4+） */
  apiKeys: ApiKey[];
  /** 当前激活的 key id（对应 apiKeys 数组里某个） */
  selectedKeyId: string | null;
  models: string[];              // 从 API 读取或手动添加的模型 ID 列表
  modelCapabilities: Record<string, ModelCapability>;  // 每个模型的能力标记
  /** @deprecated 旧版单 key 字段；新数据用 apiKeys。读取时自动迁移 */
  apiKey?: string;
  /** @deprecated 旧版单 url 字段；读取兼容；新代码用 anthropicUrl/openaiUrl */
  url?: string;
  /** @deprecated 旧版 apiFormat，从 anthropicUrl/openaiUrl 推断 */
  apiFormat?: ApiFormat;
}

/** 生成 ApiKey id（与 Provider id 风格一致） */
export function genKeyId(): string {
  return 'k-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 给空 label 自动命名「未命名 key #N」 */
export function defaultKeyLabel(existing: ApiKey[]): string {
  for (let i = 1; i < 999; i++) {
    const name = `未命名 key #${i}`;
    if (!existing.some((k) => k.label === name)) return name;
  }
  return `未命名 key #${Date.now()}`;
}

/**
 * 迁移旧数据（带 apiKey 字段）到新格式（apiKeys[] + selectedKeyId）。
 * - 永远返回新对象（不修改入参）
 * - 剥离 apiKey / url / apiFormat 等 deprecated 字段
 * - 幂等：重复调用结果一致
 */
export function migrateProvider(p: Provider): Provider {
  const old = p as unknown as { apiKey?: string; url?: string; apiFormat?: string };
  const oldKey = old.apiKey;
  const oldUrl = old.url;
  const oldFormat = old.apiFormat;
  const newKeys = Array.isArray(p.apiKeys) ? [...p.apiKeys] : [];

  if (oldKey && newKeys.length === 0) {
    const k: ApiKey = {
      id: genKeyId(),
      label: '默认',
      value: oldKey,
      createdAt: Date.now(),
    };
    newKeys.push(k);
  }

  let selectedKeyId: string | null = p.selectedKeyId ?? null;
  if (newKeys.length > 0) {
    if (!selectedKeyId || !newKeys.some((k) => k.id === selectedKeyId)) {
      selectedKeyId = newKeys[0].id;
    }
  } else {
    selectedKeyId = null;
  }

  const anthropicUrl = p.anthropicUrl ?? (oldFormat === 'anthropic' ? oldUrl : undefined);
  const openaiUrl = p.openaiUrl ?? (oldFormat === 'openai' ? oldUrl : undefined);

  const result: Provider = {
    id: p.id,
    name: p.name,
    apiKeys: newKeys,
    selectedKeyId,
    models: p.models ?? [],
    modelCapabilities: p.modelCapabilities ?? {},
  };
  if (anthropicUrl) result.anthropicUrl = anthropicUrl;
  if (openaiUrl) result.openaiUrl = openaiUrl;
  return result;
}

/** 取当前激活的 key 的 value（统一入口，三处复用） */
export function getActiveKeyValue(p: Provider): string {
  const active = p.apiKeys.find((k) => k.id === p.selectedKeyId);
  return active?.value ?? '';
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

  addProvider: (p) => {
    const { providers } = get();
    const id = p.id || genId();
    const migrated = migrateProvider({ ...p, id });
    const next = [...providers, migrated];
    set({ providers: next });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  updateProvider: (id, partial) => {
    const { providers } = get();
    const next = providers.map((p) =>
      p.id === id ? migrateProvider({ ...p, ...partial, id: p.id }) : p
    );
    set({ providers: next });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  removeProvider: (id) => {
    const { providers } = get();
    const next = providers.filter((p) => p.id !== id);
    set({ providers: next });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    const pf = useProfileStore.getState();
    const cleanedProfiles = pf.profiles.map((p) => {
      if (p.claude.providerId === id) {
        return { ...p, claude: { ...p.claude, providerId: '', enabledModel: '' }, updatedAt: Date.now() };
      }
      return {
        ...p,
        opencode: {
          ...p.opencode,
          models: p.opencode.models.filter((m) => m.providerId !== id),
        },
        updatedAt: Date.now(),
      };
    });
    pf.replaceAll(cleanedProfiles, pf.activeProfileId);

    const st = useSettingsStore.getState();
    if (st.claudeSelectedProviderId === id) {
      st.setClaudeSelectedProviderId(null);
    }
  },

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
        const parsed = JSON.parse(raw) as Provider[];
        // 迁移旧数据（带 apiKey 字段的）→ 新格式
        set({ providers: parsed.map(migrateProvider) });
      }
    } catch { /* ignore */ }
  },

  saveToStorage: () => {
    const { providers } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  },

  replaceAll: (providers) => {
    // 云端下载的数据也走迁移（老云数据可能带 apiKey 字段）
    const migrated = providers.map(migrateProvider);
    set({ providers: migrated });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  },
}));
