import { useCallback } from 'react';
import { syncUpload, syncDownload } from '../lib/tauri';
import { useModelStore } from '../stores/modelStore';
import { useProfileStore } from '../stores/profileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/useToast';
import { getPayloadData } from '../utils/equal';

/**
 * 共享的云同步 hook。
 * - syncUp: 从本地构建 payload → 上传 → 保存 snapshot
 * - syncDown: 下载 → 替换本地 stores → 保存 snapshot
 * 返回 { isLoggedIn, busy } 和两个 handler，可被 CloudSync 页和 Sidebar 复用。
 */
export function useCloudSync() {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const providers = useModelStore((s) => s.providers);
  const replaceAllProviders = useModelStore((s) => s.replaceAll);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const replaceAllProfiles = useProfileStore((s) => s.replaceAll);
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);
  const setLastSyncedVersion = useSettingsStore((s) => s.setLastSyncedVersion);
  const setLastSyncedSnapshot = useSettingsStore((s) => s.setLastSyncedSnapshot);
  const claude = useSettingsStore((s) => s.claude);
  const opencode = useSettingsStore((s) => s.opencode);
  const replaceAllSettings = useSettingsStore((s) => s.replaceAll);

  const syncUp = useCallback(async () => {
    if (!user) {
      toast('请先登录 GitHub', 'error');
      return false;
    }
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
    try {
      const msg = await syncUpload(payload);
      setLastSyncedVersion(newVersion);
      setLastSyncedSnapshot(getPayloadData(payload));
      toast(
        `${msg}（v${newVersion}，${providers.length} 个服务商 + ${profiles.length} 个方案）`,
        'success',
      );
      return true;
    } catch (e) {
      toast('上传失败: ' + String(e), 'error');
      return false;
    }
  }, [
    user, lastSyncedVersion, providers, profiles, activeProfileId,
    claude, opencode, setLastSyncedVersion, setLastSyncedSnapshot, toast,
  ]);

  const syncDown = useCallback(async () => {
    if (!user) {
      toast('请先登录 GitHub', 'error');
      return false;
    }
    try {
      const payload = await syncDownload();
      replaceAllProviders(payload.providers ?? []);
      replaceAllProfiles(payload.profiles, payload.activeProfileId);
      replaceAllSettings({
        claude: payload.claudeToggles,
        opencode: payload.opencodeToggles,
        lastSyncedVersion: payload.version,
        lastSyncedSnapshot: getPayloadData(payload),
      });
      toast(
        `已同步 ${payload.providers?.length ?? 0} 个服务商 + ${payload.profiles.length} 个方案 + 行为开关（云端 v${payload.version}）。`,
        'success',
      );
      return true;
    } catch (e) {
      toast('拉取失败: ' + String(e), 'error');
      return false;
    }
  }, [
    user, replaceAllProviders, replaceAllProfiles, replaceAllSettings, toast,
  ]);

  return {
    isLoggedIn: !!user,
    syncUp,
    syncDown,
  };
}