/**
 * 稳定的 JSON 字符串化（按 key 排序），用于深度比较两个对象
 * 避免 JSON.stringify 默认按插入顺序导致的「字段重排也算不同」
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  // 普通对象：按 key 排序后递归
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}

/**
 * 从 SyncPayload 提取纯数据部分（去掉 schemaVersion / version）。
 * 这些是每次同步都会变化的元数据，不应该参与「是否有本地改动」比较。
 */
export type PayloadData = {
  providers: unknown;
  profiles: unknown;
  activeProfileId: unknown;
  claudeToggles: unknown;
  opencodeToggles: unknown;
};

export function getPayloadData(payload: {
  providers?: unknown;
  profiles?: unknown;
  activeProfileId?: unknown;
  claudeToggles?: unknown;
  opencodeToggles?: unknown;
}): PayloadData {
  return {
    providers: payload.providers ?? [],
    profiles: payload.profiles ?? [],
    activeProfileId: payload.activeProfileId ?? null,
    claudeToggles: payload.claudeToggles ?? {},
    opencodeToggles: payload.opencodeToggles ?? {},
  };
}

/** 判断两个 payload data 是否等价（深度比较） */
export function isPayloadDataEqual(a: PayloadData, b: PayloadData): boolean {
  return stableStringify(a) === stableStringify(b);
}