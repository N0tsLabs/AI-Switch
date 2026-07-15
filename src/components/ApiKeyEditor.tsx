import { useEffect, useState } from 'react';
import type { ApiKey, Provider } from '../stores/modelStore';
import { testProviderUrl, type TestResult } from '../lib/tauri';
import { useToast } from './useToast';

interface Props {
  provider: Provider;
  /** 编辑已有 key 时传入；新建时为 null */
  existing: ApiKey | null;
  /** 列表内其他 key 的 label，用于重名时自动加后缀 */
  otherLabels: string[];
  onSave: (k: Omit<ApiKey, 'createdAt'>) => void;
  onCancel: () => void;
}

/**
 * 单个 API Key 编辑 modal：
 * - label：自动生成"未命名 key #N"，支持重名检测
 * - value：明文输入框（用户偏好）
 * - 测试：调用后端 testProviderUrl 测连通性（用当前正在编辑的 key + URL）
 *   URL 从 provider 的 anthropicUrl（Anthropic key）或 openaiUrl（OpenAI key）取，根据 format 自动判断
 */
export function ApiKeyEditor({ provider, existing, otherLabels, onSave, onCancel }: Props) {
  const { toast } = useToast();
  const isNew = existing === null;
  const [label, setLabel] = useState(existing?.label ?? suggestLabel(otherLabels));
  const [value, setValue] = useState(existing?.value ?? '');

  // 测试状态：'anthropic' | 'openai' | null 表示当前测的是哪个 URL
  const [testing, setTesting] = useState<'anthropic' | 'openai' | null>(null);
  const [results, setResults] = useState<Record<'anthropic' | 'openai', TestResult | null>>({
    anthropic: null,
    openai: null,
  });

  const [error, setError] = useState('');

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleTest = async (format: 'anthropic' | 'openai') => {
    const url = format === 'anthropic' ? provider.anthropicUrl : provider.openaiUrl;
    if (!url) {
      toast(`未配置 ${format === 'anthropic' ? 'Anthropic' : 'OpenAI'} URL`, 'error');
      return;
    }
    if (!value.trim()) {
      toast('请先填写 Key 内容', 'error');
      return;
    }
    setTesting(format);
    setResults((r) => ({ ...r, [format]: null }));
    try {
      const result = await testProviderUrl(url, value.trim(), format);
      setResults((r) => ({ ...r, [format]: result }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [format]: { ok: false, status: 0, message: String(e), latencyMs: 0 },
      }));
    } finally {
      setTesting(null);
    }
  };

  const handleSubmit = () => {
    if (!label.trim()) { setError('请输入别名'); return; }
    if (!value.trim()) { setError('请输入 Key 内容'); return; }
    if (otherLabels.includes(label.trim()) && label.trim() !== existing?.label) {
      setError('别名已存在'); return;
    }
    onSave({
      id: existing?.id ?? '', // 新建时 id 留给 store 生成（空字符串触发 genId）
      label: label.trim(),
      value: value.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">
            {isNew ? '添加 API Key' : '编辑 API Key'}
            <span className="text-xs text-zinc-500 ml-2">— {provider.name}</span>
          </h3>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 别名 */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">别名（方便记忆）</label>
            <input value={label} onChange={(e) => { setLabel(e.target.value); setError(''); }}
              placeholder="如：公司卡、个人备用、测试额度"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>

          {/* Key 明文（用户偏好） */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Key 内容</label>
            <textarea value={value} onChange={(e) => { setValue(e.target.value); setError(''); }}
              placeholder="sk-ant-..."
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 resize-y" />
          </div>

          {/* 测试按钮组（按可用的 URL） */}
          <div className="space-y-2">
            {provider.anthropicUrl && (
              <TestRow
                label="Anthropic"
                url={provider.anthropicUrl}
                result={results.anthropic}
                testing={testing === 'anthropic'}
                onTest={() => handleTest('anthropic')}
              />
            )}
            {provider.openaiUrl && (
              <TestRow
                label="OpenAI"
                url={provider.openaiUrl}
                result={results.openai}
                testing={testing === 'openai'}
                onTest={() => handleTest('openai')}
              />
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
            取消
          </button>
          <button onClick={handleSubmit}
            className="px-4 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
            {isNew ? '添加' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function suggestLabel(existing: string[]): string {
  for (let i = 1; i < 999; i++) {
    const name = `未命名 key #${i}`;
    if (!existing.includes(name)) return name;
  }
  return `key-${Date.now()}`;
}

function TestRow({
  label, url, result, testing, onTest,
}: {
  label: string;
  url: string;
  result: TestResult | null;
  testing: boolean;
  onTest: () => void;
}) {
  return (
    <div className="bg-zinc-800/40 rounded-lg p-2.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-zinc-400 shrink-0">{label}</span>
        <code className="text-[10px] text-zinc-600 font-mono truncate flex-1 min-w-0" title={url}>
          {url}
        </code>
        <button onClick={onTest} disabled={testing}
          className="shrink-0 px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-[11px] rounded transition-colors">
          {testing ? '测试中…' : '测试'}
        </button>
      </div>
      {result && (
        <p className={`text-[11px] font-mono ${
          result.ok ? 'text-emerald-400' : testing ? 'text-zinc-500' : 'text-red-400'
        }`}>
          {result.ok
            ? `✓ ${result.message} · ${result.latencyMs}ms`
            : `✗ ${result.message}`}
        </p>
      )}
    </div>
  );
}
