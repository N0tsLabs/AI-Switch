# AI-Switch — 计划文档

> AI 配置管理 & 云同步桌面工具  
> 技术栈：Tauri 2 (Rust + React/TypeScript)  
> 平台：Windows / macOS / Linux

---

## 一、项目概述

AI-Switch 是一款桌面应用，用于：

1. **统一管理** 各 AI 编程助手的配置文件（Claude Code、OpenCode、Cursor 等）
2. **一键切换** 不同的模型配置方案（profile）
3. **云同步** 配置到 GitHub 私有仓库，跨设备共享

---

## 二、支持的 AI 工具 & 配置文件

| 工具 | 配置路径 | 格式 | 可同步内容 |
|------|----------|------|-----------|
| **Claude Code** | `~/.claude/settings.json` | JSON | env（模型/API地址）、permissions、hooks、statusLine |
| **Claude Code** | `~/.claude/CLAUDE.md` | Markdown | 全局指令 |
| **Claude Code** | `~/.claude/.mcp.json` | JSON | MCP 服务器配置 |
| **OpenCode** | `~/.config/opencode/opencode.json` | JSON | 插件列表 |
| **OpenCode** | `~/.config/opencode/oh-my-openagent.json` | JSON | agents 模型分配、categories、fallback 链 |
| **Cursor** | `%APPDATA%/Cursor/settings.json` | JSON | 编辑器 + AI 设置 |
| **Aider** | `~/.aider/settings.json` | JSON | 全局偏好 |
| **Continue** | `~/.continue/config.json` | JSON | 模型列表、自动补全 |

---

## 三、核心概念

### 3.1 Profile（配置方案）

一个 Profile = 一组命名的配置快照，包含各工具的配置文件内容。

```
Profile: "日常开发"
├── Claude Code
│   ├── settings.json  (env: opus model, permissions: bypassPermissions)
│   └── CLAUDE.md      (通用指令)
├── OpenCode
│   └── oh-my-openagent.json  (agents: opus + sonnet 组合)
└── Cursor
    └── settings.json

Profile: "省钱模式"
├── Claude Code
│   └── settings.json  (env: haiku model)
└── OpenCode
    └── oh-my-openagent.json  (agents: 全部用 haiku/flash)
```

### 3.2 云端存储结构

GitHub 私有仓库 `ai-switch-configs`：

```
ai-switch-configs/
├── .ai-switch/
│   ├── meta.json              # 账号信息、profile 列表、设备 ID
│   └── profiles/
│       ├── 日常开发/
│       │   ├── claude-code/
│       │   │   ├── settings.json
│       │   │   └── CLAUDE.md
│       │   ├── opencode/
│       │   │   └── oh-my-openagent.json
│       │   └── cursor/
│       │       └── settings.json
│       └── 省钱模式/
│           ├── claude-code/
│           │   └── settings.json
│           └── opencode/
│               └── oh-my-openagent.json
└── README.md
```

---

## 四、GitHub 登录方案

### 推荐：Device Flow（RFC 8628）

桌面应用最佳选择，无需配置回调 URL，无需暴露 client_secret。

```
┌─────────────────────────────────────────────────────┐
│                   登录流程                            │
│                                                     │
│  ① 用户点击 "GitHub 登录"                             │
│       │                                             │
│  ② App 请求 device code                              │
│       │  POST github.com/login/device/code           │
│       │  { client_id, scope: "repo" }                │
│       │                                             │
│  ③ App 显示验证码                                     │
│  ┌──────────────────────────────┐                   │
│  │  请访问: github.com/login/device                 │
│  │  输入验证码: WDJB-MJHT        │                   │
│  │                              │                   │
│  │  [打开浏览器]  [复制链接]      │                   │
│  └──────────────────────────────┘                   │
│       │                                             │
│  ④ 用户在浏览器输入验证码，授权                         │
│       │                                             │
│  ⑤ App 轮询获取 access_token                         │
│       │  POST github.com/login/oauth/access_token    │
│       │                                             │
│  ⑥ 登录成功，存储 token 到系统钥匙串                    │
└─────────────────────────────────────────────────────┘
```

### 为什么选 Device Flow

| 对比项 | Device Flow | Redirect Flow (PKCE) |
|--------|-------------|---------------------|
| 回调 URL 配置 | 不需要 | 需要设置 `http://127.0.0.1:port` |
| client_secret | 不需要 | 不需要（用 PKCE） |
| 实现复杂度 | 低（纯 HTTP 轮询） | 中（本地 HTTP 服务器 + PKCE） |
| UX | 需手动输入验证码 | 自动跳转，体验更好 |
| 安全性 | 高 | 高 |

**结论**：先用 Device Flow 快速实现，后续可升级为 Redirect Flow 提升体验。

### Token 存储

- **Windows**：系统钥匙串（通过 `keyring` crate）
- **macOS**：Keychain
- **Linux**：Secret Service (libsecret)
- **绝不**以明文存储 token

---

## 五、界面设计

### 5.1 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 AI-Switch                          [设置] [GitHub头像]   │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  左侧导航     │              主内容区                         │
│              │                                              │
│  📋 概览      │   (根据选中项显示对应内容)                     │
│  🔧 配置管理   │                                              │
│  ☁️ 云同步    │                                              │
│  🔄 切换方案   │                                              │
│  ⚙️ 设置     │                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│  状态栏: 本地配置 ✓ | 云端同步 ✓ | 上次同步: 2分钟前            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 概览页

```
┌─────────────────────────────────────────────────────────────┐
│  概览                                                       │
│                                                             │
│  当前 Profile: [日常开发 ▼]                    [切换方案]      │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Claude Code      │  │ OpenCode         │                  │
│  │ ✅ 已检测        │  │ ✅ 已检测         │                  │
│  │ 模型: mimo-v2.5  │  │ 主模型: opus-4-6  │                 │
│  │ API: 自定义       │  │ 插件: omo         │                 │
│  │ [编辑配置]       │  │ [编辑配置]        │                  │
│  └─────────────────┘  └─────────────────┘                   │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Cursor           │  │ Aider            │                  │
│  │ ⚪ 未安装        │  │ ⚪ 未安装         │                  │
│  └─────────────────┘  └─────────────────┘                   │
│                                                             │
│  快速操作:                                                   │
│  [📤 上传到云端]  [📥 从云端拉取]  [➕ 新建方案]               │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 配置管理页 — Claude Code

```
┌─────────────────────────────────────────────────────────────┐
│  配置管理 > Claude Code                                      │
│                                                             │
│  ┌─ 模型设置 ──────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │  API Base URL:  [https://token-plan-cn.xiaomimimo.com/  │ │
│  │                  anthropic                     ]       │ │
│  │                                                         │ │
│  │  Auth Token:    [••••••••••••••••••••••••••••••] [👁]    │ │
│  │                                                         │ │
│  │  默认模型:      [mimo-v2.5[1M] ▼]                       │ │
│  │                                                         │ │
│  │  Sonnet 模型:   [mimo-v2.5[1M] ▼]                       │ │
│  │  Opus 模型:     [mimo-v2.5[1M] ▼]                       │ │
│  │  Haiku 模型:    [mimo-v2.5[1M] ▼]                       │ │
│  │                                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 权限设置 ──────────────────────────────────────────────┐ │
│  │  默认模式:  (●) bypassPermissions  ( ) default         │ │
│  │  跳过危险模式确认:  ☑                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 环境变量 ──────────────────────────────────────────────┐ │
│  │  KEY                │ VALUE                             │ │
│  │  CLAUDE_CODE_...    │ 1                                 │ │
│  │  [➕ 添加环境变量]                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 高级编辑 ──────────────────────────────────────────────┐ │
│  │  [打开 JSON 编辑器]  [重置为默认]                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  [💾 保存]  [↩️ 撤销更改]                                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 配置管理页 — OpenCode

```
┌─────────────────────────────────────────────────────────────┐
│  配置管理 > OpenCode                                         │
│                                                             │
│  ┌─ 插件 ─────────────────────────────────────────────────┐  │
│  │  已启用插件:                                            │  │
│  │  ☑ oh-my-openagent                                     │  │
│  │  [+ 添加插件]                                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Agents 模型分配 ──────────────────────────────────────┐  │
│  │  Agent 名称      │ 主模型              │ Fallback       │  │
│  │  ─────────────── │ ─────────────────── │ ────────────   │  │
│  │  sisyphus        │ [opus-4-6 ▼] [max▼] │ [+3 more]     │  │
│  │  hephaestus      │ [gpt-5.4 ▼]  [med▼] │ [+1 more]     │  │
│  │  oracle          │ [gpt-5.4 ▼]  [high▼]│ [+2 more]     │  │
│  │  explore         │ [haiku-4-5 ▼]       │ [+2 more]     │  │
│  │  ...                                                   │  │
│  │  [➕ 添加 Agent]                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Categories ──────────────────────────────────────────┐   │
│  │  类别            │ 主模型              │ Fallback       │   │
│  │  ─────────────── │ ─────────────────── │ ────────────   │   │
│  │  quick           │ [gpt-5.4-mini ▼]   │ [+3 more]     │   │
│  │  deep            │ [gpt-5.4 ▼]  [med▼]│ [+2 more]     │   │
│  │  writing         │ [gemini-3-flash ▼]  │ [+1 more]     │   │
│  │  ...                                                   │   │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  [💾 保存]  [↩️ 撤销更改]                                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 云同步页

```
┌─────────────────────────────────────────────────────────────┐
│  云同步                                                     │
│                                                             │
│  ┌─ 账号信息 ──────────────────────────────────────────────┐ │
│  │  [GitHub 头像]  WKEA                                    │ │
│  │  已连接 | 仓库: ai-switch-configs (私有)                 │ │
│  │  [退出登录]                                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 云端 Profile 列表 ────────────────────────────────────┐  │
│  │  ☁️ 日常开发              最后同步: 2分钟前    [📥 拉取] │  │
│  │  ☁️ 省钱模式              最后同步: 1小时前    [📥 拉取] │  │
│  │  ☁️ 团队共享              最后同步: 3天前      [📥 拉取] │  │
│  │  [➕ 新建云端方案]                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ 同步操作 ──────────────────────────────────────────────┐ │
│  │  [📤 上传当前方案到云端]                                  │ │
│  │  [📥 从云端拉取所有方案]                                  │ │
│  │  [🔄 合并冲突解决]                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 同步设置 ──────────────────────────────────────────────┐ │
│  │  自动同步:  ☑ 启用                                       │ │
│  │  同步频率:  [每次切换 ▼]                                  │ │
│  │  冲突策略:  [云端优先 ▼]                                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.6 切换方案页

```
┌─────────────────────────────────────────────────────────────┐
│  切换方案                                                   │
│                                                             │
│  选择要切换的 Profile:                                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  📋 日常开发 (当前)                                     │  │
│  │  Claude Code: opus-4-6 | OpenCode: opus + gpt-5.4     │  │
│  │  [应用此方案]                                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  💰 省钱模式                                           │  │
│  │  Claude Code: haiku-4-5 | OpenCode: 全部 haiku         │  │
│  │  [应用此方案]  [编辑]  [删除]                           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🏢 团队共享                                           │  │
│  │  Claude Code: sonnet-4-6 | OpenCode: sonnet + gpt-5.3 │  │
│  │  [应用此方案]  [编辑]  [删除]                           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ➕ 创建新方案                                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ⚠️ 切换方案会覆盖当前各工具的配置文件，是否继续？             │
│  [确认切换]  [取消]                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、操作逻辑

### 6.1 首次使用流程

```
用户启动 AI-Switch
       │
       ▼
  检测已安装的 AI 工具
       │
       ├─ 找到 Claude Code → 读取 settings.json
       ├─ 找到 OpenCode → 读取 opencode.json + oh-my-openagent.json
       ├─ 未找到 Cursor → 标记为未安装
       └─ ...
       │
       ▼
  引导用户登录 GitHub (Device Flow)
       │
       ▼
  检查云端是否有 ai-switch-configs 仓库
       │
       ├─ 无 → 自动创建私有仓库
       └─ 有 → 下载云端 profiles
       │
       ▼
  将当前本地配置保存为 "默认方案"
       │
       ▼
  进入主界面
```

### 6.2 切换 Profile 流程

```
用户选择目标 Profile
       │
       ▼
  显示变更预览 (diff)
  ┌─────────────────────────────────────────┐
  │  Claude Code settings.json 变更:        │
  │  - ANTHROPIC_MODEL: "opus-4-6"         │
  │  + ANTHROPIC_MODEL: "haiku-4-5"         │
  │                                         │
  │  OpenCode oh-my-openagent.json 变更:    │
  │  - sisyphus.model: "opus-4-6"          │
  │  + sisyphus.model: "haiku-4-5"          │
  └─────────────────────────────────────────┘
       │
       ▼
  用户确认
       │
       ▼
  备份当前配置 (保存到 profiles/当前方案/)
       │
       ▼
  写入目标 Profile 的配置到各工具目录
       │
       ▼
  完成 ✅
```

### 6.3 云同步流程

```
用户点击 "上传到云端"
       │
       ▼
  读取当前 Profile 的所有配置文件
       │
       ▼
  序列化为 JSON/文件内容
       │
       ▼
  逐文件上传到 GitHub (Contents API)
  PUT /repos/{owner}/ai-switch-configs/contents/.ai-switch/profiles/{name}/...
       │
       ▼
  更新 meta.json (最后同步时间、设备信息)
       │
       ▼
  同步完成 ✅
```

---

## 七、功能清单

### P0 — 核心功能（MVP）

| 功能 | 描述 |
|------|------|
| GitHub Device Flow 登录 | 一键登录，token 存系统钥匙串 |
| 自动检测已安装工具 | 扫描各工具配置路径，识别版本 |
| 读取 & 展示配置 | 解析 JSON/Markdown 配置并可视化 |
| Profile 创建 & 切换 | 创建方案、一键切换、覆盖写入 |
| 本地 Profile 管理 | 新建、编辑、删除、重命名 |
| 云端上传 & 拉取 | 通过 GitHub Contents API 同步 |
| 自动创建私有仓库 | 首次同步时自动创建 `ai-switch-configs` |

### P1 — 增强功能

| 功能 | 描述 |
|------|------|
| JSON 可视化编辑器 | 表单式编辑 + 原始 JSON 编辑器双模式 |
| 配置 Diff 对比 | 切换前显示变更预览 |
| 冲突检测 & 合并 | 多设备同步时处理冲突 |
| 自动同步 | 启动时/切换时自动同步 |
| 导入/导出 Profile | 本地文件导入导出（.zip） |

### P2 — 未来功能

| 功能 | 描述 |
|------|------|
| 多设备管理 | 查看/管理已连接设备 |
| Profile 模板 | 预设常用配置模板 |
| API Key 安全管理 | 加密存储 API Key，不上传到云端 |
| 命令行工具 | `ai-switch sync` / `ai-switch switch <profile>` |
| 插件系统 | 支持更多 AI 工具的配置适配 |

---

## 八、技术架构

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ Pages   │  │ Components│  │ State (Zustand)   │   │
│  │ - 概览   │  │ - 表单    │  │ - profileStore    │   │
│  │ - 配置   │  │ - 编辑器  │  │ - authStore       │   │
│  │ - 同步   │  │ - diff    │  │ - syncStore       │   │
│  │ - 切换   │  │ - 导航    │  │                   │   │
│  └─────────┘  └──────────┘  └───────────────────┘   │
└──────────────────────┬──────────────────────────────┘
                       │ Tauri IPC (invoke)
┌──────────────────────┴──────────────────────────────┐
│                  Backend (Rust)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ config_mgr  │  │ github_auth  │  │ sync_engine│  │
│  │ - 读取配置   │  │ - Device Flow│  │ - 上传/下载 │  │
│  │ - 写入配置   │  │ - Token 管理 │  │ - 冲突解决  │  │
│  │ - 备份恢复   │  │ - API 调用   │  │ - 版本追踪  │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│  ┌─────────────┐  ┌──────────────┐                  │
│  │ profile_mgr │  │ keyring      │                  │
│  │ - CRUD      │  │ - Token 存储 │                  │
│  │ - 应用切换   │  │ - 安全访问   │                  │
│  └─────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────┘
```

### 关键依赖

```toml
# Rust (Cargo.toml)
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
octocrab = "0.44"          # GitHub API 客户端
reqwest = { version = "0.12", features = ["json"] }
keyring = "3"              # 系统钥匙串
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
dirs = "5"                 # 跨平台目录路径
```

```json
// 前端 (package.json)
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^19",
    "zustand": "^5",
    "react-router-dom": "^7",
    "diff": "^7"            // 配置 diff 对比
  }
}
```

---

## 九、安全考量

| 项目 | 方案 |
|------|------|
| GitHub Token | 存储在系统钥匙串，不写入文件 |
| API Key（Anthropic 等） | 本地加密存储，**不同步到云端** |
| 云端仓库 | 必须是私有仓库 |
| Token 权限 | 仅申请 `repo` scope（最小权限） |
| 敏感字段标记 | 配置中识别 `*key*`、`*token*`、`*secret*` 字段，同步时脱敏或跳过 |

---

## 十、项目结构

```
ai-switch/
├── docs/
│   └── PLAN.md              # 本文档
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── commands/         # Tauri IPC 命令
│       │   ├── mod.rs
│       │   ├── auth.rs       # GitHub 登录
│       │   ├── config.rs     # 配置读写
│       │   ├── profile.rs    # Profile 管理
│       │   └── sync.rs       # 云同步
│       ├── github/           # GitHub API 封装
│       │   ├── mod.rs
│       │   ├── device_flow.rs
│       │   └── contents.rs
│       ├── config_readers/   # 各工具配置解析器
│       │   ├── mod.rs
│       │   ├── claude_code.rs
│       │   ├── opencode.rs
│       │   └── cursor.rs
│       └── models/           # 数据模型
│           ├── mod.rs
│           ├── profile.rs
│           └── settings.rs
├── src/                      # React 前端
│   ├── App.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx     # 概览
│   │   ├── ConfigEditor.tsx  # 配置编辑
│   │   ├── CloudSync.tsx     # 云同步
│   │   ├── ProfileSwitch.tsx # 切换方案
│   │   └── Settings.tsx      # 设置
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── JsonEditor.tsx
│   │   ├── DiffViewer.tsx
│   │   └── ModelSelector.tsx
│   └── stores/
│       ├── authStore.ts
│       ├── profileStore.ts
│       └── syncStore.ts
├── package.json
└── README.md
```

---

## 十一、开发计划

| 阶段 | 内容 | 预估时间 |
|------|------|---------|
| **Phase 1** | 项目脚手架 + 基础 UI | 1-2 天 |
| **Phase 2** | 配置文件读写 + Claude Code/OpenCode 解析器 | 2-3 天 |
| **Phase 3** | Profile CRUD + 切换逻辑 | 2 天 |
| **Phase 4** | GitHub Device Flow 登录 + Token 管理 | 1-2 天 |
| **Phase 5** | 云端同步（上传/拉取/创建仓库） | 2-3 天 |
| **Phase 6** | Diff 对比 + 冲突处理 | 1-2 天 |
| **Phase 7** | 测试 + 打磨 + 打包 | 2-3 天 |

**总计约 11-17 天**（单人开发）

---

## 十二、关于 GitHub 登录的详细说明

### 步骤 1：创建 GitHub OAuth App

1. 访问 https://github.com/settings/developers
2. 点击 "New OAuth App"
3. 填写信息：
   - **Application name**: `AI-Switch`
   - **Homepage URL**: `https://github.com/你的用户名/ai-switch`
   - **Authorization callback URL**: 留空（Device Flow 不需要）
4. 创建后进入 App 设置页
5. 勾选 **"Enable Device Flow"**
6. 记录 **Client ID**（不需要 Client Secret）

### 步骤 2：在 App 中硬编码 Client ID

```rust
const GITHUB_CLIENT_ID: &str = "你的Client_ID";
```

> Client ID 不是密钥，可以安全地包含在桌面应用中。GitHub 官方 CLI (`gh`) 也是这样做的。

### 步骤 3：实现 Device Flow

```
App → GitHub: POST /login/device/code { client_id, scope: "repo" }
GitHub → App: { user_code: "WDJB-MJHT", device_code: "...", interval: 5 }

App 显示: "请访问 github.com/login/device 输入 WDJB-MJHT"

App → GitHub: POST /login/oauth/access_token (每 5 秒轮询)
GitHub → App: { access_token: "ghp_xxx" }

App → 系统钥匙串: 存储 token
```

### 步骤 4：使用 Token 操作仓库

```rust
let octo = Octocrab::builder()
    .user_access_token(token)
    .build()?;

// 首次同步：创建私有仓库
octo.repos("me")
    .create("ai-switch-configs")
    .private(true)
    .auto_init(true)
    .send()
    .await?;

// 上传配置文件
octo.repos("me/ai-switch-configs")
    .contents(".ai-switch/profiles/日常开发/claude-code/settings.json")
    .create("Sync profile")
    .content(base64_config)
    .send()
    .await?;
```

---

## 十三、待确认事项

1. **是否支持 Cursor？** — 你提到主要是 Claude Code 和 OpenCode，Cursor 是否也需要？
2. **API Key 同步策略** — 云端是否存储 API Key？还是每台设备独立配置？
3. **Profile 命名** — 是否支持中文命名？（建议支持）
4. **多设备冲突** — 同一 Profile 在多台设备修改后如何合并？（简单策略：时间戳 + 手动选择）
5. **是否需要 CLI 版本** — 除了桌面 App，是否需要命令行工具？
