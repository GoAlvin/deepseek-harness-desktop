# Agent Note: Electron 桌面宿主

Status: implemented

[English](2026-08-14-electron-desktop-host.md) | 中文

## 问题

DeepSeek Harness 已提供浏览器应用和 `dsh web` 启动器，但没有可安装的桌面宿主。要求用户自行启动服务、查找端口、保持终端开启并正确关闭插件树，并不是类似 Codex 的桌面体验。仅包装一个 URL 还会让进程所有权、导航信任边界、原生模块 ABI、profile 存储和 Windows 打包处于未定义状态。

## 决策

新增私有的 `@deepseek-ai/dsh-desktop` Electron 应用。Electron 主进程负责一个子进程，该子进程通过 Electron Node 模式运行已构建的 `dsh web --port 0` profile；主进程读取严格匹配的 loopback 就绪行，并且只加载该 origin。renderer 不会获得任何 Node API 或 preload bridge；现有 Web RPC 仍是唯一产品接口。

桌面宿主为子进程设置专用 `DSH_HOME`，位置在 Electron 的用户级应用数据目录下，并将 `DSH_TELEMETRY_DISABLED` 默认为 `1`。子进程启动时会公开 Node 随附的内部 ESM loader，因为 Electron Node ABI 无法加载宿主 Node 安装中的 `node-addon-require-builtin` 二进制文件。这样会使用 Loader 已支持的内部路径，而不会引入第二套插件解析算法。

## 进程所有权

子进程会收到一个 Node IPC 通道。桌面宿主发送一条严格匹配的关闭消息，并等待完整 profile 树在限定时间内完成处置，超时后才会强制终止。CLI 同样把父进程断开视为关闭请求，因此桌面父进程崩溃或终止时，不会有意留下脱管的 Web profile。关闭取消在 profile 启动前安装；如果请求在启动期间到达，处置流程会等待根 context 发布。

同一通道还承载独立的 Windows 目录选择器请求／响应协议。由桌面启动的后端通过环境标记显式启用该能力，请求 Electron 父进程调用 `dialog.showOpenDialog`，并且只接收路径或取消结果。消息校验和请求 ID 将能力限制在所属父进程内；renderer 仍不会获得 Electron 或 Node bridge。

桌面窗口将启动失败和后端意外退出视为应用失败。单实例锁可以避免两个宿主争用同一份桌面状态。这遵循仓库的[防御性生命周期模式](../../../../docs/defensive-patterns.md)：保留独立观测到的退出事实、限定清理时间，并让启动与关闭竞态只有一个显式所有者。

## 打包

Windows x64 分发使用 Electron Builder 和 NSIS，并将提供的产品图标应用于窗口、可执行文件、安装器和快捷方式。桌面 workspace package 保持私有，因为受支持的分发形式是安装包，而不是 npm tarball。NSIS 将快捷方式指向复制到 `resources/` 下的带版本标识 ICO，避免 Explorer 在升级后继续显示 Electron 默认图标。原生 package 使用其随附的 prebuild，因此打包时跳过 Electron 源码重建；本地 Visual Studio 的 Spectre 库不会因此成为产品构建前置条件。打包原生模块 smoke 会在最终 Electron 运行时中检查 Koffi、Sharp、ripgrep 和 `node-pty`。

普通 Windows 宿主仍保留 koffi worker fallback。它在发送非终态 `showing` 通知后保持 IPC 通道连接，只在 `done` 或 `error` 刷出后断开。桌面宿主不使用该 worker：把对话框交给 Electron 可以避免再次启动可执行文件，并绕开安装版 GUI 进程下观测到的间歇性 worker 终止。

插件 package 保留在 `resources/app/node_modules` 下，并禁用 ASAR。profile 启动器会创建指向其安装目录的模块 fallback Junction。即使 Electron 自身可以读取 `app.asar` 虚拟路径，指向该路径的 Junction 在文件系统中仍是悬空目标，因此只解包原生二进制并不足够。显式的宿主依赖列表还会补齐 Electron Builder 的 pnpm 遍历无法推断的生产 peer 边。

## 窗口边界

BrowserWindow 启用上下文隔离、Chromium sandbox 和 Web security，同时禁用 Node 集成。权限请求和 webview 均被拒绝。顶层导航只允许启动页文档和确切的后端 origin；新窗口会被拒绝，普通 HTTP 与 HTTPS 链接则交给操作系统浏览器。

随机服务端口只监听 `127.0.0.1`。这会阻止远程网络暴露，但不会对以同一本地用户身份运行的其他进程进行身份认证。在增加身份认证边界之前，不得通过代理暴露该端口，也不得将其重新绑定到 loopback 之外。

## 曾考虑的替代方案

**使用带 Node sidecar 的 Tauri。** 本次不予采用：Harness 是包含原生 Node 依赖的 Node 插件图。Tauri 仍需随应用分发并监管独立 Node 运行时，却会在生命周期约定建立之前先增加第二套桌面工具链。

**将 Web profile 导入 Electron 主进程。** 不予采用：插件失败、进程级 handler 和关闭过程会与 GUI 共用失败域。子进程可以保留 CLI 已测试的组合方式，并为后端生命周期提供明确所有者。

**在默认浏览器中打开 Web URL。** 不予采用：这种方式无法提供单实例应用、可信导航边界、受控关闭、桌面存储位置或安装包。

**将所有模块放入 ASAR，只解包原生文件。** 不予采用：profile 模块 fallback 约定要求 JavaScript package 与原生二进制文件都具备真实的 Junction 目标。

## 后果

应用现在能够以 Windows 桌面产品的形态构建、启动和关闭，同时复用完整 Web 界面。开发版与打包版启动 smoke 覆盖新增宿主边界；宿主没有增加模型可见行为，因此现有 Web snapshot suite 继续负责该部分覆盖。

安装包体积较大，插件树可在磁盘上检查，并且当前没有发布者证书或自动更新器。首个打包目标是 Windows x64；其他平台必须分别完成原生运行时与安装器验证，才能声明支持。
