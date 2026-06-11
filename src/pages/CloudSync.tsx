import { useState, useEffect, useRef } from 'react';
import { deviceFlowStart, deviceFlowPoll, githubLogout, syncUpload, syncDownload } from '../lib/tauri';
import { useToast } from '../components/Toast';
import { useAuthStore } from '../stores/authStore';

type LoginStep = 'idle' | 'requesting' | 'waiting' | 'polling' | 'success' | 'error';

export default function CloudSync() {
  const { toast } = useToast();
  const { user, loadUser, clearUser } = useAuthStore();
  const [step, setStep] = useState<LoginStep>('idle');
  const [userCode, setUserCode] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [syncingUp, setSyncingUp] = useState(false);
  const [syncingDown, setSyncingDown] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const stoppedRef = useRef(false);

  // 如果已登录，直接设为 success
  useEffect(() => {
    if (user && step === 'idle') setStep('success');
  }, [user]);

  const startLogin = async () => {
    setStep('requesting');
    setErrorMsg('');
    try {
      const resp = await deviceFlowStart();
      setUserCode(resp.user_code);
      setVerifyUrl(resp.verification_uri);
      setStep('waiting');
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
        setStep('success');
        loadUser();
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
    try {
      const msg = await syncUpload();
      toast(msg, 'success');
      setLastSync(new Date().toLocaleString());
    } catch (e) {
      toast('上传失败: ' + String(e), 'error');
    } finally {
      setSyncingUp(false);
    }
  };

  const handleSyncDown = async () => {
    setSyncingDown(true);
    try {
      const msg = await syncDownload();
      toast(msg, 'success');
      setLastSync(new Date().toLocaleString());
    } catch (e) {
      toast('拉取失败: ' + String(e), 'error');
    } finally {
      setSyncingDown(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">云同步</h1>
        <p className="text-sm text-zinc-500 mt-1">通过 GitHub 私有仓库同步配置</p>
      </div>

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
          <div className="flex items-start gap-2"><span className="tag tag-zinc mt-0.5">2</span><span>完整配置保存（含 API Key），你自己的私有仓库</span></div>
          <div className="flex items-start gap-2"><span className="tag tag-zinc mt-0.5">3</span><span>Token 存储在本地，不会上传</span></div>
        </div>
      </div>
    </div>
  );
}
