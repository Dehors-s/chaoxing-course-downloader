# 学习通课程归档助手

把超星学习通已选课程的课件批量下载到本地，并在**完全离线、不装 Microsoft Office** 的前提下合成 PDF 或可编辑 PPTX。

Windows 桌面应用，Tauri 2（Rust + WebView2）+ Next.js 前端。单文件便携版约 7.7 MB。

---

## 功能

| 功能 | 说明 |
| :--- | :--- |
| 登录学习通 | 内置 WebView2 登录窗，扫码或账号密码登录，自动捕获会话 Cookie |
| 已选课程书架 | 一次拉取全部已选课程，左侧栏可搜索、可过滤「只看已加载课件的课程」 |
| 章节解析 | 按课程自动解析目录树，逐章读取图文幻灯片与文档附件 |
| 图文合成 PDF | 纯 Rust（`lopdf`）生成，图片原始字节直接嵌入，不二次压缩 |
| 图文合成 PPTX | 纯 Rust（`zip` + OpenXML）生成，PowerPoint / WPS / Keynote 可直接打开编辑 |
| 保留原文件 | Word / PPT / Excel / 压缩包等附件按原始格式保存，不做转换 |
| 合成前剔页 | 缩略图预览每一页，点击放大，勾掉签到页、休息页等冗余内容再合成 |
| 全选 / 取消全选 | 一键勾选或清空整门课程 |
| 断点友好 | 单页下载失败自动重试，不中断整章 |
| 会话保鲜 | Cookie 失效时给出明确提示，可直接重新登录 |

## 界面

主界面：左侧课程书架，中间章节与课件清单，底部悬浮操作岛。

合成前剔页抽屉从右侧滑出，按需加载真实页面缩略图，点击可全屏放大。

## 快速开始

### 直接使用

1. 从 [Releases](https://github.com/Dehors-s/chaoxing-course-downloader/releases) 下载 `学习通课程文件下载器.exe`（便携版，双击即用）或 `..._x64-setup.exe`（安装版）。
2. 打开后点左上角 **登录学习通**，在弹出的窗口里扫码或用账号密码登录。
3. 登录成功后左侧出现你的课程列表，点选一门课，章节自动加载。
4. 勾选需要的章节，点右下角 **下载并合成 PDF**（或切成 PPTX）。

> 首次启动需要几秒，是单文件 exe 解压运行时的正常现象。
>
> 系统需要 Windows 10/11 自带的 WebView2 Runtime（绝大多数机器已有）。

### 从源码构建

前置环境：

- Node.js 20+
- Rust 工具链（https://rustup.rs，默认 MSVC 目标）
- Visual Studio C++ 生成工具（勾选「使用 C++ 的桌面开发」）
- WebView2 Runtime

```bash
# 1. 安装前端依赖
npm install

# 2. 开发模式（前端热更新 + 桌面窗口）
npm run tauri dev

# 3. 正式打包
npm run tauri build
```

产物位置：

```
src-tauri/target/release/chaoxing-downloader.exe                              便携版
src-tauri/target/release/bundle/nsis/学习通课程文件下载器_1.0.0_x64-setup.exe  安装包
```

## 输出结构

每章一个文件夹，该章的成品与原始文档都放在里面：

```
D:\CourseBackup\
└── 遥感数字图像解译\
    ├── 第 1 章_课程背景\
    │   └── 第 1 章_课程背景.pdf
    ├── 第 2 章_课程概述\
    │   └── 第 2 章_课程概述.pdf
    └── 第 5 章_实验1.1\
        ├── 第 5 章_实验1.1.pdf
        └── 张静-《误差理论与测量平差》实践教程1.pdf
```

归档根目录可在界面左下角 **更改**。

## 架构

```
src-tauri/src/
├── lib.rs          命令注册、会话状态、内置登录窗与 Cookie 捕获
├── chaoxing.rs     抓取层：课程列表 / 章节目录 / 卡片附件解析
├── downloader.rs   并发下载、剔页过滤、进度事件、流水线编排
├── synth_pdf.rs    纯 Rust PDF 合成（图像 DCTDecode 直嵌）
├── synth_pptx.rs   纯 Rust OpenXML 生成
└── qrlogin.rs      扫码登录：取二维码、轮询状态、跟随跳转完成会话
```

前端关键文件：

```
app/page.tsx                     入口，只渲染应用窗口
components/nextgen-prototype.tsx 主界面（课程/章节/预览/进度）
lib/tauri-bridge.ts              前端与 Rust 的类型安全桥接
```

Rust 侧对外暴露的命令：

| 命令 | 作用 |
| :--- | :--- |
| `open_chaoxing_login` | 打开内置登录窗，登录后捕获 Cookie |
| `set_manual_cookie` | 手动写入 Cookie |
| `get_enrolled_courses` | 拉取已选课程列表 |
| `parse_course_chapters` | 解析某门课的章节目录与附件 |
| `start_batch_download` | 启动下载与合成流水线（Channel 推送进度） |
| `fetch_slide_thumb` | 取单页原图（data URL），供缩略图与放大预览 |

## 实现要点

几个踩过的坑，记下来避免重复踩：

- **图片后缀必须按魔数判定**。超星返回的是 JPEG，若按 `.png` 存盘，解码器会报 `Invalid PNG signature`，整条合成链路直接失败。
- **扫码登录要跟随服务端返回的 `url`**。`getauthstatus` 返回 `status=true` 时附带跳转地址，必须访问它才会下发 `UID` / `vc3` 等鉴权 Cookie；只拿到 `JSESSIONID` 是没用的。
- **scraper 的 `Html` 不是 `Send`**。解析必须在独立作用域内完成，跨 `.await` 持有会让 Tauri 命令编译失败。
- **抽取 id 要带课程前缀**。各课程的章节 id 都是 `ch-1`、`ch-2`，不加前缀会导致跨课程串图。
- **`serde(rename_all)` 只作用于枚举变体名**，不作用于变体内部字段，需要逐变体标注。

## 常见问题

**提示「Cookie 失效或未登录」？**
点「重新登录」重新走一次登录流程。

**解析出来 0 个章节？**
该课程在平台上可能只有讨论/作业，没有上传课件。界面上会显示「该课程暂无课件」。

**杀毒软件报毒？**
PyInstaller / 自解压类单文件程序常见误报。本项目的源码全部公开，可自行编译。

**下载到一半失败？**
单页有自动重试；整章失败会在状态栏提示。网络恢复后重新点下载即可，已下载的页面会走缓存。

## 声明

本项目仅用于备份本人已选课程的学习资料。请遵守所在学校与超星平台的使用规定，不要传播他人的课程内容。

## 许可

未指定许可证。如需二次分发请先联系作者。
