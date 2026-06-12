import { invoke } from '@tauri-apps/api/core';

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

// ============ 云同步 ============

export async function syncUpload(): Promise<string> {
  return invoke('sync_upload');
}

export async function syncDownload(): Promise<string> {
  return invoke('sync_download');
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
