# AI-Switch

AI 编程工具配置管理 & 云同步桌面应用。

## 功能

- **模型设置** — 统一配置 AI 服务商（OpenAI / Anthropic 格式），自动读取模型列表
- **Agent 工具** — 分别管理 Claude Code 和 OpenCode 的模型配置
- **Profile 方案** — 一键切换不同配置方案（工作模式 / 省钱模式等）
- **云同步** — 通过 GitHub 私有仓库同步配置，跨设备共享
- **本机导入** — 读取已安装的 AI 工具配置，一键导入

## 支持的工具

| 工具 | 配置文件 | 支持操作 |
|------|----------|---------|
| Claude Code | `~/.claude/settings.json` | 模型切换、API 配置、权限设置 |
| OpenCode | `~/.config/opencode/oh-my-openagent.json` | 模型添加/移除、图片/视频支持 |

## 技术栈

- **前端**: React 19 + TypeScript + Tailwind CSS
- **后端**: Rust (Tauri 2)
- **状态管理**: Zustand
- **GitHub API**: reqwest (Rust)

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建安装包
npm run tauri build
```

## 云同步

1. 在设置中点击「GitHub 登录」
2. 在浏览器中输入验证码完成授权
3. 点击「上传到云端」即可同步配置

配置存储在你的 GitHub 私有仓库 `ai-switch-configs` 中。

## License

MIT
