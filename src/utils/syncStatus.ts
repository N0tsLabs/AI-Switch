export type SyncStatus =
  | 'clean'
  | 'localDirty'
  | 'cloudNewer'
  | 'conflict'
  | 'neverSynced';

export function statusLabel(status: SyncStatus): string {
  switch (status) {
    case 'clean': return '已同步';
    case 'localDirty': return '本地待上传';
    case 'cloudNewer': return '云端有更新';
    case 'conflict': return '冲突';
    case 'neverSynced': return '未同步';
  }
}

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
