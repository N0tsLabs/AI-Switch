import { useState } from 'react';
import ClaudeCode from './ClaudeCode';
import OpenCodeConfig from './OpenCodeConfig';

const tabs = [
  { id: 'claude', label: 'Claude Code', color: 'text-purple-400' },
  { id: 'opencode', label: 'OpenCode', color: 'text-emerald-400' },
];

export default function AgentTools() {
  const [active, setActive] = useState('claude');

  return (
    <div className="max-w-4xl">
      {/* 选项卡 */}
      <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800 mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              active === tab.id
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className={tab.color}>●</span> {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="relative">
        {active === 'claude' && <ClaudeCode />}
        {active === 'opencode' && <OpenCodeConfig />}
      </div>
    </div>
  );
}
