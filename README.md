# 杯序

面向安卓的饮品配方背诵工具。练习包括翻卡自测、原料辨认和步骤排序。题库支持查找、新建、修改、移入回收站和恢复。编辑时每行写一项原料或步骤，勾选有顺序的卡片可参加排序练习。配方修改和易错记录保存在手机本地。

- 内置 44 张公开原料卡，卡片逐条附来源。门店用量和制作步骤以门店现行 SOP 为准。
- 排序练习使用自己录入或修订、且标记为有顺序的配方卡。每张卡至少需要一段包含三个不同步骤的顺序。
- 安装包内含练习界面和资料，查配方、翻卡、复习都可离线使用。点开公开来源时会调用手机浏览器。

## 从源文件构建

需要 JDK、Android SDK Build Tools 和 Android API 35 平台。项目通过 Android WebView 加载本地界面，使用 Windows PowerShell 构建。

```powershell
.\build.ps1 -BuildTools 'C:\Android\Sdk\build-tools\35.0.0' -AndroidJar 'C:\Android\Sdk\platforms\android-35\android.jar' -OutputApk '.\cup-recall.apk'
```

本地开发签名存放在 `%LOCALAPPDATA%\CupRecall\development-signing.p12`。要保留手机上安装的应用和练习记录，升级包使用同一签名和包名。

公开原料卡位于 `assets/public-data.js`。如有新版原料工作簿，可运行 `python import-public.py <原料底表.xlsx>` 重新生成。维护卡片时保留现有 ID，方便保留易错记录。

## 界面测试

在已安装 Playwright 和 Chromium 的 Node.js 环境中运行 `node smoke.cjs`。如需用现有的 Edge 或 Chrome 测试，可将环境变量 `CUP_RECALL_BROWSER` 设为浏览器可执行文件路径。
