# 学习通课程文件下载器 · Tauri 2 Windows 单文件独立打包指南

本工程采用 **Tauri 2（Rust + Windows 原生 WebView2 + React）** 架构，最终输出约 **10~14 MB** 的独立 `.exe` 可执行文件，无需用户安装 Python 或 Microsoft Office。

## 一、本机前置环境（仅开发者编译需要，最终用户双击即用）

1. **Node.js 20+**（用于构建前端界面）
2. **Rust 工具链**（https://rustup.rs ，安装时选默认 MSVC 工具链）
3. **Visual Studio C++ 生成工具**（勾选 "使用 C++ 的桌面开发"）
4. Windows 10/11 默认已内置 **WebView2 Runtime**

## 二、准备静态导出与安装 Tauri CLI

1. 导出本项目源码到本地，并确保 `src-tauri/` 目录位于项目根目录。
2. 在项目根目录安装 Tauri 2 CLI 与前端插件：

```bash
npm install -D @tauri-apps/cli@^2
npm install @tauri-apps/api@^2 @tauri-apps/plugin-dialog@^2 @tauri-apps/plugin-opener@^2
```

3. 在 `package.json` 的 `"scripts"` 中加入桌面构建脚本：

```json
{
  "scripts": {
    "tauri": "tauri",
    "build:desktop": "cross-env TAURI_BUILD=1 next build"
  }
}
```

4. 在 `next.config.ts` 中为桌面打包开启静态导出（`TAURI_BUILD=1` 时导出到 `out/`）：

```ts
const isDesktopBuild = process.env.TAURI_BUILD === '1';

const nextConfig: NextConfig = {
  output: isDesktopBuild ? 'export' : 'standalone',
  images: isDesktopBuild ? { unoptimized: true } : { ... },
};
```

5. 生成应用图标（准备一张 1024x1024 PNG 即可自动生成全套 `.ico`/`.png`）：

```bash
npx tauri icon ./app-icon.png
```

## 三、开发调试与一键打包单文件 `.exe`

```bash
# 本地启动（同时拉起前端热重载 + Windows 11 Mica 桌面窗）
npm run tauri dev

# 正式编译打包（生成约 10~14 MB 单文件绿色版 + NSIS 中文安装包）
npm run tauri build
```

构建完成后产出位置：
- **单文件便携绿色版（直接拷贝即可运行）**：`src-tauri/target/release/chaoxing-downloader.exe`
- **中文一键安装包**：`src-tauri/target/release/bundle/nsis/学习通课程文件下载器_1.0.0_x64-setup.exe`

## 四、核心模块说明

| 文件 | 职责 |
| :--- | :--- |
| `src-tauri/Cargo.toml` | Rust 依赖与 Release 体积极致优化（`lto = true`, `opt-level = "s"`, `strip = true`） |
| `src-tauri/tauri.conf.json` | 1140×884 无边框透明窗、Windows 11 阴影、中文 NSIS 打包配置 |
| `src-tauri/src/lib.rs` | 开启 Windows 11 Mica / Win10 Acrylic、内置学习通扫码窗自动捕获 HttpOnly Cookie |
| `src-tauri/src/chaoxing.rs` | 学习通已选课程抓取、课程章节树解析、文档与图文幻灯片直链提取 |
| `src-tauri/src/downloader.rs` | Tokio 4 路并发下载、自动重试、合成前剔页过滤、Tauri Channel 实时进度推送 |
| `src-tauri/src/synth_pdf.rs` | 纯 Rust (`lopdf` + `image`) 无 Office 合成章节 PDF 并合并原生 PDF 讲义 |
| `src-tauri/src/synth_pptx.rs` | 纯 Rust (`zip` + `image`) 无 Office 生成标准 16:9 OpenXML `.pptx` |
| `lib/tauri-bridge.ts` | 前端 TypeScript 与 Rust 命令的安全桥接层 |
