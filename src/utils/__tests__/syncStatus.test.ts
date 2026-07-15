import { describe, it, expect } from 'vitest';
import { statusLabel, statusColor } from '../syncStatus';

describe('statusLabel', () => {
  it.each([
    ['clean', '已同步'],
    ['localDirty', '本地待上传'],
    ['cloudNewer', '云端有更新'],
    ['conflict', '冲突'],
    ['neverSynced', '未同步'],
  ])('%s => %s', (status, expected) => {
    expect(statusLabel(status as never)).toBe(expected);
  });
});

describe('statusColor', () => {
  it('clean is green', () => {
    expect(statusColor('clean').dot).toBe('bg-emerald-500');
  });
  it('conflict is red', () => {
    expect(statusColor('conflict').dot).toBe('bg-red-500');
  });
  it('localDirty is amber', () => {
    expect(statusColor('localDirty').dot).toBe('bg-amber-500');
  });
});
