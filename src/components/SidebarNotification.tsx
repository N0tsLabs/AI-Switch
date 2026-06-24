import { useMemo, useState } from 'react';
import { useCloudSync } from '../hooks/useCloudSync';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getPayloadData, isPayloadDataEqual, type PayloadData } from '../utils/equal';

/**
 * 检测当前本地状态与 lastSyncedSnapshot 是否一致。
 * 返回 { isDirty, snapshot } —— snapshot 为 null 表示从未同步过。
 */
export function useSyncDirty(): { isDirty: boolean; snapshot: PayloadData | null } {
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
    if (!lastSyncedSnapshot) return { isDirty: true, snapshot: null };
    return {
      isDirty: !isPayloadDataEqual(current, lastSyncedSnapshot),
      snapshot: lastSyncedSnapshot,
    };
  }, [providers, profiles, activeProfileId, claude, opencode, lastSyncedSnapshot]);
}

/**
 * Sidebar 底部通知：检测到本地有未同步改动时显示。
 * 点击立即上传到云端。状态由 useSyncDirty 自动计算。
 */
export function SyncReminder() {
  const { isDirty } = useSyncDirty();
  const { isLoggedIn, syncUp } = useCloudSync();
  const [busy, setBusy] = useState(false);

  if (!isLoggedIn) return null;
  if (!isDirty) return null;

  return (
    <SidebarNotification
      icon="🔔"
      title="本地有未同步的改动"
      action={{
        label: busy ? '上传中…' : '立即同步',
        onClick: busy ? () => {} : async () => {
          setBusy(true);
          await syncUp();
          setBusy(false);
        },
      }}
      variant="warning"
    />
  );
}

/**
 * 通用通知容器：左侧 icon + 标题 + 右侧 action 按钮。
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