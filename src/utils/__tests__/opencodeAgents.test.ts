import { describe, it, expect } from 'vitest';
import { buildOpenCodeAgents } from '../opencodeAgents';
import type { Provider } from '../../stores/modelStore';

const makeProviders = (caps: Record<string, { supportsImage?: boolean; supportsVideo?: boolean; context1M?: boolean }>): Provider[] =>
  Object.entries(caps).map(([id, c]) => ({
    id: `p-${id}`, name: id, apiKeys: [], selectedKeyId: null, models: [id],
    modelCapabilities: { [id]: { modelId: id, supportsImage: false, supportsVideo: false, context1M: false, ...c } },
  }));

describe('buildOpenCodeAgents', () => {
  it('returns empty for empty modelIds', () => {
    const result = buildOpenCodeAgents([], []);
    expect(result.agents).toEqual({});
    expect(result.categories).toEqual({});
  });

  it('builds primary agent for first model', () => {
    const result = buildOpenCodeAgents(['gpt-4'], makeProviders({ 'gpt-4': {} }));
    expect(result.agents).toHaveProperty('primary');
    expect((result.agents as Record<string, unknown>).primary).toHaveProperty('model', 'opencode/gpt-4');
    expect(result.categories).toHaveProperty('default');
  });

  it('uses modelId as agent name for non-primary agents', () => {
    const result = buildOpenCodeAgents(['gpt-4', 'claude-3'], makeProviders({ 'gpt-4': {}, 'claude-3': {} }));
    expect(result.agents).toHaveProperty('primary');
    expect(result.agents).toHaveProperty('agent-claude-3');
  });

  it('adds supports_image when capability is set', () => {
    const result = buildOpenCodeAgents(['gpt-4'], makeProviders({ 'gpt-4': { supportsImage: true } }));
    const agent = (result.agents as Record<string, unknown>).primary as Record<string, unknown>;
    expect(agent.supports_image).toBe(true);
  });

  it('does not add supports_image when capability is false', () => {
    const result = buildOpenCodeAgents(['gpt-4'], makeProviders({ 'gpt-4': { supportsImage: false } }));
    const agent = (result.agents as Record<string, unknown>).primary as Record<string, unknown>;
    expect(agent).not.toHaveProperty('supports_image');
  });

  it('adds supports_video and context_length when set', () => {
    const result = buildOpenCodeAgents(['gemini'], makeProviders({ 'gemini': { supportsVideo: true, context1M: true } }));
    const agent = (result.agents as Record<string, unknown>).primary as Record<string, unknown>;
    expect(agent.supports_video).toBe(true);
    expect(agent.context_length).toBe('1M');
  });

  it('builds fallback_models excluding self', () => {
    const result = buildOpenCodeAgents(['a', 'b', 'c'], makeProviders({ 'a': {}, 'b': {}, 'c': {} }));
    const agent = (result.agents as Record<string, unknown>).primary as Record<string, unknown>;
    const fallbacks = (agent.fallback_models as Array<{ model: string }>);
    expect(fallbacks.length).toBe(2);
    expect(fallbacks.map((f) => f.model)).toEqual(['opencode/b', 'opencode/c']);
  });

  it('builds default category with first model', () => {
    const result = buildOpenCodeAgents(['a', 'b', 'c'], makeProviders({ 'a': {}, 'b': {}, 'c': {} }));
    const cat = (result.categories as Record<string, unknown>).default as Record<string, unknown>;
    expect(cat.model).toBe('opencode/a');
    expect(Array.isArray(cat.fallback_models)).toBe(true);
  });
});
