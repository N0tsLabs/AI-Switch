import { describe, it, expect } from 'vitest';
import { migrateProvider, getActiveKeyValue, type Provider } from '../modelStore';

describe('migrateProvider', () => {
  it('returns a new object with defaults', () => {
    const result = migrateProvider({ id: 'p1', name: 'Test', apiKeys: [], selectedKeyId: null, models: [], modelCapabilities: {} } as Provider);
    expect(result.id).toBe('p1');
    expect(result.models).toEqual([]);
    expect(result.modelCapabilities).toEqual({});
    expect(result.apiKeys).toEqual([]);
  });

  it('fills defaults for undefined models/modelCapabilities', () => {
    const result = migrateProvider({ id: 'x', name: 'X', apiKeys: [], selectedKeyId: null, models: undefined as unknown as string[], modelCapabilities: undefined as unknown as Record<string, never> } as Provider);
    expect(result.models).toEqual([]);
    expect(result.modelCapabilities).toEqual({});
  });

  it('migrates old single apiKey into apiKeys array', () => {
    const old = {
      id: 'p1',
      name: 'Old',
      apiKey: 'sk-test',
      apiKeys: [],
      selectedKeyId: null,
      models: [],
      modelCapabilities: {},
    } as unknown as Provider;
    const result = migrateProvider(old);
    expect(result.apiKeys.length).toBe(1);
    expect(result.apiKeys[0].value).toBe('sk-test');
    expect(result.apiKeys[0].label).toBe('默认');
    expect(result.selectedKeyId).toBe(result.apiKeys[0].id);
  });

  it('does not duplicate apiKey when apiKeys already exists', () => {
    const k = { id: 'existing', label: 'My Key', value: 'sk-my', createdAt: 1 };
    const old = {
      id: 'p1', name: 'Old',
      apiKey: 'sk-old', apiKeys: [k], selectedKeyId: 'existing',
      models: [], modelCapabilities: {},
    } as unknown as Provider;
    const result = migrateProvider(old);
    expect(result.apiKeys.length).toBe(1);
    expect(result.apiKeys[0].value).toBe('sk-my');
  });

  it('migrates old url to anthropicUrl when apiFormat is anthropic', () => {
    const old = {
      id: 'p1', name: 'Old', url: 'https://api.anthropic.com',
      apiFormat: 'anthropic' as const,
      apiKeys: [], selectedKeyId: null, models: [], modelCapabilities: {},
    } as unknown as Provider;
    const result = migrateProvider(old);
    expect(result.anthropicUrl).toBe('https://api.anthropic.com');
    expect(result.openaiUrl).toBeUndefined();
  });

  it('migrates old url to openaiUrl when apiFormat is openai', () => {
    const old = {
      id: 'p1', name: 'Old', url: 'https://api.openai.com',
      apiFormat: 'openai' as const,
      apiKeys: [], selectedKeyId: null, models: [], modelCapabilities: {},
    } as unknown as Provider;
    const result = migrateProvider(old);
    expect(result.openaiUrl).toBe('https://api.openai.com');
    expect(result.anthropicUrl).toBeUndefined();
  });

  it('new anthropicUrl/openaiUrl take precedence over old url migration', () => {
    const old = {
      id: 'p1', name: 'Old', url: 'https://old.example.com',
      apiFormat: 'openai' as const,
      anthropicUrl: 'https://new-anthropic.example.com',
      openaiUrl: 'https://new-openai.example.com',
      apiKeys: [], selectedKeyId: null, models: [], modelCapabilities: {},
    } as unknown as Provider;
    const result = migrateProvider(old);
    expect(result.anthropicUrl).toBe('https://new-anthropic.example.com');
    expect(result.openaiUrl).toBe('https://new-openai.example.com');
  });

  it('fixes selectedKeyId when pointing to non-existent key', () => {
    const k = { id: 'real', label: 'K', value: 'v', createdAt: 1 };
    const old = {
      id: 'p1', name: 'Test', apiKeys: [k], selectedKeyId: 'ghost',
      models: [], modelCapabilities: {},
    } as Provider;
    const result = migrateProvider(old);
    expect(result.selectedKeyId).toBe('real');
  });

  it('sets selectedKeyId to first key if invalid', () => {
    const k1 = { id: 'a', label: 'A', value: 'va', createdAt: 1 };
    const k2 = { id: 'b', label: 'B', value: 'vb', createdAt: 2 };
    const old = {
      id: 'p1', name: 'Test', apiKeys: [k1, k2], selectedKeyId: 'ghost',
      models: [], modelCapabilities: {},
    } as Provider;
    const result = migrateProvider(old);
    expect(result.selectedKeyId).toBe('a');
  });

  it('selectedKeyId is null when no keys exist', () => {
    const old = { id: 'p1', name: 'X', apiKeys: [], selectedKeyId: 'ghost', models: [], modelCapabilities: {} } as Provider;
    const result = migrateProvider(old);
    expect(result.selectedKeyId).toBeNull();
  });

  it('is idempotent', () => {
    const old = {
      id: 'p1', name: 'Old', apiKey: 'sk-old', url: 'https://api.test', apiFormat: 'openai' as const,
      apiKeys: [], selectedKeyId: null, models: [], modelCapabilities: {},
    } as unknown as Provider;
    const r1 = migrateProvider(old);
    const r2 = migrateProvider(r1 as unknown as Provider);
    expect(r1.anthropicUrl).toBe(r2.anthropicUrl);
    expect(r1.openaiUrl).toBe(r2.openaiUrl);
    expect(r1.apiKeys.length).toBe(r2.apiKeys.length);
    expect(r1.models).toEqual(r2.models);
  });

  it('strips deprecated fields', () => {
    const old = {
      id: 'p1', name: 'Test', apiKey: 'sk-old', url: 'https://x', apiFormat: 'openai' as const,
      apiKeys: [], selectedKeyId: null, models: [], modelCapabilities: {},
    } as unknown as Provider;
    const result = migrateProvider(old) as unknown as Record<string, unknown>;
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('apiFormat');
  });
});

describe('getActiveKeyValue', () => {
  it('returns active key value', () => {
    const k = { id: 'k1', label: 'K', value: 'sk-123', createdAt: 1 };
    const p: Provider = { id: 'p', name: 'P', apiKeys: [k], selectedKeyId: 'k1', models: [], modelCapabilities: {} };
    expect(getActiveKeyValue(p)).toBe('sk-123');
  });

  it('returns empty string when no active key', () => {
    const p: Provider = { id: 'p', name: 'P', apiKeys: [], selectedKeyId: null, models: [], modelCapabilities: {} };
    expect(getActiveKeyValue(p)).toBe('');
  });
});
