import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useCloudVersion } from '../hooks/useCloudVersion';

export function SyncReminder() {
  const isLoggedIn = !!useAuthStore((s) => s.user);
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);
  const setSyncModalOpen = useSettingsStore((s) => s.setSyncModalOpen);

  const { cloudVersion, cloudChecking } = useCloudVersion(isLoggedIn, 60_000);

  if (!isLoggedIn) return null;

  const neverSynced = lastSyncedVersion === null;
  const cloudNewer = cloudVersion !== null && (lastSyncedVersion ?? 0) < cloudVersion;

  let title: string;
  if (neverSynced) {
    title = '本地数据未同步过云端';
  } else if (cloudNewer) {
    title = `云端 v${cloudVersion} 有更新（本地 v${lastSyncedVersion}）`;
  } else if (cloudChecking) {
    return null;
  } else {
    return null;
  }

  return (
    <SidebarNotification
      icon={cloudNewer ? '🔔' : '☁️'}
      title={title}
      action={{ label: '选择同步方式', onClick: () => setSyncModalOpen(true) }}
      variant="warning"
    />
  );
}

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
        <button onClick={action.onClick} className="w-full px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] font-medium transition-colors">
          {action.label}
        </button>
      )}
    </div>
  );
}
