export function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (seen.has(value as object)) return '"[Circular]"';
  seen.add(value as object);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v, seen)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k], seen))
      .join(',') +
    '}'
  );
}
