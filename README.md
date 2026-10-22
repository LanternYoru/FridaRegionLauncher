# Frida Region Launcher

Windows 10/11 x64 的进程内区域环境模拟启动器。v0.2.0-beta.1 使用 **Electron + React + TypeScript** 桌面界面与 **Python + Frida** 独立后端。目标程序从原路径启动，不重打包、不修改目标文件、不写入真实系统区域设置。

## v0.2.0-beta.1 更新

- **多程序配置**：新增、复制、重命名、删除、搜索、一键启动；切换前保存编辑草稿；JSON 导入/导出。
- **用户地区**：独立 GetUserGeoID / GetUserDefaultGeoName，Windows 原生数据解析 GeoName；与 OOBE 设置互不绑定。
- **动态时区**：东京、北京、太平洋时间、欧洲中部、UTC；按本机 Windows 规则支持夏令时、历史年份以及默认时区转换。
- **旧配置迁移**：读取 v1 时无损迁移为 v2，新用户地区模块保持关闭；导入配置不自动启动 EXE，重新分配 ID。
- 本版是 v0.2 的首个测试版，子进程 gating 尚未实现。详见 [版本说明与验证](docs/V0.2-BETA.md)。

## v0.1.1 更新

修复 PCL2 CE 实际调用未被旧版覆盖的问题：补充 ANSI 注册表 API、LCID/线程/首选语言、默认格式化路径，并提供独立东京 UTC+9 时区和“应用日本兼容预设”。详见 [目标实测与修复记录](docs/FIX-0.1.1.md)。

## 已实现

- 中文桌面界面，浅色 / 深色 / 跟随系统，EXE 选择、拖放与图标读取。
- 启动参数、工作目录、Windows 参数解析；不使用 shell 拼接启动命令。
- Frida spawn → attach → load → 同步确认初始化 → resume。
- **OOBE DeviceRegion** 精确路径和值名拦截；缺失值模拟、长度查询、短缓冲区、类型、状态码、32/64 注册表视图。
- UI 语言：用户和系统分别设置，覆盖线程与首选 UI 语言。
- 区域格式：用户和系统 Locale 分别设置，覆盖 LANGID/LCID、Locale Name 和默认格式化请求，与 UI 语言独立启用。
- 独立 Windows 动态时区、GetLocalTime 与 FILETIME 转换；日本兼容预设。
- 真实 Hook 日志与加载状态分离；PID、已安装 API 数量、命中数、运行时间。
- 日志搜索、级别过滤、自动滚动、复制、导出；100 ms Hook 批处理、200 ms 界面更新、2000 条显示上限。
- 多程序配置 JSON 持久化、导入导出、最近程序、旧版本迁移与原子替换保存。
- 终止进程与停止监控分离；退出应用卸载 Hook、保留已运行的目标。
- 独立初始化守护进程：使用继承的 Windows 进程 HANDLE，后端异常或初始化超过 25 秒时清理目标，不依赖可能复用的 PID。
- PyInstaller onedir 后端、electron-builder portable、Windows CI、原生/.NET 验证程序。

**阶段范围**：v0.2.0-beta.1 已加入多配置、用户地区和动态时区。子进程 Hook 属于后续测试版；插件、已运行进程 attach 等属于后续阶段。

## 直接运行便携版

运行 `release/FridaRegionLauncher-Windows-x64-Portable-0.2.0-beta.1.exe`。最终用户不需要 Python、Node、Frida CLI 或 Visual Studio。便携启动器会把应用资源解压到临时目录。用户配置仍存储在 Windows 用户数据目录，不放在安装目录。

选择 EXE → 选择地区 / 独立 Hook 开关 → 点击“启动程序”。“保存配置”将当前设置持久化；启动也会保存配置。目标执行相应 API 时，“运行日志”才会出现 HOOK 事件。停止监控会卸载 Hook，但目标已缓存的结果可能继续存在。

## 开发环境与命令

需要 Windows x64、Node.js **24.x**、pnpm **11.25.0**、Python **3.12 x64**。测试探针使用 Windows 自带 .NET Framework 4.x 编译器，不要求 Visual Studio。

```powershell
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm exec install-electron --no
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
pnpm dev
```

`pnpm dev` 启动 Vite 和 Electron；React 支持热更新。修改 main/preload 后重启开发命令。开发后端固定使用项目 `.venv\Scripts\python.exe`，不会猜测其他 Python 安装路径。

如 Electron 官方二进制下载连接失败，可按照[官方安装文档](https://www.electronjs.org/docs/latest/tutorial/installation)设置镜像并重试，不要关闭校验和检查。本工程未把本机镜像设置写入全局配置。

```powershell
pnpm build
pnpm test
pnpm test:backend
pnpm test:integration
.venv\Scripts\python.exe tests/windows-integration/compatibility.py
node scripts/smoke-electron.mjs
.venv\Scripts\python.exe tests/windows-integration/geo_timezone.py
node scripts/smoke-profiles.mjs
```

## Windows 便携版构建

```powershell
.venv\Scripts\python.exe scripts/build-backend.py
pnpm package
.venv\Scripts\python.exe scripts/verify-package.py
node scripts/smoke-electron.mjs --packaged
node scripts/smoke-portable.mjs
```

`build/backend/frl-backend/` 包含 Python 运行时、Frida 扩展和 JS 模块。electron-builder 将其复制到 `resources/backend/`；发布模式使用 `process.resourcesPath`，不依赖开发机器路径。`verify-package.py` 把 PATH 缩减为 Windows 系统目录，验证独立后端启动。完整发布目录可在 `release/win-unpacked/` 找到。

未配置代码签名。未签名程序可能触发 Windows SmartScreen 提示；项目不自动申请管理员权限或尝试绕过保护。

## GitHub Actions

推送到 `main`/`master`、创建 PR，或在 Actions 中手动运行 **Windows x64 Portable**。工作流运行于 `windows-2022`：安装锁定依赖 → TypeScript/前端测试 → Python 测试 → 真实 Frida 探针 → PyInstaller → electron-builder → 独立后端验证 → 上传便携 EXE 和测试证据。

下载 `FridaRegionLauncher-Windows-x64-Portable` artifact 即可获取 EXE。CI 不自动创建 Release，也不上传用户程序。未实际在 GitHub 上触发的构建不算已通过。

## 测试探针

源码：`tests/windows-integration/RegionProbe.cs`。其 P/Invoke 直接调用 Windows API，另外使用 .NET `RegistryKey` 检查实际 .NET 访问路径。结果输出为 JSON，不读取启动器配置。

```powershell
.venv\Scripts\python.exe scripts/build-probe.py
& '.\artifacts\中文 空格\RegionProbe.exe'
pnpm test:integration
.venv\Scripts\python.exe tests/windows-integration/compatibility.py
```

自动测试比较普通启动、模拟启动、全部关闭 Hook 的结果，覆盖：

- 精确 DeviceRegion、相对打开路径、大小写、两个注册表视图、.NET Registry。
- NULL 数据缓冲区、NULL 长度、2/4/16 字节缓冲区、边界哨兵。
- `RegGetValueW` 类型过滤、失败清零、互斥 WOW64 flags。
- 用户 / 系统 UI 语言与 Locale Name、短 Locale 缓冲区 LastError。
- 不相关注册表值、未启用的 GeoID/时区保持原结果。
- 中文 / 空格 EXE 路径、空参数、引号、尾部反斜杠、工作目录。
- 实际 HOOK 日志、Session 清理、目标 SHA-256、真实注册表前后快照。

测试输出写到 `artifacts/integration-results.json`。本机已经实际验证：真实 DeviceRegion 45 → 模拟 94；32 位注册表视图原本缺失的值也正确返回 94。测试从未写入真实注册表来制造场景。

前端自动化测试使用 Electron 实例，检查隔离设置、配置保存、点击启动后出现真实 HOOK 日志，并生成浅色 / 深色 / 日志截图。测试用户数据隔离于 `artifacts/ui-user-data`，不覆盖日常配置。

最新实测结果与未验证项见 [v0.2 测试版验证](docs/V0.2-BETA.md)；[v0.1 历史验证](docs/VALIDATION.md) 保留供参考。

## 关键实现说明

**DeviceRegion 路径**：仅 `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\DeviceRegion` 键下的 `DeviceRegion` 值。值为 REG_DWORD Windows GeoID。预设来自 [Microsoft GeoID 对照表](https://learn.microsoft.com/en-us/windows/win32/intl/table-of-geographical-locations)，未通过 ISO 代码推算。自定义输入只验证正整数范围，不保证该整数确实对应 Windows 地区。

**句柄和返回契约**：真实 HKEY 通过 `NtQueryKey` 解析，避免只靠句柄缓存导致复用误命中；逻辑 WOW64 路径归一化。不存在的精确键通过进程内只读虚拟键支持查询，使用独立内核事件句柄，不创建注册表键。对其他值仍返回不存在。访问拒绝和无效句柄不被转成成功。不支持将虚拟键用于枚举、写入、事务或通知。

**数据长度**：REG_DWORD 输出 4 字节。长度查询返回成功；短缓冲区返回 `ERROR_MORE_DATA` 并告知需要 4 字节。`RegGetValueW` 实现类型过滤和 ZEROONFAILURE。拦截逻辑在进入原调用前决定模拟路径，缺失值不依赖原 API 输出缓冲区的内容。

**语言**：底层分别保存 `userUI` / `systemUI` / `user` / `system`；UI LANGID 与区域格式参数分别配置；首选 UI 语言随 UI 设置，LANGID/LCID 与默认日期/数字/货币格式化随 Locale 设置。不覆盖任意代码页 API。时区只在独立开关启用时生效。动态时区规则来自本机 Windows 数据，保持显式指定其他时区的请求不变。

**协议**：UTF-8 JSON Lines。stdout 只输出机器协议；traceback 到 stderr。Frida 目标输出使用独立 pipe，永远不作为后端协议解析。request、response、event 类型分离，requestId 一一对应。Electron 处理多行、分段 UTF-8、消息上限、超时、后端退出和待处理 Promise 清理。

**安全**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；受限 preload、IPC 来源及 Zod 参数验证、CSP、禁止导航与新窗口。本地 EXE 还经过 Python PE x64 检查。不会自动提升权限。

## 项目结构

```text
src/
  main/             Electron 窗口、配置、文件对话框、后端管理与 IPC
  preload/          明确且受限的桌面接口
  renderer/         React 中文界面、组件和主题样式
  shared/           Zod 配置类型、JSON Lines 解码
backend/
  main.py           stdin/stdout 命令循环
  frida_manager.py  spawn/attach/script/resume/session
  process_manager.py 初始化守护进程（继承 HANDLE）
  config.py         PE 校验、配置校验、Windows 参数解析
  protocol.py       协议验证和线程安全输出
  hooks/            runtime.js、device_region.js、geo_region.js、language.js、timezone.js
  backend.spec      PyInstaller onedir
resources/          原创图标、Windows GeoID 预设
tests/
  frontend/         协议边界和配置验证
  backend/          错误清理、参数、守护进程
  windows-integration/ 原生/.NET 探针与真实 Frida 比较
scripts/            开发、构建、探针、桌面冒烟、发布验证
.github/workflows/ Windows x64 自动构建
```

## 依赖版本

固定直接依赖并提交 `pnpm-lock.yaml` 与 `backend/requirements-lock.txt`。本轮查询 npm/PyPI 稳定通道后锁定：

| 组件 | 版本 |
|---|---|
| Electron | 45.0.0 |
| React / React DOM | 19.3.1 |
| TypeScript | 7.0.2 |
| Vite | 8.3.5 |
| Tailwind CSS | 4.3.3 |
| Radix Switch | 1.4.1 |
| Lucide React | 1.61.0 |
| Zod | 4.6.7 |
| electron-builder | 26.15.3 |
| Frida Python | 17.24.3 |
| PyInstaller | 6.16.0 |
| Playwright | 1.62.1 |

UI 采用 shadcn/ui 的源码组件组织方式（Radix、CVA、clsx、tailwind-merge），Button/Switch 源码保存在仓库内，`components.json` 保留组件配置；shadcn/ui 本身不是运行时 SDK。

## 已知边界与下一阶段

- 只支持 x64 目标；x86/ARM64 在 PE 检查时明确拒绝。32/64 **注册表视图**测试不代表支持 x86 进程。
- 不保证所有 Windows API、直接 NT 注册表查询、事务路径、服务、子进程、缓存或远端地区判断生效。
- 启动器只能约束自己的模拟行为；目标程序本身仍拥有其正常系统权限，并非隔离沙箱。
- 缺失键的虚拟句柄只支持声明的只读 API，不能作为完整注册表虚拟化使用。进程终止会回收所有句柄；停止监控后应避免目标继续使用之前缓存的虚拟句柄。
- 日志是有界诊断数据；高频时会省略并报告数量，极短进程尾部事件可能来不及刷新，但首个实际命中立即发送。
- 默认一次管理一个主进程。停止监控后的目标仍在运行，启动器不再提供其终止按钮。
- Windows 10、干净 Windows VM、第三方复杂应用、反注入/受保护进程、不同系统版本的全部路径尚需兼容性测试。
- 下一测试版：有超时保护的子进程 gating、真实应用兼容性矩阵及更广泛的 Windows 10/11 验证。

## 官方参考

- [Frida JavaScript API](https://frida.re/docs/javascript-api/)
- [Frida 文档](https://frida.re/docs/)
- [RegQueryValueExW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regqueryvalueexw)
- [RegGetValueW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-reggetvaluew)
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security/)
- [electron-builder](https://www.electron.build/)
- [DeviceRegion 背景分析（非官方，非 API 契约）](https://withinrafael.com/2023/11/17/device-region-and-integrated-services-region-policy-in-windows/)

MIT License。Frida、Electron 与其他依赖保留各自许可证；发布资源包含其自带许可证。
