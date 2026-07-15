import type { Provider } from '../stores/modelStore';

export function buildOpenCodeAgents(
  modelIds: string[],
  providers: Provider[],
): { agents: Record<string, unknown>; categories: Record<string, unknown> } {
  const agents: Record<string, unknown> = {};
  const categories: Record<string, unknown> = {};

  if (modelIds.length === 0) return { agents, categories };

  modelIds.forEach((modelId, i) => {
    const agentName = i === 0 ? 'primary' : `agent-${modelId}`;
    let cap = null;
    for (const p of providers) {
      if (p.modelCapabilities[modelId]) { cap = p.modelCapabilities[modelId]; break; }
    }
    const modelStr = `opencode/${modelId}`;
    agents[agentName] = {
      model: modelStr,
      ...(cap?.supportsImage ? { supports_image: true } : {}),
      ...(cap?.supportsVideo ? { supports_video: true } : {}),
      ...(cap?.context1M ? { context_length: '1M' } : {}),
      fallback_models: modelIds
        .filter((m) => m !== modelId)
        .slice(0, 2)
        .map((m) => ({ model: `opencode/${m}` })),
    };
  });

  categories['default'] = {
    model: `opencode/${modelIds[0]}`,
    fallback_models: modelIds.slice(1, 3).map((m) => ({ model: `opencode/${m}` })),
  };

  return { agents, categories };
}
