import { create } from 'zustand';

export interface ClaudeToggles {
  includeCoAuthoredByOff: boolean;
  skipWebFetchPreflight: boolean;
  bypassPermissions: boolean;
  skipDangerousModePermissionPrompt: boolean;
  alwaysThinkingEnabled: boolean;
  autoCompactEnabled: boolean;
  fileCheckpointingEnabled: boolean;
  autoMemoryEnabled: boolean;
  disableRemoteControl: boolean;
  remoteControlAtStartup: boolean;
  respondToBashCommands: boolean;
  disableSkillShellExecution: boolean;
  prefersReducedMotion: boolean;
  respectGitignore: boolean;
  disableAllHooks: boolean;
}

export interface OpenCodeToggles {
  snapshot: boolean;
  share: 'manual' | 'auto' | 'disabled';
  autoupdate: 'off' | 'notify' | 'on';
}

const DEFAULT_CLAUDE: ClaudeToggles = {
  includeCoAuthoredByOff: false,
  skipWebFetchPreflight: false,
  bypassPermissions: false,
  skipDangerousModePermissionPrompt: false,
  alwaysThinkingEnabled: false,
  autoCompactEnabled: false,
  fileCheckpointingEnabled: false,
  autoMemoryEnabled: false,
  disableRemoteControl: false,
  remoteControlAtStartup: false,
  respondToBashCommands: false,
  disableSkillShellExecution: false,
  prefersReducedMotion: false,
  respectGitignore: false,
  disableAllHooks: false,
};

const DEFAULT_OPENCODE: OpenCodeToggles = {
  snapshot: false,
  share: 'manual',
  autoupdate: 'on',
};

const DEFAULT_CLAUDE_MODELS = { default: '', sonnet: '', opus: '', haiku: '' };

interface SettingsState {
  claude: ClaudeToggles;
  opencode: OpenCodeToggles;
  lastSyncedVersion: number | null;
  claudeSelectedProviderId: string | null;
  claudeModels: { default: string; sonnet: string; opus: string; haiku: string };
  syncModalOpen: boolean;

  setClaudeToggle: <K extends keyof ClaudeToggles>(key: K, value: ClaudeToggles[K]) => void;
  setOpencodeToggle: <K extends keyof OpenCodeToggles>(key: K, value: OpenCodeToggles[K]) => void;
  setLastSyncedVersion: (v: number | null) => void;
  setClaudeSelectedProviderId: (id: string | null) => void;
  setClaudeModels: (m: Partial<{ default: string; sonnet: string; opus: string; haiku: string }>) => void;
  setSyncModalOpen: (open: boolean) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'ai-switch-settings';

function isClaudeTogglesKey(k: string): k is keyof ClaudeToggles {
  return k in DEFAULT_CLAUDE;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  claude: { ...DEFAULT_CLAUDE },
  opencode: { ...DEFAULT_OPENCODE },
  lastSyncedVersion: null,
  claudeSelectedProviderId: null,
  claudeModels: { ...DEFAULT_CLAUDE_MODELS },
  syncModalOpen: false,

  setClaudeToggle: (key, value) => {
    set((s) => ({ claude: { ...s.claude, [key]: value } }));
    get().saveToStorage();
  },

  setOpencodeToggle: (key, value) => {
    set((s) => ({ opencode: { ...s.opencode, [key]: value } }));
    get().saveToStorage();
  },

  setLastSyncedVersion: (v) => {
    set({ lastSyncedVersion: v });
    get().saveToStorage();
  },

  setClaudeSelectedProviderId: (id) => {
    set({ claudeSelectedProviderId: id });
    get().saveToStorage();
  },

  setClaudeModels: (m) => {
    set((s) => ({ claudeModels: { ...s.claudeModels, ...m } }));
    get().saveToStorage();
  },

  setSyncModalOpen: (open) => {
    set({ syncModalOpen: open });
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const claude = { ...DEFAULT_CLAUDE };
      const opencode = { ...DEFAULT_OPENCODE };
      if (data.claude && typeof data.claude === 'object') {
        for (const [k, v] of Object.entries(data.claude)) {
          if (isClaudeTogglesKey(k) && typeof v === 'boolean') {
            (claude as Record<string, unknown>)[k] = v;
          }
        }
      }
      if (data.opencode && typeof data.opencode === 'object') {
        for (const [k, v] of Object.entries(data.opencode)) {
          if (k === 'snapshot' && typeof v === 'boolean') {
            (opencode as Record<string, unknown>)[k] = v;
          } else if (k === 'share' && ['manual', 'auto', 'disabled'].includes(v as string)) {
            (opencode as Record<string, unknown>)[k] = v;
          } else if (k === 'autoupdate' && ['off', 'notify', 'on'].includes(v as string)) {
            (opencode as Record<string, unknown>)[k] = v;
          }
        }
      }
      const lastSyncedVersion =
        typeof data.lastSyncedVersion === 'number' ? data.lastSyncedVersion : null;
      const claudeSelectedProviderId =
        typeof data.claudeSelectedProviderId === 'string' ? data.claudeSelectedProviderId : null;
      const claudeModels =
        data.claudeModels && typeof data.claudeModels === 'object'
          ? {
              default: typeof data.claudeModels.default === 'string' ? data.claudeModels.default : '',
              sonnet: typeof data.claudeModels.sonnet === 'string' ? data.claudeModels.sonnet : '',
              opus: typeof data.claudeModels.opus === 'string' ? data.claudeModels.opus : '',
              haiku: typeof data.claudeModels.haiku === 'string' ? data.claudeModels.haiku : '',
            }
          : { ...DEFAULT_CLAUDE_MODELS };
      set({ claude, opencode, lastSyncedVersion, claudeSelectedProviderId, claudeModels });
    } catch {
      /* ignore */
    }
  },

  saveToStorage: () => {
    const { claude, opencode, lastSyncedVersion, claudeSelectedProviderId, claudeModels } = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ claude, opencode, lastSyncedVersion, claudeSelectedProviderId, claudeModels }),
    );
  },
}));

export const DEFAULT_SETTINGS = {
  claude: DEFAULT_CLAUDE,
  opencode: DEFAULT_OPENCODE,
  claudeModels: DEFAULT_CLAUDE_MODELS,
};
