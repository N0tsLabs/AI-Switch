import type { ModelCapability } from '../stores/modelStore';

/** 能力标签颜色映射 */
const TAG_STYLES: Record<string, string> = {
  image: 'bg-blue-500/10 text-blue-400',
  video: 'bg-purple-500/10 text-purple-400',
  context1M: 'bg-amber-500/10 text-amber-400',
};

const TAG_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频',
  context1M: '1M',
};

/** 模型能力标签 */
export function CapabilityTag({ type }: { type: 'image' | 'video' | 'context1M' }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${TAG_STYLES[type]}`}>
      {TAG_LABELS[type]}
    </span>
  );
}

/** 根据 ModelCapability 渲染所有已启用的能力标签 */
export function CapabilityTags({ cap }: { cap: ModelCapability | null | undefined }) {
  if (!cap) return null;
  return (
    <div className="flex items-center gap-1.5">
      {cap.supportsImage && <CapabilityTag type="image" />}
      {cap.supportsVideo && <CapabilityTag type="video" />}
      {cap.context1M && <CapabilityTag type="context1M" />}
    </div>
  );
}
