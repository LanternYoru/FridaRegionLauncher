# v0.1.1：PCL2 CE 兼容性修复

## 实际目标与结论

测试目标：`PCL2_CE_Release_x64.exe`，文件版本 2.15.1.0。本机绝对路径不随源码发布。

问题不能简单归结为“Frida 没注入”或“只缺 ANSI 注册表 API”。在该程序正常启动的采样中，它调用的是首选语言、LCID、线程 Locale、区域格式与时区 API。v0.1.0 安装的 8 个 API Hook 在这段启动采样里没有实际命中，因而没有改变这些返回值。

三次同路径、同 spawn 模式的采样：原发布版 Hook、用户参考脚本、修复版 Hook。原发布版和修复版都显式设为日本 / ja-JP，以排除配置差异。测试仅终止自己新建的进程，不终止已有用户进程。

最初发现一个测试前已运行的后台实例，用户确认已退出。受限沙箱中的两次尝试提前退出，**不能据此确认是单实例限制**。改为正常 Windows 权限环境后，参考脚本、旧版、修复版都持续运行至采样结束。

## 修复版在目标中的真实命中

记录来自目标自己发出的 API 调用，不是启动器主动调用 API 伪造的验证结果。

| API | 原值 → 模拟值 |
|---|---|
| GetSystemDefaultLCID | 2052（0x0804）→ 1041（0x0411） |
| GetThreadLocale | 2052 → 1041 |
| GetUserDefaultLangID | 2052 → 1041 |
| GetUserDefaultLCID | 返回 1041（内部调用可能已受其他 Hook 影响） |
| GetUserPreferredUILanguages / GetThreadPreferredUILanguages | 返回 ja-JP，包括长度查询 |
| GetLocaleInfoEx / GetLocaleInfoW | 默认区域请求转为 ja-JP / 1041 |
| GetTimeZoneInformation / GetDynamicTimeZoneInformation | Bias -480 → -540 |

修复版共安装 44 个 API Hook，本次目标启动采样中实际命中上述 10 类 API；无脚本错误。目标 EXE 的前后 SHA-256 均为：

`168bd8369d5ed4e5478942677562913330ef1d30a5193870af910bd18198050c`

本次没有在目标启动采样中观察到 DeviceRegion 命中。因此 ANSI 注册表遗漏虽然是探针证实的独立缺陷，但不能称为此目标的唯一失败原因。

## 代码与界面修复

- DeviceRegion 增加 RegOpenKey/RegOpenKeyEx、RegQueryValueEx、RegGetValue 的 A/W 覆盖；保留缺失值与错误状态契约。
- UI 语言增加线程及用户/系统/线程/进程首选语言；首选语言支持长度查询、MULTI_SZ 双 NUL、短缓冲区、LANGID 字符串与无效 flags。
- 区域格式增加用户/系统 LANGID、LCID、线程 Locale，默认 GetLocaleInfo / 日期、时间、数字、货币格式化请求使用配置的 Locale。显式指定其他地区的请求保持原行为。
- 新增独立东京固定 UTC+9 开关，包括时区信息、按年查询、GetLocalTime、FILETIME 双向转换。不修改 UTC 系统时钟，不影响显式指定的外国时区。
- 新增“应用日本兼容预设”，一次设置 GeoID 122、日语 UI/Locale、东京时区；之后仍可分别修改或关闭。
- 旧配置缺少 timezone 时默认为关闭，不静默改变原有设置。用户/系统 UI 与用户/系统格式参数继续独立。

## 验证

- TypeScript / Vite / Electron bundle：通过。
- 前端测试：4 项通过（包含旧配置迁移）。
- Python 后端测试：8 项通过。
- 原有 Windows 原生 + .NET DeviceRegion 集成：通过。
- 新兼容回归：ANSI 读取/缺失值/缓冲区；扩展 NLS；首选语言契约；东京时区/结构体哨兵；FILETIME 往返；显式 UTC；独立配置；全关闭后恢复基线：通过。
- 实际 Electron：点击日本兼容预设、保存、启动探针、产生真实 Hook 日志：通过。
- 发布目录资源检查、打包后 Electron 界面测试：通过。
- 最终 v0.1.1 便携 EXE：仅保留系统 PATH，自动解压并通过内置 Python/Frida 启动原生探针：通过。
- 同一便携 EXE 启动实际 PCL2 CE：真实日志确认 GetSystemDefaultLCID 返回 1041、GetTimeZoneInformation 返回 Bias -540，无 ERROR 日志；测试完成后终止本次创建的目标实例：通过。证据为 `artifacts/compatibility/portable-target.json`。

发布文件：`release/FridaRegionLauncher-Windows-x64-Portable-0.1.1.exe`，SHA-256：`2010cf0c605f5135180b2c1413cafcd3cf8465a977a0b9d48053e641e0d98b83`。

新探针与用户参考脚本对照时，普通日本语言/时区/现存 DeviceRegion 查询结果一致。对于 32 位视图原本不存在的 DeviceRegion 值，修复版返回 122，参考脚本仍返回不存在——这是保留现有缺失值处理的有意差异。

自动证据：`artifacts/compatibility/target-old-unsandboxed.json`、`target-reference-full.json`、`target-fixed.json`、`comparison.json`、`regression.json`。

## 使用与验证边界

运行 v0.1.1，选择该 EXE，点击“应用日本兼容预设”，确认四项均已启用，再启动。请先完全退出目标程序旧实例；本次 spawn Hook 不会影响它们。

已确认实际目标调用拿到了模拟值，**尚未人工确认它界面上的最终地区判断或全部业务行为**。用户提供的参考脚本验证范围也不等于所有 Windows API 的兼容保证。当前时区只支持东京固定 UTC+9，其余 DST 时区和子进程仍未实现。

API 契约参考：[GetUserPreferredUILanguages](https://learn.microsoft.com/en-us/windows/win32/api/winnls/nf-winnls-getuserpreferreduilanguages)、[GetThreadPreferredUILanguages](https://learn.microsoft.com/en-us/windows/win32/api/winnls/nf-winnls-getthreadpreferreduilanguages)、[GetTimeZoneInformationForYear](https://learn.microsoft.com/en-us/windows/win32/api/timezoneapi/nf-timezoneapi-gettimezoneinformationforyear)。
