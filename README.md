# 愉悦

愉悦是一款安卓离线配方练习工具。把自己平时记录的原料、用量和步骤做成题卡，就能用默写、选择题和排序题复习。首次打开时题库为空，所有题目由使用者录入。

## 主要功能

- **题库管理**：新建、搜索和修改配方卡。删除的卡片可从回收站恢复。
- **默写自测**：先输入自己的配方，再点「显示答案」。对照自己填写的内容和参考答案后自行判分。
- **原料辨认**：从其他卡片选取干扰项，组成四选一。候选项不足时跳过该卡。
- **步骤排序**：从有顺序的卡片中选取连续三个不同的步骤，打乱后让你排序。
- **易错复习**：答错的卡片自动收录，复习答对后移出。题卡、回收站和易错记录保存在设备本地。

## 安装方法

在 Windows 上从源码构建安卓安装包。准备 PowerShell 7.2 或更高版本、JDK 21，并安装 Android SDK Build Tools 35.0.0 和 Android API 35 平台。将 `ANDROID_HOME` 设为本机 Android SDK 目录，并确保 `javac`、`jar` 和 `keytool` 可在终端运行。

在项目根目录执行：

```powershell
$env:CUP_RECALL_SIGNING_PASSWORD = Read-Host '输入本地签名口令（至少 6 位）' -MaskInput
try {
    .\build.ps1 `
        -BuildTools (Join-Path $env:ANDROID_HOME 'build-tools/35.0.0') `
        -AndroidJar (Join-Path $env:ANDROID_HOME 'platforms/android-35/android.jar') `
        -OutputApk './outputs/yuyue.apk'
} finally {
    Remove-Item Env:CUP_RECALL_SIGNING_PASSWORD -ErrorAction SilentlyContinue
}
```

首次构建会生成本地开发签名密钥。后续覆盖安装应继续使用原签名密钥和口令。构建成功后，将 `outputs/yuyue.apk` 传到安卓设备并打开安装。应用需要 Android 6.0 或以上版本及支持现代网页功能的 Android System WebView。

## 使用方法

1. 打开「题库」，点「＋ 新建」。填写名称，可选填规格和备注。
2. 在「原料 / 步骤」中每行写一项。需要练顺序时，按实际顺序输入并勾选「这些是有顺序的制作步骤」，然后保存。
3. 打开「练习」，选题型和每轮题量。也可以展开题库里的某张卡，点「练这张」单独默写。
4. 默写后对照参考答案，点「答对了」或「答错了」。答错的卡片可在「易错」里继续练习。

## 输入输出示例

下面的演示卡由使用者手动新建。

- 饮品名为「练习饮品」，规格为「常温」。
- 在「原料 / 步骤」里输入三行，并勾选顺序选项。

```text
加入配料甲 25 mL
加入配料乙 100 mL
搅拌
```

默写时，如果你只填了「加入配料甲 25 mL」，点击「显示答案」后，界面会保留这条作答，并在「参考答案」中按顺序显示完整三行。选择「答错了」后，这张卡会出现在「易错」。

## 验证与许可

在已安装 Playwright 和 Chromium 的 Node.js 环境中运行 `node smoke.cjs`。如需使用本机已安装的浏览器，可通过 `CUP_RECALL_BROWSER` 指定其可执行文件。

项目使用 [MIT License](LICENSE)。
