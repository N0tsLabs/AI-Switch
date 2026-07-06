import { useEffect, useState } from 'react';
import { syncCheckVersion } from '../lib/tauri';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useCloudSync } from '../hooks/useCloudSync';
import { computeSyncStatus, statusLabel, statusColor } from '../utils/syncStatus';
import { getPayloadData } from '../utils/equal';

/**
 * 全局云同步弹窗。受 settingsStore.syncModalOpen 控制。
 * 根据本地/云端状态显示两选项（冲突）或单选项（单边变更）。
 */
export function SyncModal() {
  const open = useSettingsStore((s) => s.syncModalOpen);
  const setOpen = useSettingsStore((s) => s.setSyncModalOpen);
  const lastSyncedSnapshot = useSettingsStore((s) => s.lastSyncedSnapshot);
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);

  const providers = useModelStore((s) => s.providers);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const claudeToggles = useSettingsStore((s) => s.claude);
  const opencodeToggles = useSettingsStore((s) => s.opencode);

  const { syncUp, syncDown } = useCloudSync();

  // 打开时主动探测云端 version（不依赖外部缓存）
  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  const [cloudChecking, setCloudChecking] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCloudChecking(true);
    syncCheckVersion()
      .then((info) => {
        if (cancelled) return;
        setCloudVersion(info.version);
        // 顺便缓存供其他地方使用
        if (info.version !== null) localStorage.setItem('ai-switch-cloud-version', String(info.version));
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setCloudChecking(false); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const currentData = getPayloadData({
    providers, profiles, activeProfileId,
    claudeToggles: claudeToggles, opencodeToggles: opencodeToggles,
  });

  const info = computeSyncStatus(
    currentData,
    lastSyncedSnapshot,
    lastSyncedVersion,
    cloudVersion,
  );

  const lastData = info.last ?? currentData; // neverSynced 时无对照
  const color = statusColor(info.status);
  const [busy, setBusy] = useState<'upload' | 'download' | null>(null);

  const close = () => setOpen(false);

  const handleUpload = async () => {
    setBusy('upload');
    const ok = await syncUp();
    setBusy(null);
    if (ok) close();
  };

  const handleDownload = async () => {
    setBusy('download');
    const ok = await syncDown();
    setBusy(null);
    if (ok) close();
  };

  // 单边状态：单一操作按钮即可
  const renderActions = () => {
    if (info.status === 'clean') return null;
    const btnBase =
      'flex-1 px-4 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    if (info.status === 'localDirty' || info.status === 'neverSynced') {
      return (
        <button onClick={handleUpload} disabled={!!busy}
          className={`${btnBase} bg-emerald-600 hover:bg-emerald-700 text-white`}>
          {busy === 'upload' ? '上传中…' : '↑ 上传到云端（覆盖云端）'}
        </button>
      );
    }
    if (info.status === 'cloudNewer') {
      return (
        <button onClick={handleDownload} disabled={!!busy}
          className={`${btnBase} bg-blue-600 hover:bg-blue-700 text-white`}>
          {busy === 'download' ? '下载中…' : '↓ 从云端下载（覆盖本地）'}
        </button>
      );
    }
    // conflict：两个选项 + 取消
    return (
      <>
        <button onClick={handleUpload} disabled={!!busy}
          className={`${btnBase} bg-emerald-600 hover:bg-emerald-700 text-white`}>
          {busy === 'upload' ? '上传中…' : '↑ 本地优先（覆盖云端）'}
        </button>
        <button onClick={handleDownload} disabled={!!busy}
          className={`${btnBase} bg-blue-600 hover:bg-blue-700 text-white`}>
          {busy === 'download' ? '下载中…' : '↓ 云端优先（覆盖本地）'}
        </button>
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) close(); }}
    >
      <div className={`bg-zinc-900 border rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden ${color.border}`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${color.border} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
            <h2 className={`text-base font-semibold ${color.text}`}>
              选择同步方式 · {statusLabel(info.status)}
            </h2>
          </div>
          {!busy && (
            <button onClick={close} className="text-zinc-500 hover:text-white text-xl leading-none">✕</button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {info.status === 'conflict' && (
            <div className={`p-3 rounded-lg ${color.bg} border ${color.border}`}>
              <p className={`text-sm ${color.text} font-medium`}>⚡ 检测到冲突</p>
              <p className="text-xs text-zinc-400 mt-1">
                本地和云端都有改动。两侧内容不同，请明确选择以哪一侧为准。
              </p>
              <p className="text-[10px] text-zinc-500 mt-2">
                共同基线 v{lastSyncedVersion ?? '?'} · 本地已改动 · 云端 v{info.cloudVersion}
              </p>
            </div>
          )}

          {info.status === 'neverSynced' && (
            <div className={`p-3 rounded-lg ${color.bg} border ${color.border}`}>
              <p className={`text-sm ${color.text} font-medium`}>ℹ 首次同步</p>
              <p className="text-xs text-zinc-400 mt-1">本地数据从未上传过云端。</p>
            </div>
          )}

          {info.status === 'cloudNewer' && (
            <div className={`p-3 rounded-lg ${color.bg} border ${color.border}`}>
              <p className={`text-sm ${color.text} font-medium`}>☁ 云端有新版本</p>
              <p className="text-xs text-zinc-400 mt-1">
                其他设备上传了更新。下载将覆盖你的本地内容。
              </p>
            </div>
          )}

          {info.status === 'localDirty' && (
            <div className={`p-3 rounded-lg ${color.bg} border ${color.border}`}>
              <p className={`text-sm ${color.text} font-medium`}>⚠ 本地有未上传的改动</p>
              <p className="text-xs text-zinc-400 mt-1">
                上传将覆盖云端当前内容。
              </p>
            </div>
          )}

          {/* 内容对比（冲突时显示） */}
          {info.status === 'conflict' && (
            <div className="grid grid-cols-2 gap-3">
              <CompareCard
                emoji="💻"
                title="本地（你的）"
                data={info.current}
                tone="local"
              />
              <CompareCard
                emoji="☁"
                title={`云端（v${info.cloudVersion ?? '?'}）`}
                data={lastData}
                tone="cloud"
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-zinc-800 flex gap-3">
          {renderActions()}
          {!busy && (
            <button onClick={close}
              className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CompareCard({
  emoji, title, data, tone,
}: {
  emoji: string;
  title: string;
  data: ReturnType<typeof getPayloadData>;
  tone: 'local' | 'cloud';
}) {
  const providers = (data.providers as Array<{ apiKey?: string }>) ?? [];
  const profiles = (data.profiles as unknown[]) ?? [];
  const claude = (data.claudeToggles as Record<string, unknown>) ?? {};
  return (
    <div className={`rounded-xl border p-3 ${
      tone === 'local' ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-blue-500/5 border-blue-500/30'
    }`}>
      <p className={`text-sm font-medium flex items-center gap-2 ${
        tone === 'local' ? 'text-emerald-300' : 'text-blue-300'
      }`}>
        <span>{emoji}</span>{title}
      </p>
      <div className="mt-2 space-y-1 text-xs text-zinc-400">
        <p>服务商 <span className="text-zinc-200">{providers.length}</span> 个</p>
        <p>方案 <span className="text-zinc-200">{profiles.length}</span> 个</p>
        <p>行为开关 <span className="text-zinc-200">
          {Object.values(claude).filter((v) => v === true).length}
        </span> 个开启</p>
      </div>
    </div>
  );
}