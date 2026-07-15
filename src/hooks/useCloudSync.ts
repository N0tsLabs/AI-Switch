import { useCallback, useRef } from 'react';
import { syncUpload, syncDownload } from '../lib/tauri';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/useToast';

export function useCloudSync() {
  const { toast } = useToast();
  const busyRef = useRef(false);
  const user = useAuthStore((s) => s.user);
  const providers = useModelStore((s) => s.providers);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);
  const setLastSyncedVersion = useSettingsStore((s) => s.setLastSyncedVersion);

  const syncUp = useCallback(async () => {
    if (busyRef.current) return false;
    if (!user) { toast('请先登录 GitHub', 'error'); return false; }
    busyRef.current = true;
    try {
      const newVersion = (lastSyncedVersion ?? 0) + 1;
      const payload = { schemaVersion: 4 as const, version: newVersion, providers, profiles, activeProfileId };
      await syncUpload(payload);
      setLastSyncedVersion(newVersion);
      toast(`已上传（v${newVersion}，${providers.length} 个服务商 + ${profiles.length} 个方案）`, 'success');
      return true;
    } catch (e) {
      toast('上传失败: ' + String(e), 'error');
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [user, lastSyncedVersion, providers, profiles, activeProfileId, setLastSyncedVersion, toast]);

  const syncDown = useCallback(async () => {
    if (busyRef.current) return false;
    if (!user) { toast('请先登录 GitHub', 'error'); return false; }
    busyRef.current = true;
    const replaceAllProviders = useModelStore.getState().replaceAll;
    const replaceAllProfiles = useProfileStore.getState().replaceAll;
    const backupP = useModelStore.getState().providers;
    const backupPf = useProfileStore.getState().profiles;
    const backupA = useProfileStore.getState().activeProfileId;
    try {
      const payload = await syncDownload();
      if (!payload.providers || !payload.profiles) throw new Error('下载的数据不完整');
      replaceAllProviders(payload.providers);
      replaceAllProfiles(payload.profiles, payload.activeProfileId);
      setLastSyncedVersion(payload.version);
      toast(`已同步（云端 v${payload.version}）`, 'success');
      return true;
    } catch (e) {
      replaceAllProviders(backupP);
      replaceAllProfiles(backupPf, backupA);
      toast('拉取失败，已恢复本地: ' + String(e), 'error');
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [user, setLastSyncedVersion, toast]);

  return { isLoggedIn: !!user, syncUp, syncDown };
}
