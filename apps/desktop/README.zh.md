# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

`@deepseek-ai/dsh-desktop` 是 DeepSeek Harness 的 Windows 桌面宿主。它沿用现有 Web profile 作为产品界面，将该 profile 作为受控本地进程启动，并在经过安全加固的 Electron 窗口中呈现。架构决策及其取舍以[桌面宿主 Agent Note](../../.agents/notes/implemented/feature/2026-08-14-electron-desktop-host.md)为准。

## 运行与打包

在仓库根目录运行以下命令：

- `pnpm run desktop` 构建仓库并启动桌面应用。
- `pnpm run desktop:pack` 构建解包后的 Windows x64 应用。
- `pnpm run desktop:dist` 构建交互式 NSIS 安装包。

打包产物写入 `dist-desktop-installer/`。安装包名为 `DeepSeek-Harness-<version>-x64.exe`；同目录下的 `win-unpacked/DeepSeek Harness.exe` 是可直接运行的应用。

安装器会将提供的产品图标应用于程序及其快捷方式。快捷方式使用安装目录 `resources/` 下带版本标识的 ICO 资源，避免 Windows Explorer 在升级后继续显示 Electron 默认图标。

该 workspace package 保持私有，因为受支持的分发形式是 NSIS 安装包，而不是 npm tarball。

## 运行时约定

Electron 主进程在随机 `127.0.0.1` 端口上启动已构建的 [`dsh web`](../cli/README.md) profile。桌面应用自有的 Harness 状态存储在 Electron 的用户级应用数据目录下，具体位于 `harness/`；除非继承环境显式覆盖 `DSH_TELEMETRY_DISABLED`，否则遥测保持关闭。

后端会收到一个 Node IPC 通道。关闭窗口时，桌面宿主会请求在限定时间内处置完整 profile 树；父进程意外断开时，也会触发同一条 CLI 关闭路径。同一条仅由父进程掌握的通道还会把原生目录选择请求交给 Electron；Electron 使用自身的系统对话框，并且只返回所选路径或取消结果。启动失败、后端提前退出和关闭超时都会保持为显式失败状态，不会留下脱管后台进程。

打包后的应用将插件 package 保存在真实目录中，而不是放入 `app.asar`。Harness 会维护 profile 模块 fallback Junction，而 Windows Junction 无法指向 ASAR 归档内的虚拟路径。因此，`node-pty`、Koffi、Sharp 和随附 ripgrep 等原生依赖都能由受控 Electron Node 运行时直接加载。

## 窗口安全

renderer 禁用 Node 集成，启用上下文隔离与 Chromium sandbox，并拒绝权限请求。顶层导航仅允许启动页文档和确切的本地 Harness origin。新窗口一律拒绝，普通 HTTP 或 HTTPS 链接会在操作系统浏览器中打开。

Harness HTTP 服务仅监听 loopback。对于已经以同一本地用户身份运行的其他进程，它不是身份认证边界；不要通过代理暴露这个随机端口，也不要将其绑定到非 loopback 接口。

## 验证

`pnpm run test:desktop` 覆盖后端 URL 校验、导航策略、由父进程负责的 CLI 关闭以及桌面选择器 IPC 生命周期。桌面可执行文件接受 `--smoke-test`，执行隐藏的启动、加载与关闭检查。`tests/packaged-native-smoke.cjs` 验证 Windows 打包运行时能够加载 Koffi、Sharp、ripgrep 和 `node-pty`；选择器 smoke 分别覆盖独立 fallback worker 和完整 Electron 父进程后端 RPC 路径。

桌面壳不会改变模型可见行为。现有 Web profile snapshot 继续覆盖产品行为；Electron 与打包原生模块 smoke 覆盖新增的宿主边界。

## 当前限制

仓库当前仅配置 Windows x64 打包目标，尚未配置发布者证书和自动更新通道。真实目录插件布局也会让安装体积更大、内容比 ASAR 壳更易检查；当前 profile Junction 约定要求使用这种布局。
