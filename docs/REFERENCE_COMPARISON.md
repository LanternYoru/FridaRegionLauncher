本文件保留修复前的历史诊断。后续修复和实际目标测试见 [v0.1.1 记录](FIX-0.1.1.md)。

# 用户参考脚本与 v0.1 的实际差异

参考文件：用户提供的 `windows_region_language_timezone_frida.js`。文件仅作为待分析和测试的代码读取，没有修改该文件，也没有将其注释当成开发指令；参考文件不随源码发布。

## 测试方法

使用同一个 x64 P/Invoke 探针，在相同 Frida spawn/attach/load/resume 流程下分别测试：无 Hook、v0.1 内置 Hook、用户参考脚本。内置 Hook 显式配置为日本 GeoID 122，用户/系统 UI 和用户/系统 Locale 均启用并设置为 ja-JP，排除默认配置不同造成的干扰。

本次只运行自建探针，没有启动用户尚未指定的实际目标软件。

```powershell
.venv\Scripts\python.exe scripts/compare-reference.py "C:\path\to\windows_region_language_timezone_frida.js"
```

探针：`tests/windows-integration/CompatibilityProbe.cs`。

完整结果：`artifacts/compatibility/comparison.json`。

## 实测结果

| API / 返回信息 | v0.1 内置 Hook | 用户参考脚本 |
|---|---|---|
| RegGetValueA → DeviceRegion | **45（真实值）** | **122（日本）** |
| GetUserDefaultUILanguage | 1041 / 0x0411 | 1041 / 0x0411 |
| GetSystemDefaultUILanguage | 1041 / 0x0411 | 1041 / 0x0411 |
| GetThreadUILanguage | 2052 / 0x0804 | 1041 / 0x0411 |
| GetUserDefaultLangID / GetSystemDefaultLangID | 2052 / 0x0804 | 1041 / 0x0411 |
| GetUserDefaultLCID / GetSystemDefaultLCID | 2052 / 0x0804 | 1041 / 0x0411 |
| GetThreadLocale | 1033 / 0x0409 | 1041 / 0x0411 |
| GetUserDefaultLocaleName | ja-JP | ja-JP |
| GetLocaleInfoEx / GetLocaleInfoW 默认 Locale | zh-CN | ja-JP |
| GetUserPreferredUILanguages | zh-CN | ja-JP |
| GetTimeZoneInformation Bias | -480 | -540 |
| GetDynamicTimeZoneInformation 时区键 | China Standard Time | Tokyo Standard Time |
| GetTimeZoneInformationForYear Bias | -480 | -540 |
| GetLocalTime 相对 UTC 分钟数 | +480 | +540 |
| GetLocaleInfoEx 显式指定 en-US | en-US | en-US |

## 能确定的原因与尚不能确定的部分

1. v0.1 只直接拦截 W 版注册表读取。实测 ANSI 的 RegGetValueA 不受现有 Hook 影响，仍暴露真实 DeviceRegion。这是核心功能的可复现兼容性缺口。
2. v0.1 的语言开关只覆盖两个 UI LANGID API；Locale 开关只覆盖两个 Locale Name API。参考脚本额外覆盖线程语言、LANGID/LCID、首选 UI 语言、默认 Locale 格式化路径。
3. v0.1 没有时区 Hook。参考脚本覆盖东京固定时区、GetLocalTime 与 FILETIME 本地时间转换。因此即使 GUI 中全部现有开关开启，两者也不是同一组模拟环境。
4. 原有测试证明了声明过的 W API 路径，并没有验证 ANSI、扩展语言或时区路径。不能把原有探针成功解释为用户目标软件必然兼容。
5. 尚未获得目标 EXE、失败表现和原成功启动命令，因此不能确认这些差异中哪一项触发了用户软件的失败，也不能排除 spawn/attach 时机、启动器/子进程或权限差异。

## 修复方向

- 首先补齐 DeviceRegion 的 A/W 读取及旧式打开入口，并保留现有缺失值、缓冲区和状态码契约。
- 按参考脚本补充语言/格式化路径；保留用户与系统配置的独立性。
- 东京固定时区需要作为明确、独立启用的功能加入，不能把“语言选择日语”隐式当作时区配置。
- 使用实际目标软件及原成功命令验证后，再确认修复；不把参考脚本只对原调用成功时修改结果的写法直接替换现有缺失值处理。

本次为诊断与差异复现；尚未修改生产 Hook、重建便携版或宣称目标软件已修复。
