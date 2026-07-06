import { isPayloadDataEqual, type PayloadData } from './equal';

/**
 * 同步状态：
 * - clean      本地与 lastSyncedSnapshot 完全一致，且云端 version 等于 lastSyncedVersion
 * - localDirty  本地有改动，但云端 version 还是 lastSyncedVersion
 * - cloudNewer  本地干净，但云端 version > lastSyncedVersion
 * - conflict   本地有改动 且 云端 version > lastSyncedVersion（双向修改，需用户选择）
 * - neverSynced 从未同步过（lastSyncedSnapshot 为 null）
 */
export type SyncStatus =
  | 'clean'
  | 'localDirty'
  | 'cloudNewer'
  | 'conflict'
  | 'neverSynced';

export interface SyncStatusInfo {
  status: SyncStatus;
  /** 当前本地数据快照（用于对比展示） */
  current: PayloadData;
  /** 上次同步的快照（可能为 null） */
  last: PayloadData | null;
  /** 云端 version（可能为 null：探测中或云端无文件） */
  cloudVersion: number | null;
  /** 本地记录的最近同步 version（null = 从未同步） */
  lastSyncedVersion: number | null;
}

/**
 * 计算同步状态。
 *
 * @param current           当前本地数据快照
 * @param lastSyncedSnapshot 上次同步时的本地快照（null = 从未同步过）
 * @param lastSyncedVersion  上次同步时云端的 version（null = 从未同步过）
 * @param cloudVersion       当前云端 version（null = 探测中或云端无文件）
 */
export function computeSyncStatus(
  current: PayloadData,
  lastSyncedSnapshot: PayloadData | null,
  lastSyncedVersion: number | null,
  cloudVersion: number | null | undefined,
): SyncStatusInfo {
  const cv = cloudVersion ?? null;
  const localDirty = !lastSyncedSnapshot || !isPayloadDataEqual(current, lastSyncedSnapshot);
  const cloudAhead = cv !== null && (lastSyncedVersion === null || cv > lastSyncedVersion);

  let status: SyncStatus;
  if (!lastSyncedSnapshot) {
    status = 'neverSynced';
  } else if (localDirty && cloudAhead) {
    status = 'conflict';
  } else if (cloudAhead) {
    status = 'cloudNewer';
  } else if (localDirty) {
    status = 'localDirty';
  } else {
    status = 'clean';
  }

  return {
    status,
    current,
    last: lastSyncedSnapshot,
    cloudVersion: cv,
    lastSyncedVersion,
  };
}

/** 状态简短描述（用于 UI 标签） */
export function statusLabel(status: SyncStatus): string {
  switch (status) {
    case 'clean': return '已同步';
    case 'localDirty': return '本地待上传';
    case 'cloudNewer': return '云端有更新';
    case 'conflict': return '冲突';
    case 'neverSynced': return '未同步';
  }
}

/** 状态对应的颜色类（Tailwind） */
export function statusColor(status: SyncStatus): {
  bg: string;
  border: string;
  text: string;
  dot: string;
} {
  switch (status) {
    case 'clean':
      return { bg: 'bg-emerald-500/5', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-500' };
    case 'localDirty':
    case 'neverSynced':
      return { bg: 'bg-amber-500/5', border: 'border-amber-500/30', text: 'text-amber-300', dot: 'bg-amber-500' };
    case 'cloudNewer':
      return { bg: 'bg-blue-500/5', border: 'border-blue-500/30', text: 'text-blue-300', dot: 'bg-blue-500' };
    case 'conflict':
      return { bg: 'bg-red-500/5', border: 'border-red-500/30', text: 'text-red-300', dot: 'bg-red-500' };
  }
}