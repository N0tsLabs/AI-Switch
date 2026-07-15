import { useEffect, useState, useRef } from 'react';
import { syncCheckVersion } from '../lib/tauri';
import { useModelStore, migrateProvider, getActiveKeyValue, type Provider } from '../stores/modelStore';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const providers = useModelStore((s) => s.providers);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const claudeToggles = useSettingsStore((s) => s.claude);
  const opencodeToggles = useSettingsStore((s) => s.opencode);

  const { syncUp, syncDown } = useCloudSync();

  // 打开时主动探测云端 version（不依赖外部缓存）
  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  const [cloudChecking, setCloudChecking] = useState(false);
  const [busy, setBusy] = useState<'upload' | 'download' | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    document.body.style.overflow = 'hidden';
    previousFocusRef.current = document.activeElement as HTMLElement;
    setTimeout(() => modalRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    setCloudChecking(true);
    syncCheckVersion()
      .then((info) => {
        if (cancelled) return;
        setCloudVersion(info.version);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setCloudChecking(false); });

    return () => {
      cancelled = true;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, busy]);

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

  const close = () => setOpen(false);

  const handleUpload = async () => {
    setBusy('upload');
    try {
      const ok = await syncUp();
      if (ok) close();
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      const ok = await syncDown();
      if (ok) close();
    } finally {
      setBusy(null);
    }
  };

  // 单边状态：单一操作按钮即可
  const renderActions = () => {
    if (info.status === 'clean') return null;
    const btnBase =
      'flex-1 px-4 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    if (info.status === 'localDirty') {
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
      ref={modalRef}
      tabIndex={-1}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 outline-none"
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
          {cloudChecking && (
            <div className="flex items-center gap-3 py-4 text-zinc-400 text-sm">
              <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
              正在检查云端版本…
            </div>
          )}

          {!cloudChecking && info.status === 'conflict' && (
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

          {!cloudChecking && info.status === 'neverSynced' && (
            <div className={`p-3 rounded-lg ${color.bg} border ${color.border}`}>
              <p className={`text-sm ${color.text} font-medium`}>ℹ 首次同步</p>
              <p className="text-xs text-zinc-400 mt-1">
                本地尚未与云端同步过。请选择方向：上传本地覆盖云端，或下载云端覆盖本地。
              </p>
            </div>
          )}

          {!cloudChecking && info.status === 'cloudNewer' && (
            <div className={`p-3 rounded-lg ${color.bg} border ${color.border}`}>
              <p className={`text-sm ${color.text} font-medium`}>☁ 云端有新版本</p>
              <p className="text-xs text-zinc-400 mt-1">
                其他设备上传了更新。下载将覆盖你的本地内容。
              </p>
            </div>
          )}

          {!cloudChecking && info.status === 'localDirty' && (
            <>
              <div className={`p-3 rounded-lg ${color.bg} border ${color.border}`}>
                <p className={`text-sm ${color.text} font-medium`}>⚠ 本地有未上传的改动</p>
                <p className="text-xs text-zinc-400 mt-1">
                  以下是自上次同步（v{lastSyncedVersion ?? '?'}）以来的本地变更：
                </p>
              </div>
              <ChangesSummary current={info.current} last={info.last} />
            </>
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
          {!cloudChecking && renderActions()}
          {!busy && (
            <button onClick={close}
              className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">
              {cloudChecking ? '取消' : '取消'}
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

/**
 * 逐项对比上次 snapshot 和当前数据，列出变更明细。
 * 先把 snapshot 的 providers 迁移到新格式，再按字段逐项对比。
 */
function ChangesSummary({
  current, last,
}: {
  current: ReturnType<typeof getPayloadData>;
  last: ReturnType<typeof getPayloadData> | null;
}) {
  if (!last) return null;

  // 迁移 snapshot 数据，确保和新格式对齐
  const curProviders = (current.providers as Provider[]) ?? [];
  const rawLastProviders = (last.providers as Provider[]) ?? [];
  const lastProviders = rawLastProviders.map(migrateProvider);
  const curProfiles = (current.profiles as Array<{ id?: string; name?: string }>) ?? [];
  const lastProfiles = (last.profiles as Array<{ id?: string; name?: string }>) ?? [];
  const curToggles = (current.claudeToggles as Record<string, boolean>) ?? {};
  const lastToggles = (last.claudeToggles as Record<string, boolean>) ?? {};

  // ---- 服务商 diff ----
  const lastById = new Map(lastProviders.map((p) => [p.id, p]));
  const curById = new Map(curProviders.map((p) => [p.id, p]));
  const added = curProviders.filter((p) => p.id && !lastById.has(p.id));
  const removed = lastProviders.filter((p) => p.id && !curById.has(p.id));

  // 同名 provider 的具体字段变更
  const fieldChanges: string[] = [];
  for (const cur of curProviders) {
    const prev = lastById.get(cur.id);
    if (!prev) continue;
    const name = cur.name || prev.name || cur.id;
    for (const field of ['anthropicUrl', 'openaiUrl'] as const) {
      const vc = cur[field] ?? '';
      const vp = prev[field] ?? '';
      if (vc !== vp) {
        if (vp && !vc) fieldChanges.push(`「${name}」删除了 ${field === 'anthropicUrl' ? 'Anthropic URL' : 'OpenAI URL'}`);
        else if (!vp && vc) fieldChanges.push(`「${name}」新增了 ${field === 'anthropicUrl' ? 'Anthropic URL' : 'OpenAI URL'}`);
        else fieldChanges.push(`「${name}」的 ${field === 'anthropicUrl' ? 'Anthropic URL' : 'OpenAI URL'} 已变更`);
      }
    }
    // API Key 变更
    const curKey = getActiveKeyValue(cur);
    const prevKey = getActiveKeyValue(prev);
    if (curKey && prevKey && curKey !== prevKey) {
      fieldChanges.push(`「${name}」激活的 API Key 已变更`);
    } else if (!prevKey && curKey) {
      fieldChanges.push(`「${name}」添加了 API Key`);
    } else if (prevKey && !curKey) {
      fieldChanges.push(`「${name}」移除了 API Key`);
    }
    // 模型数量
    if ((cur.models?.length ?? 0) !== (prev.models?.length ?? 0)) {
      fieldChanges.push(`「${name}」模型 ${prev.models?.length ?? 0} → ${cur.models?.length ?? 0} 个`);
    }
  }

  // ---- 方案 diff ----
  const lastProfileById = new Map(lastProfiles.map((p) => [p.id, p]));
  const curProfileById = new Map(curProfiles.map((p) => [p.id, p]));
  const addedProfiles = curProfiles.filter((p) => p.id && !lastProfileById.has(p.id));
  const removedProfiles = lastProfiles.filter((p) => p.id && !curProfileById.has(p.id));

  // ---- 开关 diff ----
  const toggleChanges: Array<{ key: string; prev: boolean; next: boolean }> = [];
  const allKeys = new Set([...Object.keys(lastToggles), ...Object.keys(curToggles)]);
  allKeys.forEach((k) => {
    if (curToggles[k] !== lastToggles[k]) {
      toggleChanges.push({ key: k, prev: !!lastToggles[k], next: !!curToggles[k] });
    }
  });

  const hasAny = added.length > 0 || removed.length > 0 || fieldChanges.length > 0
    || addedProfiles.length > 0 || removedProfiles.length > 0 || toggleChanges.length > 0;

  return (
    <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2 text-xs">
      <p className="text-zinc-500 font-medium">变更明细</p>

      {added.map((p) => (
        <ChangeLine key={p.id} tag="+ 新增服务商" color="text-emerald-400">
          {p.name ?? p.id}
        </ChangeLine>
      ))}
      {removed.map((p) => (
        <ChangeLine key={p.id} tag="- 删除服务商" color="text-red-400">
          {p.name ?? p.id}
        </ChangeLine>
      ))}
      {fieldChanges.map((s, i) => (
        <ChangeLine key={`fc${i}`} tag="~ 服务商配置" color="text-amber-400">
          {s}
        </ChangeLine>
      ))}

      {addedProfiles.map((p) => (
        <ChangeLine key={p.id} tag="+ 新增方案" color="text-emerald-400">
          {p.name}
        </ChangeLine>
      ))}
      {removedProfiles.map((p) => (
        <ChangeLine key={p.id} tag="- 删除方案" color="text-red-400">
          {p.name}
        </ChangeLine>
      ))}

      {toggleChanges.length > 0 && (
        <div>
          <span className="text-amber-400">~ 行为开关 </span>
          <span className="text-zinc-500">{toggleChanges.length} 项：</span>
          <span className="text-zinc-400">
            {toggleChanges.map((t) =>
              ` ${t.key} ${t.prev ? '开' : '关'}→${t.next ? '开' : '关'}`
            ).join('，')}
          </span>
        </div>
      )}

      {!hasAny && (
        <p className="text-zinc-600">仅内部元数据变更（ID 或时间戳），可忽略</p>
      )}
    </div>
  );
}

function ChangeLine({
  tag, color, children,
}: {
  tag: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className={color}>{tag}</span>
      <span className="text-zinc-400 ml-1">{children}</span>
    </div>
  );
}

/** 找到 snapshot 和 current 之间第一个原始差异并展示 */
