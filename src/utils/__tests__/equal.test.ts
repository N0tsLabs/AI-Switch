import { describe, it, expect } from 'vitest';
import { stableStringify } from '../equal';

describe('stableStringify', () => {
  it('handles primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hello')).toBe('"hello"');
  });

  it('sorts keys for stable output', () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('handles nested objects', () => {
    const obj = { a: { b: 1, c: 2 }, d: [3, 4] };
    expect(stableStringify(obj)).toBe('{"a":{"b":1,"c":2},"d":[3,4]}');
  });

  it('detects circular references and does not overflow', () => {
    const obj: Record<string, unknown> = { name: 'root' };
    obj.child = obj;
    const result = stableStringify(obj);
    expect(result).toContain('"[Circular]"');
  });

  it('handles arrays with circular refs', () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);
    const result = stableStringify(arr);
    expect(result).toContain('"[Circular]"');
  });

  it('handles cross-references', () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { a };
    a.b = b;
    const result = stableStringify(a);
    expect(result).toContain('"[Circular]"');
  });
});
