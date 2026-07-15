import { useState, useEffect, useRef } from 'react';
import { syncCheckVersion, type CloudVersionInfo } from '../lib/tauri';

export function useCloudVersion(
  enabled: boolean,
  pollIntervalMs: number | null,
): {
  cloudVersion: number | null;
  cloudNotFound: boolean;
  cloudError: string | null;
  cloudChecking: boolean;
} {
  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  const [cloudNotFound, setCloudNotFound] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudChecking, setCloudChecking] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;

    const tick = async () => {
      setCloudChecking(true);
      try {
        const info: CloudVersionInfo = await syncCheckVersion();
        if (cancelledRef.current) return;
        setCloudError(info.error ?? null);
        setCloudNotFound(info.notFound ?? false);
        setCloudVersion(info.version ?? null);
      } catch {
        if (!cancelledRef.current) setCloudError('探测失败');
      } finally {
        if (!cancelledRef.current) setCloudChecking(false);
      }
    };

    const timer = setTimeout(tick, 500);
    let interval: ReturnType<typeof setInterval> | null = null;
    if (pollIntervalMs) {
      interval = setInterval(tick, pollIntervalMs);
    }

    return () => {
      cancelledRef.current = true;
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [enabled, pollIntervalMs]);

  return { cloudVersion, cloudNotFound, cloudError, cloudChecking };
}
