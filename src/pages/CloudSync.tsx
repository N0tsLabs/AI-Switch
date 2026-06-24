import { useState, useEffect, useRef } from 'react';
import { deviceFlowStart, deviceFlowPoll, githubLogout, syncCheckVersion, openUrl } from '../lib/tauri';
import { useToast } from '../components/useToast';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useCloudSync } from '../hooks/useCloudSync';

type LoginStep = 'idle' | 'requesting' | 'waiting' | 'polling' | 'success' | 'error';

export default function CloudSync() {
  const { toast } = useToast();
  const { user, loadUser, clearUser } = useAuthStore();
  const lastSyncedVersion = useSettingsStore((s) => s.lastSyncedVersion);
  const { syncUp, syncDown, isLoggedIn } = useCloudSync();
  const [step, setStep] = useState<LoginStep>('idle');
  const [userCode, setUserCode] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [syncingUp, setSyncingUp] = useState(false);
  const [syncingDown, setSyncingDown] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  const [cloudNotFound, setCloudNotFound] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudChecking, setCloudChecking] = useState(false);
  const stoppedRef = useRef(false);

  // 进入页面时探测云端版本（轻量，不下载 payload）
  useEffect(() => {
    if (!user) {
      setCloudVersion(null);
      setCloudNotFound(false);
      setCloudError(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      setCloudChecking(true);
      try {
        const info = await syncCheckVersion();
        if (cancelled) return;
        setCloudVersion(info.version);
        setCloudNotFound(info.notFound);
        setCloudError(info.error ?? null);
      } catch (e) {
        if (cancelled) return;
        setCloudError('前端错误: ' + String(e));
      } finally {
        if (!cancelled) setCloudChecking(false);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [user, lastSyncedVersion]);

  // 如果已登录，直接设为 success（用 ref 避免同步 setState 触发级联渲染）
  const hasSetSuccess = useRef(false);
  useEffect(() => {
    if (user && step === 'idle' && !hasSetSuccess.current) {
      hasSetSuccess.current = true;
      setStep('success');
    }
  }, [user, step]);

  const startLogin = async () => {
    setStep('requesting');
    setErrorMsg('');
    try {
      const resp = await deviceFlowStart();
      setUserCode(resp.user_code);
      setVerifyUrl(resp.verification_uri);
      setStep('waiting');
      try { await navigator.clipboard.writeText(resp.user_code); } catch { /* ignore */ }
      openUrl(resp.verification_uri).catch(() => {});
      startPolling(resp.device_code, resp.interval);
    } catch (e) {
      setErrorMsg(String(e));
      setStep('error');
    }
  };

  const startPolling = (deviceCode: string, interval: number) => {
    setStep('polling');
    stoppedRef.current = false;
    let currentInterval = Math.max(interval, 5) * 1000;

    const poll = async () => {
      if (stoppedRef.current) return;
      try {
        await deviceFlowPoll(deviceCode);
        stoppedRef.current = true;
        useAuthStore.setState({ loaded: false, loading: false });
        await loadUser();
        setStep('success');
      } catch (e: unknown) {
        const msg = String(e);
        if (msg.includes('slow_down')) currentInterval += 5000;
        if (msg.includes('pending') || msg.includes('slow_down')) {
          setTimeout(poll, currentInterval);
          return;
        }
        stoppedRef.current = true;
        setErrorMsg(msg === 'expired' ? '验证码已过期' : msg === 'denied' ? '用户取消授权' : msg);
        setStep('error');
      }
    };
    setTimeout(poll, currentInterval);
  };

  const handleLogout = async () => {
    stoppedRef.current = true;
    await githubLogout();
    clearUser();
    setStep('idle');
  };

  const handleSyncUp = async () => {
    setSyncingUp(true);
    const ok = await syncUp();
    setSyncingUp(false);
    if (ok) setLastSync(new Date().toLocaleString());
  };

  const handleSyncDown = async () => {
    setSyncingDown(true);
    const ok = await syncDown();
    setSyncingDown(false);
    if (ok) setLastSync(new Date().toLocaleString());
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">云同步</h1>
        <p className="text-sm text-zinc-500 mt-1">通过 GitHub 私有仓库同步配置</p>
      </div>

      {/* 同步状态卡（始终显示） */}
      <CloudSyncStatusCard
        loggedIn={!!user}
        cloudVersion={cloudVersion}
        cloudNotFound={cloudNotFound}
        lastSyncedVersion={lastSyncedVersion}
        cloudError={cloudError}
        cloudChecking={cloudChecking}
      />

      {/* 账号状态 */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {user.avatar_url ? (
                  <img src={user.avatar_url} className="w-9 h-9 rounded-full ring-2 ring-zinc-700" alt="" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm text-zinc-400">U</div>
                )}
                <div>
                  <p className="text-sm font-medium text-white">{user.login}</p>
                  <p className="text-xs text-zinc-500">已连接</p>
                </div>
              </>
            ) : (step === 'waiting' || step === 'polling') ? (
              <>
                <div className="w-9 h-9 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <div className="spinner" style={{ borderTopColor: '#818cf8' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">等待授权</p>
                  <p className="text-xs text-zinc-500">请在浏览器中完成验证</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
                  <svg className="w-4 h-4 text-zinc-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">未连接</p>
                  <p className="text-xs text-zinc-500">登录 GitHub 同步配置</p>
                </div>
              </>
            )}
          </div>

          <div>
            {user ? (
              <button onClick={handleLogout} className="btn btn-ghost btn-sm">退出</button>
            ) : (step === 'idle' || step === 'error') ? (
              <button onClick={startLogin} className="btn btn-primary btn-sm">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                登录
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <div className="spinner" /> 处理中...
              </div>
            )}
          </div>
        </div>

        {/* 验证码 */}
        {(step === 'waiting' || step === 'polling') && (
          <div className="mt-4 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
            <p className="text-xs text-zinc-500 mb-2">在浏览器中访问并输入验证码：</p>
            <div className="flex items-center gap-3">
              <code className="text-2xl font-mono font-bold text-white tracking-widest">{userCode}</code>
              <button onClick={() => { navigator.clipboard.writeText(userCode); toast('已复制', 'success'); }}
                className="btn btn-ghost btn-sm text-xs">复制</button>
            </div>
            <p className="text-xs text-zinc-600 mt-2">{verifyUrl}</p>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400">{errorMsg}</p>
          </div>
        )}
      </div>

      {/* 同步操作 */}
      {user && (
        <div className="card">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">同步操作</h2>
          <div className="flex gap-3">
            <button onClick={handleSyncUp} disabled={syncingUp || syncingDown} className="btn btn-primary">
              {syncingUp ? <><div className="spinner" /> 上传中...</> : <>↑ 上传到云端</>}
            </button>
            <button onClick={handleSyncDown} disabled={syncingUp || syncingDown} className="btn btn-ghost">
              {syncingDown ? <><div className="spinner" /> 拉取中...</> : <>↓ 从云端拉取</>}
            </button>
          </div>
          {lastSync && <p className="text-xs text-zinc-600 mt-3">上次同步: {lastSync}</p>}
        </div>
      )}

      {/* 说明 */}
      <div className="card">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">工作原理</h2>
        <div className="space-y-2 text-xs text-zinc-500">
          <div className="flex items-start gap-2"><span className="tag tag-zinc mt-0.5">1</span><span>首次同步自动创建 GitHub 私有仓库</span></div>
          <div className="flex items-start gap-2"><span className="tag tag-zinc mt-0.5">2</span><span>仅同步方案（Profile）数据；本地配置文件（permissions/hooks/MCP 等）保留不变</span></div>
          <div className="flex items-start gap-2"><span className="tag tag-zinc mt-0.5">3</span><span>拉取后需点击「应用此方案」使配置生效</span></div>
          <div className="flex items-start gap-2"><span className="tag tag-zinc mt-0.5">4</span><span>Token 存储在本地，不会上传</span></div>
        </div>
      </div>
    </div>
  );
}

/** 同步状态卡（始终显示） */
function CloudSyncStatusCard({
  loggedIn,
  cloudVersion,
  cloudNotFound,
  lastSyncedVersion,
  cloudError,
  cloudChecking,
}: {
  loggedIn: boolean;
  cloudVersion: number | null;
  cloudNotFound: boolean;
  lastSyncedVersion: number | null;
  cloudError: string | null;
  cloudChecking: boolean;
}) {
  // 计算展示状态
  let dotColor = 'bg-zinc-600';
  let borderClass = 'border-zinc-800';
  let bgClass = '';
  let title = '未启用';
  let desc = '连接 GitHub 后即可同步配置到私有仓库';
  let badge: { text: string; className: string } | null = null;
  let icon = '☁️';

  if (loggedIn) {
    if (cloudError) {
      dotColor = 'bg-red-500';
      borderClass = 'border-red-500/40';
      bgClass = 'bg-red-500/5';
      title = '检查失败';
      desc = cloudError;
      icon = '⚠️';
    } else if (cloudChecking) {
      dotColor = 'bg-zinc-500';
      title = '正在检查云端版本…';
      desc = '读取 GitHub 私有仓库的 profiles.json';
      icon = '⏳';
    } else if (cloudNotFound) {
      dotColor = 'bg-amber-500';
      borderClass = 'border-amber-500/40';
      bgClass = 'bg-amber-500/5';
      title = '云端尚无备份';
      desc = '点击下方「↑ 上传到云端」创建首次备份';
      badge = { text: '首次同步', className: 'bg-amber-500/15 text-amber-400' };
      icon = '☁️';
    } else {
      // cloudVersion 可能为 null（旧数据无 version 字段），按 0 处理
      const cv = cloudVersion ?? 0;
      if (lastSyncedVersion === null) {
        dotColor = 'bg-amber-500';
        borderClass = 'border-amber-500/40';
        bgClass = 'bg-amber-500/5';
        title = `云端有备份（v${cv}）`;
        desc = '本地从未同步过，建议先「↓ 从云端拉取」';
        badge = { text: '待同步', className: 'bg-amber-500/15 text-amber-400' };
        icon = '🔔';
      } else if (cv > lastSyncedVersion) {
        dotColor = 'bg-amber-500';
        borderClass = 'border-amber-500/40';
        bgClass = 'bg-amber-500/5';
        title = `云端有新版本（v${cv}，本地 v${lastSyncedVersion}）`;
        desc = '其他设备上传了更新，点击下方「↓ 从云端拉取」';
        badge = { text: '待同步', className: 'bg-amber-500/15 text-amber-400' };
        icon = '🔔';
      } else {
        dotColor = 'bg-emerald-500';
        title = `已同步到 v${cv}`;
        desc = `本地与云端一致（上次同步：${lastSyncedVersion}）`;
        badge = { text: '最新', className: 'bg-emerald-500/15 text-emerald-400' };
        icon = '✓';
      }
    }
  }

  return (
    <div className={`card border ${borderClass} ${bgClass}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
            <span className="text-sm text-zinc-200 font-medium">{title}</span>
            {badge && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${badge.className}`}>
                {badge.text}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">{desc}</p>
        </div>
      </div>
    </div>
  );
}
