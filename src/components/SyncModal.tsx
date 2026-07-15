import { useEffect, useState, useRef } from 'react';
import { syncCheckVersion } from '../lib/tauri';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useCloudSync } from '../hooks/useCloudSync';

export function SyncModal() {
  const open = useSettingsStore((s) => s.syncModalOpen);
  const setOpen = useSettingsStore((s) => s.setSyncModalOpen);
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);

  const providers = useModelStore((s) => s.providers);
  const profiles = useProfileStore((s) => s.profiles);

  const { syncUp, syncDown } = useCloudSync();

  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  const [cloudChecking, setCloudChecking] = useState(false);
  const [busy, setBusy] = useState<'upload' | 'download' | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    previousFocusRef.current = document.activeElement as HTMLElement;
    setTimeout(() => modalRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);

    let cancelled = false;
    setCloudChecking(true);
    syncCheckVersion()
      .then((info) => { if (!cancelled) setCloudVersion(info.version ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCloudChecking(false); });

    return () => {
      cancelled = true;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const neverSynced = lastSyncedVersion === null;
  const cloudNewer = cloudVersion !== null && (lastSyncedVersion ?? 0) < cloudVersion;
  const localNewer = !neverSynced && (cloudVersion === null || (lastSyncedVersion ?? 0) > (cloudVersion ?? 0));

  const close = () => { if (!busy) setOpen(false); };

  const handleUpload = async () => {
    setBusy('upload');
    try { const ok = await syncUp(); if (ok) close(); } finally { setBusy(null); }
  };
  const handleDownload = async () => {
    setBusy('download');
    try { const ok = await syncDown(); if (ok) close(); } finally { setBusy(null); }
  };

  const btnBase = 'flex-1 px-4 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const statusInfo = () => {
    if (cloudChecking) return { text: '正在检查云端…', color: 'text-zinc-400', dot: 'bg-zinc-500' };
    if (neverSynced) return { text: '从未同步', color: 'text-amber-300', dot: 'bg-amber-500' };
    if (cloudNewer) return { text: `云端 v${cloudVersion} 更新（本地 v${lastSyncedVersion}）`, color: 'text-blue-300', dot: 'bg-blue-500' };
    if (localNewer) return { text: `本地 v${lastSyncedVersion} 更新（云端 v${cloudVersion ?? '?'}）`, color: 'text-emerald-300', dot: 'bg-emerald-500' };
    return { text: `已同步（v${lastSyncedVersion}）`, color: 'text-emerald-300', dot: 'bg-emerald-500' };
  };
  const status = statusInfo();

  return (
    <div ref={modalRef} tabIndex={-1}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 outline-none"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
            <h2 className={`text-base font-semibold ${status.color}`}>{status.text}</h2>
          </div>
          {!busy && <button onClick={close} className="text-zinc-500 hover:text-white text-xl leading-none">✕</button>}
        </div>

        <div className="px-6 py-5 space-y-4">
          {cloudChecking ? (
            <div className="flex items-center gap-3 py-4 text-zinc-400 text-sm">
              <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
              正在检查云端版本…
            </div>
          ) : (
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex justify-between">
                <span>本地服务商</span><span className="text-white">{providers.length} 个</span>
              </div>
              <div className="flex justify-between">
                <span>本地方案</span><span className="text-white">{profiles.length} 个</span>
              </div>
              <div className="flex justify-between">
                <span>本地版本</span><span className="text-white">v{lastSyncedVersion ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>云端版本</span><span className="text-white">v{cloudVersion ?? '—'}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleUpload} disabled={!!busy}
              className={`${btnBase} bg-emerald-600 hover:bg-emerald-700 text-white`}>
              {busy === 'upload' ? '上传中…' : '↑ 上传（覆盖云端）'}
            </button>
            <button onClick={handleDownload} disabled={!!busy}
              className={`${btnBase} bg-blue-600 hover:bg-blue-700 text-white`}>
              {busy === 'download' ? '下载中…' : '↓ 下载（覆盖本地）'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
