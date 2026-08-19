# @deepseek-ai/dsh-client-mobile-web

[English](README.md) | 中文

为 Web 与桌面 profile 提供经过身份校验的手机浏览器访问。Host 在全部网络接口上启动受口令保护的反向代理；**设置 → 手机访问**会显示局域网配对二维码，也可启动临时 Cloudflare Quick Tunnel，提供公网 HTTPS 地址。总开关可以启用或关闭完整手机界面；关闭时会同时停止代理与隧道，并使已经发出的全部链接失效。手机打开的是现有自适应 Web 界面，不是单独的应用。

## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `proxyPort` | `3081` | 受身份校验的全接口代理端口；`0` 表示选择空闲端口。 |
| `tunnelStartupTimeoutMs` | `45000` | 等待 `cloudflared` 公布 Quick Tunnel 地址的最长时间。 |

配对地址只携带一次进程生命周期内的随机访问口令。代理将它换成 `HttpOnly`、`SameSite=Strict` Cookie，再跳转到不含口令的地址；公网 HTTPS 响应还会为 Cookie 添加 `Secure`。轮换或关闭公网隧道会使已有配对 Cookie 失效。手机侧代理拒绝 `/mobile-web` 控制通道，设置分节也只注册到回环浏览器表层。

开启公网访问时会优先使用 `PATH` 中已有的 `cloudflared`。Windows x64 环境如果没有该命令，可下载固定版本的官方二进制文件到 `$DSH_HOME/mobile-web/bin/cloudflared.exe`，并核对官方公布的 SHA-256。设置页会在下载期间显示已接收字节数、总字节数、百分比和传输速度；30 秒无数据超时与 15 分钟总超时会把停滞下载转成可以重试的错误。下载会遵循标准 `HTTPS_PROXY` 和 `HTTP_PROXY` 环境变量，但不会把变量值暴露给浏览器；两者均未设置时，桌面宿主会提供 Electron 解析到的系统 HTTP/HTTPS 代理。Quick Tunnel 匿名、临时，只适合个人测试或临时远程访问，不是常驻部署。设置页会在用户开启隧道前提供 Cloudflare 条款与隐私政策链接。

## 模型体验

### 手机访问传输

#### 模型看到的内容

无。`dsh_access` bearer、手机传输、二维码生成和隧道状态都不会进入会话消息或模型请求。

#### Token 影响

该传输不会贡献模型 Token。

#### KV Cache 影响

该传输不会改变供应商请求或其缓存键。

## 已知限制与延期工作

- Quick Tunnel 地址在重启后变化，且没有可用性保证。
- 自动安装 `cloudflared` 仅支持 Windows x64；其他平台需要预先将其放入 `PATH`。
- 任何获得当前配对链接的人都能使用此 Harness，并继承 Host 进程的权限。不使用公网访问时应及时关闭。
- 手机使用自适应桌面 Web 界面；没有离线模式、推送通知服务或后台手机应用。
