import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import { useToast } from './components/useToast';
import { SyncModal } from './components/SyncModal';
import Dashboard from './pages/Dashboard';
import ModelSettings from './pages/ModelSettings';
import AgentTools from './pages/AgentTools';
import ProfileSwitch from './pages/ProfileSwitch';
import CloudSync from './pages/CloudSync';
import { useModelStore } from './stores/modelStore';
import { useProfileStore } from './stores/profileStore';
import { useAuthStore } from './stores/authStore';
import { useUpdateStore } from './stores/updateStore';
import { useSettingsStore } from './stores/settingsStore';
import { syncCheckVersion } from './lib/tauri';

/** 页面切换动画包装器 */
function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (prevPath.current !== location.pathname && ref.current) {
      ref.current.classList.remove('page-enter');
      // 触发 reflow
      void ref.current.offsetWidth;
      ref.current.classList.add('page-enter');
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  return (
    <div ref={ref} className="page-enter">
      {children}
    </div>
  );
}

function AppInner() {
  const loadModels = useModelStore((s) => s.loadFromStorage);
  const loadProfiles = useProfileStore((s) => s.loadFromStorage);
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const loadUser = useAuthStore((s) => s.loadUser);
  const checkUpdate = useUpdateStore((s) => s.check);

  useEffect(() => {
    loadModels();
    loadProfiles();
    loadSettings();
    loadUser();
    checkUpdate();
  }, [loadModels, loadProfiles, loadSettings, loadUser, checkUpdate]);

  return (
    <ToastProvider>
      <BrowserRouter>
        <Layout>
          <PageTransition>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/models" element={<ModelSettings />} />
              <Route path="/tools" element={<AgentTools />} />
              <Route path="/profiles" element={<ProfileSwitch />} />
              <Route path="/sync" element={<CloudSync />} />
            </Routes>
          </PageTransition>
          {/* 必须在 Router 内部才能使用 useNavigate */}
          <CloudSyncWatcher />
        </Layout>
      </BrowserRouter>
      {/* 全局同步弹窗，由 settingsStore.syncModalOpen 控制 */}
      <SyncModal />
    </ToastProvider>
  );
}

/** 启动 + 每小时检查云端版本，必要时弹出 toast 提示打开 SyncModal */
function CloudSyncWatcher() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const info = await syncCheckVersion();
        if (cancelled) return;
        if (info.notFound) return;
        // 旧版数据无 version 字段时按 v0 处理
        const cv = info.version ?? 0;
        const lastSynced = useSettingsStore.getState().lastSyncedVersion ?? 0;
        if (cv > lastSynced) {
          if (!window.location.pathname.startsWith('/sync')) {
            toast(
              `云端有新版本（v${cv}，本地 v${lastSynced}）`,
              'info',
              {
                action: {
                  label: '打开同步',
                  onClick: () => useSettingsStore.getState().setSyncModalOpen(true),
                },
              },
            );
          }
        }
      } catch { /* 未登录或网络错误，忽略 */ }
    };

    const initialTimer = setTimeout(tick, 1500);
    const id = setInterval(tick, 60 * 60 * 1000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(id);
    };
  }, [user, toast]);

  return null;
}

export default function App() {
  return <AppInner />;
}
