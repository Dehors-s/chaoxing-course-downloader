'use client';

import React from 'react';
import {
  CheckCircle2,
  Cpu,
  FileOutput,
  Layers,
  Package,
  QrCode,
  Sparkles,
} from 'lucide-react';

interface StackRow {
  stack: string;
  recommended?: boolean;
  bundleSize: string;
  ramUsage: string;
  coldStart: string;
  uiCeiling: string;
  officeFreeSynth: string;
  verdict: string;
}

const STACK_COMPARISON: StackRow[] = [
  {
    stack: 'Tauri 2 (Rust + WebView2 + React)',
    recommended: true,
    bundleSize: '10 ~ 14 MB（单文件便携 exe）',
    ramUsage: '40 ~ 65 MB',
    coldStart: '< 350 ms',
    uiCeiling: '极高：原生 Win11 Mica 玻璃、GPU 120fps 弹簧动效、任意设计系统',
    officeFreeSynth: '纯 Rust（lopdf / printpdf + OOXML zip 生成 PPTX），零 Python 依赖',
    verdict: '首选方案：兼顾现代顶级界面质感与十兆级轻量化分发',
  },
  {
    stack: 'PySide6 / Qt6 (QML + Fluent)',
    bundleSize: '52 ~ 78 MB（PyInstaller 打包）',
    ramUsage: '75 ~ 110 MB',
    coldStart: '1.1 ~ 1.8 s',
    uiCeiling: '高：支持 Fluent 样式与硬件加速，但精细动效与图文排版成本高于 Web',
    officeFreeSynth: '直接复用 PyMuPDF + python-pptx 生态，无需重写后端逻辑',
    verdict: '若后端已完全写好 Python 且不愿引入 Rust，次优平滑升级路线',
  },
  {
    stack: 'Electron (Chromium + Node)',
    bundleSize: '125 ~ 165 MB',
    ramUsage: '190 ~ 280 MB',
    coldStart: '1.2 ~ 2.0 s',
    uiCeiling: '极高：与 Tauri 前端表现力一致',
    officeFreeSynth: 'pdf-lib / pptxgenjs（纯 JS），或打包 sidecar',
    verdict: '对学生群体“临时备份小工具”而言包体过重、内存偏高',
  },
  {
    stack: 'Python tkinter 8.6 (Canvas 手绘)',
    bundleSize: '18 ~ 28 MB（含 PyMuPDF）',
    ramUsage: '30 ~ 45 MB',
    coldStart: '0.7 ~ 1.2 s',
    uiCeiling: '受限：无透明度/毛玻璃/阴影模糊，16ms CPU 手绘且长列表需虚拟化',
    officeFreeSynth: 'PyMuPDF + python-pptx 原生直连',
    verdict: '极简工具可用，但视觉精致度与交互上限被底层 Tk 锁死',
  },
];

const UX_BREAKTHROUGHS = [
  {
    number: '01',
    icon: QrCode,
    title: '彻底消灭「F12 复制 Cookie」',
    before: 'Tkinter 方案必须指导学生打开浏览器开发者工具、找接口、复制整段 Cookie，80% 新手在这一步流失。',
    after: 'Tauri 2 内置独立 WebView2 登录窗，学生用手机学习通扫一扫即可自动接管内存会话，并直接拉取全部已选课程书架。',
  },
  {
    number: '02',
    icon: Layers,
    title: '合成前可视化缩略图「剔页」',
    before: '传统下载器盲下盲合，把“课堂签到二维码”“下课提示页”“重复过渡页”全塞进最终复习 PDF。',
    after: '借助 GPU 图像解码与侧滑抽屉，下载合成前可预览图文幻灯片网格，一键剔除垃圾页再按章输出。',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Windows 11 原生 Mica 玻璃材质与双主题',
    before: 'Tkinter 无 alpha 与 backdrop-filter，只能用硬边框和阶梯灰线硬凑层次。',
    after: '通过 window-vibrancy 调用系统 DWM 原生 Mica/Acrylic，左侧书架通透折射桌面壁纸，自动跟随 Windows 深浅模式。',
  },
  {
    number: '04',
    icon: Cpu,
    title: 'Tokio 异步高并发 + 悬浮毛玻璃操作岛',
    before: 'Python 多线程受 GIL 与 Tk 主线程通信限制，高频刷新进度条容易拖慢 UI 响应。',
    after: 'Rust Tokio 异步连接池跑满校园网带宽，通过 Tauri Channel 节流推送给 GPU 合成进度条与底部悬浮操作岛。',
  },
  {
    number: '05',
    icon: FileOutput,
    title: '单文件 12MB，真正「免 Office、免运行库」',
    before: '打包 Python 环境容易触发杀软误报，且多依赖体积膨胀。',
    after: 'Rust 编译为单一原生 PE 可执行文件，使用 printpdf/lopdf 与标准 OOXML 模板直接写入 PDF 与 PPTX，双击即用。',
  },
];

export function TechArchitectureView() {
  return (
    <div className="space-y-8">
      {/* 1. 技术栈决策矩阵 */}
      <section>
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold text-[#0F172A]">
            01. 不限技术栈的独立打包选型对比
          </h2>
          <p className="text-[13px] text-[#475569] mt-0.5">
            目标约束：Windows 独立便携应用、开箱即用免安装 Office、追求现代顶级桌面美学。
          </p>
        </div>

        <div className="bg-white rounded-[10px] border border-[#DCE2EC] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#DCE2EC] text-[12px] font-semibold text-[#475569]">
                  <th className="py-3 px-4 w-[220px]">方案与技术栈</th>
                  <th className="py-3 px-4 w-[150px]">独立包体</th>
                  <th className="py-3 px-4 w-[110px]">常驻内存</th>
                  <th className="py-3 px-4 w-[100px]">冷启动</th>
                  <th className="py-3 px-4">视觉上限与免 Office 合成能力</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EDF4] text-[12.5px]">
                {STACK_COMPARISON.map((row) => (
                  <tr
                    key={row.stack}
                    className={`align-top ${row.recommended ? 'bg-[#F5F9FF]' : 'hover:bg-[#F8FAFC]'}`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                        {row.recommended && <CheckCircle2 className="h-4 w-4 text-[#2563EB] shrink-0" />}
                        <span>{row.stack}</span>
                      </div>
                      <div className="mt-1 text-[11.5px] text-[#475569]">{row.verdict}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-[12px] text-[#0F172A]">
                      {row.bundleSize}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-[12px] text-[#475569]">
                      {row.ramUsage}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-[12px] text-[#475569]">
                      {row.coldStart}
                    </td>
                    <td className="py-3.5 px-4 space-y-1">
                      <div className="text-[#0F172A]">{row.uiCeiling}</div>
                      <div className="text-[12px] text-[#64748B]">合成引擎：{row.officeFreeSynth}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 2. 解除约束后的 5 大产品与设计质变 */}
      <section>
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold text-[#0F172A]">
            02. 相比 Tkinter 8.6 解锁的 5 项核心体验跃迁
          </h2>
          <p className="text-[13px] text-[#475569] mt-0.5">
            更精美的设计不只是“加毛玻璃和阴影”，而是把技术红利直接转化为减少学生操作步骤的工作流升级。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {UX_BREAKTHROUGHS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.number}
                className="bg-white rounded-[10px] border border-[#DCE2EC] p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[12px] font-semibold text-[#2563EB]">
                      {item.number}
                    </span>
                    <Icon className="h-4 w-4 text-[#475569]" />
                  </div>
                  <h3 className="text-[14.5px] font-semibold text-[#0F172A]">{item.title}</h3>
                  <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed">
                    <p className="text-[#64748B]">
                      <strong className="text-[#475569] font-medium">旧痛点：</strong>
                      {item.before}
                    </p>
                    <p className="text-[#0F172A]">
                      <strong className="text-[#15803D] font-medium">新方案：</strong>
                      {item.after}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 单文件独立交付架构蓝图 */}
      <section className="bg-white rounded-[10px] border border-[#DCE2EC] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package className="h-4.5 w-4.5 text-[#2563EB]" />
          <h2 className="text-[16px] font-semibold text-[#0F172A]">
            03. 推荐工程落地架构（单文件免安装交付）
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-[12.5px]">
          <div className="rounded-[8px] bg-[#F8FAFC] border border-[#E8EDF4] p-4 space-y-2">
            <div className="font-semibold text-[#0F172A]">表现层：React + Tailwind + Motion</div>
            <p className="text-[#475569] leading-relaxed">
              运行在 Windows 系统自带 WebView2（Edge Chromium）中，零额外浏览器体积。调用 Tauri <code className="font-mono text-[11.5px] text-[#2563EB]">window-vibrancy</code> 开启系统级 Mica，前端通过 <code className="font-mono text-[11.5px]">invoke()</code> 与 Rust 通信。
            </p>
          </div>
          <div className="rounded-[8px] bg-[#F8FAFC] border border-[#E8EDF4] p-4 space-y-2">
            <div className="font-semibold text-[#0F172A]">内核层：Rust + Tokio + Reqwest</div>
            <p className="text-[#475569] leading-relaxed">
              接管学习通扫码登录窗的 Cookie Jar（仅存内存/系统凭据库，绝不写明文日志），并发拉取课程章节树、图文幻灯片原图与附件流，支持断网自动重试与限速保护。
            </p>
          </div>
          <div className="rounded-[8px] bg-[#F8FAFC] border border-[#E8EDF4] p-4 space-y-2">
            <div className="font-semibold text-[#0F172A]">合成层：纯原生 PDF / PPTX 构建</div>
            <p className="text-[#475569] leading-relaxed">
              使用 Rust <code className="font-mono text-[11.5px]">lopdf</code> + <code className="font-mono text-[11.5px]">image</code> 直接封装图文页与原 PDF 书签；PPTX 本质是标准 ZIP+XML，用最小化 OOXML 模板直接写入每页高清图片，完全摆脱 Office 与 Python 体积负担。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
