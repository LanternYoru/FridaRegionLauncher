当前 v0.1.1 的增量验证与目标实测见 [修复记录](FIX-0.1.1.md)。以下保留 v0.1.0 历史验证。

# v0.1 验证记录

验证日期：2026-10-22（Asia/Hong_Kong）。本机 Windows 11 10.0.26200 x64，Python 3.12.14，Frida 17.24.3。

## 已实际通过

- TypeScript 严格检查与 Vite / Electron bundle 构建。
- Vitest：3 项协议与配置边界测试。
- Python unittest：8 项测试，包含真实 Windows 参数解析、attach/load 失败清理、守护进程 EOF 终止 / release 保留、真实 JSON Lines 进程通信与错误恢复。
- Windows 原生 + .NET 集成：真实 DeviceRegion **45 → 94**；关闭 Hook 后恢复基线。
- 64 位注册表视图现存值与 32 位视图缺失值；大小写、相对键路径、.NET Registry。
- 数据长度查询、短 / 正好 / 大缓冲区、哨兵不被覆盖、NULL 参数契约。
- RegGetValueW 类型过滤 / ZEROONFAILURE / 冲突 WOW64 flags。
- 独立 UI 语言、独立 Locale Name、短 Locale 缓冲区 LastError。
- 引号、空参数、尾部反斜杠、中文和空格路径、明确工作目录。
- 真实 Hook 日志、进程退出清理、不相关值、用户 GeoID 和时区不变。
- 目标 EXE SHA-256 与真实 DeviceRegion 注册表前后快照保持一致。
- PyInstaller onedir 独立后端启动，JSON Lines ready / shutdown 正常。
- 实际 Electron 桌面端到端：UI 选择路径、保存、启动探针、真实 HOOK 日志、浅深色切换、无 pageerror。
- Electron contextIsolation / renderer sandbox 已启用，renderer 无 Node require。
- 发布目录中的 PyInstaller 后端在 PATH 仅含 Windows System32 时启动 / shutdown 成功。
- 发布目录中的完整 Electron GUI 在 PATH 仅含 System32、移除 Python/Node 环境变量后，仍通过配置保存、真实探针启动与 HOOK 日志测试。
- 最终 **Portable EXE** 自解压入口已实际运行；使用本地 CDP 自动化验证 GUI、内置 Frida 启动和真实 HOOK 日志，PATH 同样仅含 System32。

便携产物：`release/FridaRegionLauncher-Windows-x64-Portable-0.1.0.exe`，148,618,476 字节（约 141.7 MiB），未签名。

SHA-256：`ae0e553d1a6e017b0c925145cb100e593b6d787de90a2f45d01410e46b2fc1b5`。

便携入口使用 `scripts/smoke-portable.mjs` 测试。NSIS 包装器不会转发 Electron inspector 的 stderr，因此它使用临时 loopback CDP 连接；普通启动不会启用该端口。最初直接使用 Playwright Electron 适配器测试 NSIS 包装器因调试连接超时，改用 CDP 后通过；这与独立发布目录的 Electron 适配器测试相互补充。

证据位于 `artifacts/integration-results.json`、`artifacts/ui-light.png`、`artifacts/ui-dark.png`、`artifacts/ui-logs.png`、`artifacts/ui-portable.png`。这些是生成文件，默认不提交 Git。

## 尚未验证的兼容性范围

- GitHub 托管 Runner 工作流实际运行：仓库尚未推送 / 触发，本地构建不能替代 CI 运行结果。
- Windows 10 与不含任何开发环境的全新 Windows VM。
- 所有第三方程序、不同 .NET 版本、直接 NT 系统调用、受保护应用。
- 完全不存在的 DeviceRegion **键**（本机测试覆盖缺失**值**；虚拟只读键实现需要在适用 Windows 版本进一步验证）。
- GUI 原生 EXE 文件拖放的人工验证；代码使用 Electron `webUtils.getPathForFile`，自动化覆盖路径输入及保存。
- 时区 / 用户 GeoID / 子进程 / 多配置属于 v0.2，未实现，不视为已测试。

## 测试解释

测试程序使用 x64 进程访问两个注册表视图；这不是 x86 目标兼容性测试。区域格式只测试 Locale Name API，不能据此推断所有日期、数字格式 API 都被模拟。高频日志有上限，尾部事件可能在极短进程中丢失。
