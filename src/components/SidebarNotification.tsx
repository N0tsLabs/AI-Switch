import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getPayloadData, isPayloadDataEqual, type PayloadData } from '../utils/equal';
import { computeSyncStatus, statusLabel, type SyncStatus } from '../utils/syncStatus';

/**
 * 检测同步状态。
 * 返回 { isDirty, status, snapshot } —— status 描述详细同步情况。
 */
export function useSyncDirty(): {
  isDirty: boolean;
  status: SyncStatus;
  snapshot: PayloadData | null;
} {
  const providers = useModelStore((s) => s.providers);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const claude = useSettingsStore((s) => s.claude);
  const opencode = useSettingsStore((s) => s.opencode);
  const lastSyncedSnapshot = useSettingsStore((s) => s.lastSyncedSnapshot);

  return useMemo(() => {
    const current: PayloadData = getPayloadData({
      providers, profiles, activeProfileId, claudeToggles: claude, opencodeToggles: opencode,
    });
    if (!lastSyncedSnapshot) {
      return { isDirty: true, status: 'neverSynced', snapshot: null };
    }
    const dirty = !isPayloadDataEqual(current, lastSyncedSnapshot);
    // 这里只基于本地判断粗略 status；冲突检测需要 cloudVersion，由 SyncModal 处理
    const status: SyncStatus = dirty ? 'localDirty' : 'clean';
    return { isDirty: dirty, status, snapshot: lastSyncedSnapshot };
  }, [providers, profiles, activeProfileId, claude, opencode, lastSyncedSnapshot]);
}

/**
 * Sidebar 底部通知：检测到本地有未同步改动时显示。
 * 点击打开 SyncModal（用户选择上传/下载/取消）。
 */
export function SyncReminder() {
  const { isDirty, status } = useSyncDirty();
  const isLoggedIn = !!useAuthStore((s) => s.user);
  const setSyncModalOpen = useSettingsStore((s) => s.setSyncModalOpen);

  if (!isLoggedIn) return null;
  if (!isDirty) return null;

  const titleMap: Record<SyncStatus, string> = {
    neverSynced: '本地数据未同步过云端',
    localDirty: '本地有未同步的改动',
    cloudNewer: '云端有更新（点击查看）',
    conflict: '本地与云端都有改动（点击处理）',
    clean: '',
  };

  return (
    <SidebarNotification
      icon="🔔"
      title={titleMap[status]}
      action={{
        label: '选择同步方式',
        onClick: () => setSyncModalOpen(true),
      }}
      variant="warning"
    />
  );
}

/**
 * 通用通知容器：左侧 icon + 标题 + 全宽按钮。
 * 后续可扩展其他类型的全局通知。
 */
export function SidebarNotification({
  icon,
  title,
  action,
  variant = 'info',
}: {
  icon: string;
  title: string;
  action?: { label: string; onClick: () => void };
  variant?: 'info' | 'warning' | 'success';
}) {
  const colorClass =
    variant === 'warning'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      : variant === 'success'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-300';

  return (
    <div className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-lg border ${colorClass} text-xs`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-sm leading-snug">{icon}</span>
        <span className="flex-1 whitespace-normal break-words leading-snug">{title}</span>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="w-full px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}