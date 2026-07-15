import { create } from 'zustand';
import type { PayloadData } from '../utils/equal';

/** Claude Code 行为开关：全部默认 false（即不写 settings.json，使用 Claude 默认值） */
export interface ClaudeToggles {
  // 权限
  includeCoAuthoredByOff: boolean;             // ON → includeCoAuthoredBy=false
  skipWebFetchPreflight: boolean;               // ON → skipWebFetchPreflight=true
  bypassPermissions: boolean;                   // ON → permissions.defaultMode="bypassPermissions"
  skipDangerousModePermissionPrompt: boolean;   // ON → skipDangerousModePermissionPrompt=true
  // 默认行为
  alwaysThinkingEnabled: boolean;               // ON → alwaysThinkingEnabled=true
  autoCompactEnabled: boolean;                  // ON → autoCompactEnabled=true
  fileCheckpointingEnabled: boolean;            // ON → fileCheckpointingEnabled=true
  autoMemoryEnabled: boolean;                   // ON → autoMemoryEnabled=true
  // 远程 & 集成
  disableRemoteControl: boolean;                // ON → disableRemoteControl=true
  remoteControlAtStartup: boolean;              // ON → remoteControlAtStartup=true
  respondToBashCommands: boolean;               // ON → respondToBashCommands=true
  disableSkillShellExecution: boolean;          // ON → disableSkillShellExecution=true
  // UI & 文件
  prefersReducedMotion: boolean;                // ON → prefersReducedMotion=true
  respectGitignore: boolean;                    // ON → respectGitignore=true
  disableAllHooks: boolean;                     // ON → disableAllHooks=true
}

/** OpenCode 行为开关 */
export interface OpenCodeToggles {
  /** 是否启用文件变更快照（true=开启, false=关闭） */
  snapshot: boolean;
  /** 会话分享模式 */
  share: 'manual' | 'auto' | 'disabled';
  /** 自动更新模式：'off' 关闭, 'notify' 仅通知, 'on' 自动 */
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

const DEFAULT_CLAUDE_MODELS = {
  default: '',
  sonnet: '',
  opus: '',
  haiku: '',
};

interface SettingsState {
  claude: ClaudeToggles;
  opencode: OpenCodeToggles;
  /** 上次同步时云端的 version 号（null = 从未同步过） */
  lastSyncedVersion: number | null;
  /**
   * 上次成功同步时的数据快照（不含 version/schemaVersion）。
   * 与当前本地状态对比，判断是否有未同步的本地改动。
   * null 表示从未同步过，此时一定显示「未同步」提醒。
   */
  lastSyncedSnapshot: PayloadData | null;
  /** Claude Code 当前选中的服务商 ID */
  claudeSelectedProviderId: string | null;
  /** Claude Code 四个模型变体（持久化到 localStorage） */
  claudeModels: { default: string; sonnet: string; opus: string; haiku: string };
  /** 全局同步弹窗开关：true = SyncModal 渲染（侧边栏 / toast 都能触发） */
  syncModalOpen: boolean;

  /** 设置单个 Claude toggle 的值 */
  setClaudeToggle: <K extends keyof ClaudeToggles>(key: K, value: ClaudeToggles[K]) => void;
  /** 设置单个 OpenCode toggle 的值 */
  setOpencodeToggle: <K extends keyof OpenCodeToggles>(key: K, value: OpenCodeToggles[K]) => void;

  /** 设置上次同步的云端 version */
  setLastSyncedVersion: (v: number | null) => void;

  /** 设置上次同步的数据快照（上传或下载成功后调） */
  setLastSyncedSnapshot: (snapshot: PayloadData | null) => void;

  /** 设置 Claude Code 选中的服务商 */
  setClaudeSelectedProviderId: (id: string | null) => void;
  /** 设置 Claude Code 模型变体 */
  setClaudeModels: (m: Partial<{ default: string; sonnet: string; opus: string; haiku: string }>) => void;

  /** 切换全局同步弹窗显示 */
  setSyncModalOpen: (open: boolean) => void;

  /** 整体替换（用于云同步下载）。空值保持默认 */
  replaceAll: (data: {
    claude?: Partial<ClaudeToggles>;
    opencode?: Partial<OpenCodeToggles>;
    lastSyncedVersion?: number | null;
    lastSyncedSnapshot?: PayloadData | null;
    /** 若提供，在 set 回调内调用（此时新 toggles 已就绪），返回值写入 lastSyncedSnapshot */
    buildSnapshot?: (newClaude: ClaudeToggles, newOpencode: OpenCodeToggles) => PayloadData;
  }) => void;

  /** 从 localStorage 加载 */
  loadFromStorage: () => void;
  /** 持久化到 localStorage */
  saveToStorage: () => void;
}

const STORAGE_KEY = 'ai-switch-settings';

function isClaudeTogglesKey(k: string): k is keyof ClaudeToggles {
  return k in DEFAULT_CLAUDE;
}

function isOpencodeTogglesKey(k: string): k is keyof OpenCodeToggles {
  return k in DEFAULT_OPENCODE;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  claude: { ...DEFAULT_CLAUDE },
  opencode: { ...DEFAULT_OPENCODE },
  lastSyncedVersion: null,
  lastSyncedSnapshot: null,
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

  setLastSyncedSnapshot: (snapshot) => {
    set({ lastSyncedSnapshot: snapshot });
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

  replaceAll: (data) => {
    set((s) => {
      const nextClaude = { ...s.claude };
      if (data.claude) {
        for (const [k, v] of Object.entries(data.claude)) {
          if (isClaudeTogglesKey(k) && v !== undefined) {
            (nextClaude as Record<string, unknown>)[k] = v;
          }
        }
      }
      const nextOpencode = { ...s.opencode };
      if (data.opencode) {
        for (const [k, v] of Object.entries(data.opencode)) {
          if (isOpencodeTogglesKey(k) && v !== undefined) {
            (nextOpencode as Record<string, unknown>)[k] = v;
          }
        }
      }
      const nextLastSyncedSnapshot =
        data.lastSyncedSnapshot !== undefined
          ? data.lastSyncedSnapshot
          : data.buildSnapshot
            ? data.buildSnapshot(nextClaude, nextOpencode)
            : s.lastSyncedSnapshot;

      return {
        claude: nextClaude,
        opencode: nextOpencode,
        lastSyncedVersion:
          data.lastSyncedVersion !== undefined ? data.lastSyncedVersion : s.lastSyncedVersion,
        lastSyncedSnapshot: nextLastSyncedSnapshot,
      };
    });
    get().saveToStorage();
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
      const lastSyncedSnapshot =
        data.lastSyncedSnapshot && typeof data.lastSyncedSnapshot === 'object'
          ? data.lastSyncedSnapshot
          : null;
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
      set({
        claude,
        opencode,
        lastSyncedVersion,
        lastSyncedSnapshot,
        claudeSelectedProviderId,
        claudeModels,
      });
    } catch {
      /* ignore */
    }
  },

  saveToStorage: () => {
    const {
      claude, opencode, lastSyncedVersion, lastSyncedSnapshot,
      claudeSelectedProviderId, claudeModels,
    } = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        claude, opencode, lastSyncedVersion, lastSyncedSnapshot,
        claudeSelectedProviderId, claudeModels,
      }),
    );
  },
}));

/** 默认值导出（供 fallback 使用） */
export const DEFAULT_SETTINGS = {
  claude: DEFAULT_CLAUDE,
  opencode: DEFAULT_OPENCODE,
  claudeModels: DEFAULT_CLAUDE_MODELS,
};