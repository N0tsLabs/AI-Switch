import { useCallback, useRef } from 'react';
import { syncUpload, syncDownload } from '../lib/tauri';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/useToast';
import { getPayloadData } from '../utils/equal';

export function useCloudSync() {
  const { toast } = useToast();
  const busyRef = useRef(false);
  const user = useAuthStore((s) => s.user);
  const providers = useModelStore((s) => s.providers);
  const replaceAllProviders = useModelStore((s) => s.replaceAll);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const replaceAllProfiles = useProfileStore((s) => s.replaceAll);
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);
  const claude = useSettingsStore((s) => s.claude);
  const opencode = useSettingsStore((s) => s.opencode);
  const replaceAllSettings = useSettingsStore((s) => s.replaceAll);

  const syncUp = useCallback(async () => {
    if (busyRef.current) return false;
    if (!user) {
      toast('请先登录 GitHub', 'error');
      return false;
    }
    busyRef.current = true;
    try {
      const newVersion = (lastSyncedVersion ?? 0) + 1;
      const payload = {
        schemaVersion: 4 as const,
        version: newVersion,
        providers,
        profiles,
        activeProfileId,
        claudeToggles: claude,
        opencodeToggles: opencode,
      };
      const msg = await syncUpload(payload);
      replaceAllSettings({
        lastSyncedVersion: newVersion,
        buildSnapshot: (newClaude, newOpencode) =>
          getPayloadData({
            providers,
            profiles,
            activeProfileId,
            claudeToggles: newClaude,
            opencodeToggles: newOpencode,
          }),
      });
      toast(`${msg}（v${newVersion}）`, 'success');
      return true;
    } catch (e) {
      toast('上传失败: ' + String(e), 'error');
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [user, lastSyncedVersion, providers, profiles, activeProfileId, claude, opencode, replaceAllSettings, toast]);

  const syncDown = useCallback(async () => {
    if (busyRef.current) return false;
    if (!user) {
      toast('请先登录 GitHub', 'error');
      return false;
    }
    busyRef.current = true;

    const backupP = useModelStore.getState().providers;
    const backupPf = useProfileStore.getState().profiles;
    const backupA = useProfileStore.getState().activeProfileId;
    const backupC = useSettingsStore.getState().claude;
    const backupO = useSettingsStore.getState().opencode;

    try {
      const payload = await syncDownload();
      if (!payload.providers || !payload.profiles) {
        throw new Error('下载的数据不完整');
      }
      replaceAllProviders(payload.providers);
      replaceAllProfiles(payload.profiles, payload.activeProfileId);
      replaceAllSettings({
        claude: payload.claudeToggles,
        opencode: payload.opencodeToggles,
        lastSyncedVersion: payload.version,
        buildSnapshot: (newClaude, newOpencode) =>
          getPayloadData({
            providers: useModelStore.getState().providers,
            profiles: useProfileStore.getState().profiles,
            activeProfileId: useProfileStore.getState().activeProfileId,
            claudeToggles: newClaude,
            opencodeToggles: newOpencode,
          }),
      });
      toast(`已同步（云端 v${payload.version}）`, 'success');
      return true;
    } catch (e) {
      replaceAllProviders(backupP);
      replaceAllProfiles(backupPf, backupA);
      replaceAllSettings({ claude: backupC, opencode: backupO });
      toast('拉取失败，已恢复本地数据: ' + String(e), 'error');
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [user, replaceAllProviders, replaceAllProfiles, replaceAllSettings, toast]);

  return { isLoggedIn: !!user, syncUp, syncDown };
}
