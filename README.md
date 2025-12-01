# AIStudio For Move

一个 Host 程序，可以在桌面和手机上打开 AI Studio 导出的 zip 应用（React 19 + importmap + Google GenAI），并在本地在线编译运行。

当前功能：
- Web / Electron：
  - 设置 Gemini `baseurl` 和 `key`
  - 选择任意 AI Studio zip，自动解压 + 编译 TS/TSX + 注入环境变量并运行

后续通过 GitHub Actions 构建：
- Windows exe（Electron）
- Android apk（Capacitor）

> 注意：你需要在 GitHub 仓库的 Secrets 中配置 Gemini 与签名相关的密钥，CI 配置文件会使用这些值完成构建和签名。
  基本功能实现