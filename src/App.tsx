import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import Dashboard from './pages/Dashboard';
import ModelSettings from './pages/ModelSettings';
import AgentTools from './pages/AgentTools';
import ProfileSwitch from './pages/ProfileSwitch';
import CloudSync from './pages/CloudSync';
import { useModelStore } from './stores/modelStore';
import { useProfileStore } from './stores/profileStore';
import { useAuthStore } from './stores/authStore';
import { useUpdateStore } from './stores/updateStore';

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
  const loadUser = useAuthStore((s) => s.loadUser);
  const checkUpdate = useUpdateStore((s) => s.check);

  useEffect(() => {
    loadModels();
    loadProfiles();
    loadUser();
    checkUpdate();
  }, []);

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
        </Layout>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default function App() {
  return <AppInner />;
}
