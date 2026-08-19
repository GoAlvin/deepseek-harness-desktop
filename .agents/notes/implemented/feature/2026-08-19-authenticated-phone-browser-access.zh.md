# Agent Note: 经过身份校验的手机浏览器访问

Status: implemented

[English](2026-08-19-authenticated-phone-browser-access.md) | 中文

## Problem

Web profile 监听回环地址，因为其 Host 信任检查不是身份校验层。手机无法从其他网络访问该表层；如果直接让现有服务器监听全部网络接口，则会在没有凭据的情况下暴露会话控制、文件系统工具和命令执行。单独的手机应用会复制 Web 客户端，也无法解决公网入口的安全问题。

## Decision

在 Web 名录中增加兼具 Host 与浏览器两侧的 `@deepseek-ai/dsh-client-mobile-web` 插件。Host 让普通 Web 服务器继续监听回环地址，并另行启动一个监听全部网络接口的反向代理。该代理只有在配对地址提供进程生命周期内的随机 bearer 后才接受请求，把 bearer 换成 `HttpOnly`、`SameSite=Strict` Cookie，从可见地址中移除它，再使用回环服务器预期的 authority 字段转发 HTTP 与 WebSocket 流量。公网 HTTPS 响应还会为 Cookie 添加 `Secure`。

浏览器半侧只在控制页面位于回环地址时贡献**设置 → 手机访问**。该分节显示局域网二维码，并控制可选的 Cloudflare Quick Tunnel。总开关可以停止或重新启动完整手机传输；停止时会关闭本地代理和隧道、轮换 bearer，并让当前手机 Cookie 失效。手机侧代理会在转发前拒绝控制通道，因此已配对手机可以使用 Harness，但不能自行创建或停止公网入口。

Windows x64 在 `PATH` 中没有可用命令时，可以把固定的官方 `cloudflared` `2026.8.2` 可执行文件下载到 `$DSH_HOME/mobile-web/bin/`。只有其 SHA-256 与上游 GitHub Release 公布的摘要一致时才会接受该文件。设置状态会报告字节数、总大小、百分比和传输速度；无数据超时与总超时会把停滞传输转成明确失败。下载器会遵循标准 `HTTPS_PROXY` 和 `HTTP_PROXY` 环境变量，但不会把变量值传给浏览器。两者均不存在时，桌面宿主会把 Electron 解析的系统 HTTP/HTTPS 代理转换为后端环境变量。其他平台需要预先在 `PATH` 中提供可用的 `cloudflared`。只有用户按下公网访问操作后才会下载并启动隧道；设置页会说明 Quick Tunnel 是临时服务，并提供 Cloudflare 条款与隐私政策链接。

手机渲染现有的自适应 Web 界面。此功能没有手机可执行文件、独立会话存储、同步协议、云端账号，也没有提交第三方插件源码。

## Alternatives considered

**直接打包 `dsh-pocket`。** 该仓库采用 GPL-2.0，而 DeepSeek Harness 采用 MIT；将其放进桌面发行版会为本项目引入不兼容的分发义务，因此不采用。它的浏览器访问流程只用于明确产品需求，没有复制其源码或样式表。

**让主 Web 服务器监听 `0.0.0.0`。** 现有 trusted-host 列表能阻止 DNS 重绑定，但不会验证远程操作者身份，因此不采用。独立的身份校验代理可以让普通桌面与 CLI 访问继续保持在回环地址。

**发布原生手机应用。** 用户需要的是浏览器访问，完整会话客户端已经存在于 Web 表层；应用会增加另一套发布、更新和平台权限生命周期，却不能改善入口身份校验，因此不采用。

**要求 Cloudflare 账号和命名隧道。** 零配置个人访问流程不采用该方案。命名隧道能提供稳定地址和运维控制，但也需要账号凭据与持久配置；随附的 Quick Tunnel 需要明确开启、保持临时，并默认关闭。

## Consequences

桌面用户可以在同一网络中配对手机，也可以主动通过临时公网 HTTPS 地址暴露同一个会话。反向代理测试固定 bearer 交换、Cookie 标志、authority 改写、私有控制路由和口令轮换；组合包配置与浏览器构建检查固定插件解析和设置注册。

bearer 持有者拥有与本地浏览器相同的 Harness 能力，包括使用 Host 进程权限执行操作的工具。用户必须把每个二维码和地址当作凭据，并在使用后关闭公网访问。Quick Tunnel 没有可用性保证，重启后地址会变化，也不是生产级远程访问服务。首个自动二进制路径仅支持 Windows x64。
