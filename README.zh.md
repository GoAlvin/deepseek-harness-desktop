# DeepSeek Harness Desktop

[English](README.md) | 中文

DeepSeek Harness Desktop 是一个独立开源的 Windows 桌面发行项目，基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 构建。它将完整的 Harness Web 界面、本地智能体运行时、原生目录选择器和受控后端封装到一个 Electron 应用中。

这是社区维护的独立发行版，并非 DeepSeek 官方桌面客户端。上游 Harness 的架构与 package 源码仍归属 DeepSeek AI，并按 [MIT 许可证](LICENSE)保留署名。

## 下载

从[最新桌面版 Release](https://github.com/GoAlvin/deepseek-harness-desktop/releases/tag/desktop-v0.1.0-rc.7)下载 Windows x64 安装包：

- `DeepSeek-Harness-0.1.0-rc.7-x64.exe`
- SHA-256：`C9076856499C78DCD51F4885B068AEEB128A7113A4300540F1E795FBECB7D9AD`

安装包尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”警告。运行安装包前请核对 SHA-256 摘要。

## 功能

- 在原生桌面窗口中提供完整的 DeepSeek Harness Web UI。
- 由单一桌面应用负责后端启动、就绪检测、关闭与崩溃清理。
- 使用 Windows 原生文件夹选择器，不向 renderer 暴露 Node 或 Electron API。
- Harness 服务在随机本地端口上仅监听 loopback。
- 自定义应用、安装器、开始菜单与桌面快捷方式图标。
- 打包 Koffi、Sharp、ripgrep 和 `node-pty` 原生运行时。
- 支持用户级 Harness profile、设置、凭据与会话持久化。

<a id="run"></a>

## 首次使用

1. 安装并打开 DeepSeek Harness Desktop。
2. 选择一个工作区文件夹。
3. 打开**设置 → 模型**，输入 DeepSeek API 密钥并保存。
4. 在所选工作区中开始对话。

提供方凭据保存在应用的用户级 Harness 数据目录下。renderer 只能收到脱敏后的凭据描述；支持的提供方和存储行为见[提供方指南](docs/user/guide/providers.md)。

## 从源码运行

环境要求：

- Windows 10 或 Windows 11，x64
- Node.js `^22.19` 或 `>=24`
- pnpm `11.7.0`

```powershell
git clone https://github.com/GoAlvin/deepseek-harness-desktop.git
cd deepseek-harness-desktop
corepack enable
pnpm install
pnpm run desktop
```

`pnpm run desktop` 会构建仓库并启动桌面应用。仅使用浏览器开发时，可以运行 `pnpm dsh web`。

## 打包桌面应用

```powershell
pnpm run desktop:pack
pnpm run desktop:dist
```

`desktop:pack` 生成解包后的 Windows 应用，`desktop:dist` 在 `dist-desktop-installer/` 下生成交互式 NSIS 安装包。打包细节与 smoke 测试入口见[桌面 package 参考](apps/desktop/README.md)。

## 项目结构

- [`apps/desktop/`](apps/desktop/)：Electron 主进程、打包配置、图标和安装版运行时 smoke 测试。
- [`apps/cli/`](apps/cli/)：`dsh` profile 启动器，以及桌面宿主使用的父进程关闭路径。
- [`packages/`](packages/)：Harness 插件，包括桌面父进程目录选择器传输层。
- [`docs/`](docs/)：用户、架构、开发与扩展文档。
- [`vendor/`](vendor/)：从上游 Harness 继承的固定版本 Cordis 源码。

## 安全模型

renderer 禁用 Node 集成，启用上下文隔离和 Chromium sandbox，并拒绝权限请求。导航仅允许启动页文档和确切的本地 Harness origin；外部 HTTP 与 HTTPS 链接会在操作系统浏览器中打开。

本地 Harness 服务仅监听 `127.0.0.1`。这可以防止远程网络访问，但不会认证以同一 Windows 用户身份运行的其他进程。不要通过代理将本地服务暴露出去，也不要将其重新绑定到 loopback 之外。

## 当前限制

- 目前仅提供 Windows x64 打包目标。
- 安装包没有发布者证书和自动更新器。
- Harness profile Junction 无法指向 ASAR 虚拟文件系统中的 package，因此真实目录插件布局会产生体积较大且内容可检查的安装目录。
- 项目沿用上游开发者预览兼容性策略，不同版本之间可能包含破坏性变更。

## 文档与贡献

建议从[用户指南](docs/user/guide/index.md)、[桌面 package 参考](apps/desktop/README.md)、[开发指南](docs/development.md)和[架构文档](docs/architecture.md)开始。贡献代码时请遵循 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [AGENTS.md](AGENTS.md)。

## 许可证与上游

本项目按 [MIT 许可证](LICENSE)分发，第三方依赖及其许可证列于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

DeepSeek Harness Desktop 派生自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。本仓库独立发布桌面集成源码与二进制安装包，并保留上游声明与源码署名。
