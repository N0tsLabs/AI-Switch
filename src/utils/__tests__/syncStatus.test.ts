import { describe, it, expect } from 'vitest';
import { computeSyncStatus } from '../syncStatus';

const empty = { providers: [], profiles: [], activeProfileId: null, claudeToggles: {}, opencodeToggles: {} };

describe('computeSyncStatus', () => {
  it('returns neverSynced when no snapshot', () => {
    const info = computeSyncStatus(empty, null, null, null);
    expect(info.status).toBe('neverSynced');
  });

  it('returns neverSynced when no snapshot even with cloud version', () => {
    const info = computeSyncStatus(empty, null, null, 5);
    expect(info.status).toBe('neverSynced');
  });

  it('returns clean when local matches snapshot and cloud version is same', () => {
    const snapshot = { ...empty };
    const info = computeSyncStatus(empty, snapshot, 3, 3);
    expect(info.status).toBe('clean');
  });

  it('returns clean when local matches snapshot and cloud version is null', () => {
    const snapshot = { ...empty };
    const info = computeSyncStatus(empty, snapshot, 3, null);
    expect(info.status).toBe('clean');
  });

  it('returns localDirty when local differs and cloud is not ahead', () => {
    const snapshot = { ...empty };
    const changed = { ...empty, activeProfileId: 'new-id' };
    const info = computeSyncStatus(changed, snapshot, 3, 3);
    expect(info.status).toBe('localDirty');
  });

  it('returns cloudNewer when local is clean and cloud version is higher', () => {
    const snapshot = { ...empty };
    const info = computeSyncStatus(empty, snapshot, 2, 5);
    expect(info.status).toBe('cloudNewer');
  });

  it('returns conflict when local is dirty AND cloud version is higher', () => {
    const snapshot = { ...empty };
    const changed = { ...empty, activeProfileId: 'new-id' };
    const info = computeSyncStatus(changed, snapshot, 2, 5);
    expect(info.status).toBe('conflict');
  });

  it('handles cloudVersion being undefined', () => {
    const snapshot = { ...empty };
    const info = computeSyncStatus(empty, snapshot, 3, undefined);
    expect(info.status).toBe('clean');
  });

  it('handles lastSyncedVersion null but cloud has version', () => {
    const snapshot = { ...empty };
    const changed = { ...empty, activeProfileId: 'x' };
    const info = computeSyncStatus(changed, snapshot, null, 5);
    expect(info.status).toBe('conflict');
  });

  it('handles cloud not found (version null, notFound)', () => {
    const snapshot = { ...empty };
    const info = computeSyncStatus(empty, snapshot, 1, null);
    expect(info.status).toBe('clean');
    expect(info.cloudVersion).toBeNull();
  });
});

// Test the status helper functions
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
});
