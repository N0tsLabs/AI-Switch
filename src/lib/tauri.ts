import { invoke } from '@tauri-apps/api/core';
import type { Profile } from '../stores/profileStore';
import type { Provider } from '../stores/modelStore';

// ============ 通用 ============

export async function openUrl(url: string): Promise<void> {
  return invoke('open_url', { url });
}

// ============ Claude Code ============

export async function readClaudeSettings(): Promise<Record<string, unknown>> {
  return invoke('read_claude_settings');
}

export async function writeClaudeSettings(settings: Record<string, unknown>): Promise<void> {
  return invoke('write_claude_settings', { settings });
}

export async function readClaudeMcp(): Promise<Record<string, unknown>> {
  return invoke('read_claude_mcp');
}

export async function writeClaudeMcp(settings: Record<string, unknown>): Promise<void> {
  return invoke('write_claude_mcp', { settings });
}

// ============ OpenCode ============

export async function readOpencodeConfig(): Promise<Record<string, unknown>> {
  return invoke('read_opencode_config');
}

export async function readOpencodeAgents(): Promise<Record<string, unknown>> {
  return invoke('read_opencode_agents');
}

export async function writeOpencodeAgents(settings: Record<string, unknown>): Promise<void> {
  return invoke('write_opencode_agents', { settings });
}

// ============ 路径 ============

export interface ConfigPaths {
  home: string;
  claude_settings: string;
  claude_mcp: string;
  opencode_config: string;
  opencode_agents: string;
}

export async function getConfigPaths(): Promise<ConfigPaths> {
  return invoke('get_config_paths');
}

// ============ 通用文件 ============

export async function readFileContent(path: string): Promise<string> {
  return invoke('read_file_content', { path });
}

export async function writeFileContent(path: string, content: string): Promise<void> {
  return invoke('write_file_content', { path, content });
}

// ============ 模型 ============

export interface ModelItem {
  id: string;
  name?: string;
}

export interface FetchModelsResult {
  models: ModelItem[];
  error?: string;
}

export async function fetchOpenaiModels(url: string, apiKey: string): Promise<FetchModelsResult> {
  return invoke('fetch_openai_models', { url, apiKey });
}

// ============ 本机配置读取 ============

export interface LocalConfigs {
  claude: {
    settings: Record<string, unknown> | null;
    mcp: Record<string, unknown> | null;
  };
  opencode: {
    config: Record<string, unknown> | null;
    agents: Record<string, unknown> | null;
  };
  detected: {
    claude: boolean;
    opencode: boolean;
  };
}

export async function readLocalConfigs(): Promise<LocalConfigs> {
  return invoke('read_local_configs');
}

export async function detectApiKeys(): Promise<Record<string, string | null>> {
  return invoke('detect_api_keys');
}

// ============ GitHub Auth ============

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface GithubUser {
  login: string;
  id: number;
  avatar_url?: string;
}

export async function deviceFlowStart(): Promise<DeviceCodeResponse> {
  return invoke('device_flow_start');
}

export async function deviceFlowPoll(deviceCode: string): Promise<string> {
  return invoke('device_flow_poll', { deviceCode });
}

export async function getGithubUser(): Promise<GithubUser> {
  return invoke('get_github_user');
}

export async function githubLogout(): Promise<void> {
  return invoke('github_logout');
}

// ============ Key-level merge（仅动模型相关字段） ============

/** 读取 ~/.claude/settings.json 中的 env 字段（缺失返回 {}） */
export async function extractClaudeEnv(): Promise<Record<string, string>> {
  return invoke('extract_claude_env');
}

/** 把 env 合并进 settings.json，保留其他顶层字段。空字符串值会删除对应 key */
export async function mergeClaudeEnv(env: Record<string, string>): Promise<void> {
  return invoke('merge_claude_env', { env });
}

/** 读取 ~/.config/opencode/oh-my-openagent.json 的 agents + categories */
export async function extractOpencodeManaged(): Promise<{
  agents: Record<string, unknown> | null;
  categories: Record<string, unknown> | null;
}> {
  return invoke('extract_opencode_managed');
}

/** 把 agents + categories 合并进 oh-my-openagent.json，保留其他顶层字段 */
export async function mergeOpencodeManaged(payload: {
  agents: Record<string, unknown> | null;
  categories: Record<string, unknown> | null;
}): Promise<void> {
  return invoke('merge_opencode_managed', { payload });
}

/** 单个键操作：path 是 JSON 路径（如 ["permissions","defaultMode"]），value=null 时删除 */
export interface ExtraOp {
  path: string[];
  value: unknown;
}

/** 批量应用任意路径操作到 settings.json（其他字段全部保留） */
export async function mergeClaudeExtras(ops: ExtraOp[]): Promise<void> {
  return invoke('merge_claude_extras', { ops });
}

/** 批量应用任意路径操作到 oh-my-openagent.json（其他字段全部保留） */
export async function mergeOpencodeExtras(ops: ExtraOp[]): Promise<void> {
  return invoke('merge_opencode_extras', { ops });
}

// ============ 测试服务商 URL ============

export interface TestResult {
  ok: boolean;
  /** HTTP 状态码（连接失败时为 0） */
  status: number;
  message: string;
  latencyMs: number;
}

/**
 * 测试 provider URL 连通性
 * - Anthropic 格式：POST {url}/v1/messages
 * - OpenAI 格式：POST {url}/v1/chat/completions
 * `model` 可选，不传则用内置默认测试模型
 */
export async function testProviderUrl(
  url: string,
  apiKey: string,
  format: 'anthropic' | 'openai',
  model?: string,
): Promise<TestResult> {
  return invoke('test_provider_url', { url, apiKey, format, model });
}

// ============ 云同步 ============

/** 云同步载荷：仅同步服务商配置 + Profile 方案，不同步各工具的 toggle 设置 */
export interface SyncPayload {
  schemaVersion: 4;
  version: number;
  providers: Provider[];
  profiles: Profile[];
  activeProfileId: string | null;
}

/** 云端版本探测结果（轻量级，不下载完整 payload） */
export interface CloudVersionInfo {
  version: number | null;
  /** profiles.json 不存在时为 true */
  notFound: boolean;
  /** 探测错误信息（token 失效 / 网络超时 / 解析失败等）。有值时其他字段无意义 */
  error?: string;
}

/** 上传 Profile 数据到云端（profiles.json） */
export async function syncUpload(payload: SyncPayload): Promise<string> {
  return invoke('sync_upload', { payload });
}

/** 从云端下载 Profile 数据 */
export async function syncDownload(): Promise<SyncPayload> {
  return invoke('sync_download');
}

/** 轻量级：仅查询云端 version（不下载 payload），用于启动/定时检查 */
export async function syncCheckVersion(): Promise<CloudVersionInfo> {
  return invoke('sync_check_version');
}

// ============ 版本更新 ============

export interface UpdateInfo {
  has_update: boolean;
  current_version: string;
  remote_version: string;
  download_url: string;
}

export async function checkUpdate(): Promise<UpdateInfo> {
  return invoke('check_update');
}
