'use client';

import React, { useState } from 'react';
import { Check, Copy, Maximize2, Monitor } from 'lucide-react';
import { PYTHON_CODE_SNIPPETS } from '@/lib/tk-math';

export function TkCodeView() {
  const [activeKey, setActiveKey] = useState<string>('widgets');
  const [dpiScale, setDpiScale] = useState<1 | 1.25 | 1.5>(1.25);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const snippet = PYTHON_CODE_SNIPPETS[activeKey];

  const handleCopy = () => {
    navigator.clipboard?.writeText(snippet.code);
    setCopiedKey(activeKey);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const s = (n: number) => Math.round(n * dpiScale);

  return (
    <div className="space-y-8">
      {/* 1. 1140x884 布局坐标系与 HiDPI 换算表 */}
      <section className="bg-white rounded-[10px] border border-[#DCE2EC] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E8EDF4]">
          <div>
            <h2 className="text-[17px] font-semibold text-[#0F172A]">
              01. 1140×884 窗口几何拓扑与 Windows DPI 物理像素换算
            </h2>
            <p className="text-[12.5px] text-[#475569] mt-0.5">
              左侧配置栏定宽保证表单不换行变形，右侧章节清单与总进度栏随窗口宽度弹性伸缩（minsize 960×720）。
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#E9EEF5] rounded-[8px]">
            {([1, 1.25, 1.5] as const).map((factor) => (
              <button
                key={factor}
                type="button"
                onClick={() => setDpiScale(factor)}
                className={`px-3 py-1 text-[12px] font-mono font-medium rounded-[6px] cursor-pointer whitespace-nowrap ${
                  dpiScale === factor
                    ? 'bg-white text-[#0F172A]'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {Math.round(factor * 100)}% DPI
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* 几何蓝图示意 */}
          <div className="lg:col-span-7 bg-[#F3F5F8] rounded-[8px] border border-[#DCE2EC] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[12px] font-mono text-[#475569] mb-2">
              <span className="inline-flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5 text-[#2563EB]" />
                逻辑窗口: 1140 × 884 px
              </span>
              <span className="font-semibold text-[#0F172A] tabular-nums">
                物理像素 ({Math.round(dpiScale * 100)}%): {s(1140)} × {s(884)} px
              </span>
            </div>

            {/* 蓝图矩形结构 */}
            <div className="border border-[#94A3B8] rounded-[6px] bg-white overflow-hidden font-mono text-[11px]">
              {/* Title bar */}
              <div className="h-[26px] bg-[#EAEFF5] border-b border-[#CBD5E1] px-3 flex items-center justify-between text-[#475569]">
                <span>Windows 原生标题栏（高度 {s(34)}px）</span>
                <span>不自绘，保留系统缩放热区</span>
              </div>

              {/* Body */}
              <div className="p-3 bg-[#F3F5F8] grid grid-cols-12 gap-2.5 min-h-[260px]">
                {/* Left fixed rail */}
                <div className="col-span-4 flex flex-col gap-2">
                  <div className="flex-1 bg-white border border-[#2563EB] rounded-[5px] p-2.5">
                    <div className="text-[#2563EB] font-semibold">左栏 A：课程接入</div>
                    <div className="text-[#64748B] mt-1">
                      定宽 {s(340)}px · 高 {s(306)}px
                    </div>
                    <div className="text-[#64748B]">链接 + Cookie + 解析按钮</div>
                  </div>
                  <div className="flex-1 bg-white border border-[#CBD5E1] rounded-[5px] p-2.5">
                    <div className="text-[#0F172A] font-semibold">左栏 B：合成策略</div>
                    <div className="text-[#64748B] mt-1">
                      定宽 {s(340)}px · 高 {s(358)}px
                    </div>
                    <div className="text-[#64748B]">PDF/PPTX 分段 + 画质 + 目录</div>
                  </div>
                  <div className="bg-[#EFF5FF] border border-[#BFDBFE] rounded-[5px] p-2">
                    <div className="text-[#1D4ED8] font-semibold">左栏 C：主行动底座</div>
                    <div className="text-[#475569]">高 {s(126)}px · 统计 + 批量下载 CTA</div>
                  </div>
                </div>

                {/* Right fluid stage */}
                <div className="col-span-8 flex flex-col gap-2">
                  <div className="bg-white border border-[#CBD5E1] rounded-[5px] p-2.5">
                    <div className="text-[#0F172A] font-semibold">
                      右栏顶部：课程概览 + 类型筛选 + 全选控制
                    </div>
                    <div className="text-[#64748B] mt-0.5">
                      弹性宽 max(W - {s(388)}px) · 当前 {s(752)}px · 高 {s(98)}px
                    </div>
                  </div>
                  <div className="flex-1 bg-white border border-[#0D9488] rounded-[5px] p-2.5 flex flex-col justify-between">
                    <div>
                      <div className="text-[#0F766E] font-semibold">
                        右栏中部：单 Canvas 虚拟滚动章节文件树
                      </div>
                      <div className="text-[#64748B] mt-1">
                        行高 {s(40)}px · 仅绘制可见 14~18 行 · 避免创建子 Widget
                      </div>
                    </div>
                    <div className="text-[#475569] border-t border-[#E8EDF4] pt-1.5 mt-2">
                      高度随窗口 H 自动拉伸：H - {s(284)}px（当前约 {s(600)}px）
                    </div>
                  </div>
                  <div className="bg-white border border-[#CBD5E1] rounded-[5px] p-2.5">
                    <div className="text-[#0F172A] font-semibold">
                      右栏底部：总进度条 + 速率 ETA + 可展开日志抽屉
                    </div>
                    <div className="text-[#64748B]">高 {s(94)}px（展开日志 +{s(140)}px）</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 关键坐标尺寸规范表 */}
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div className="border border-[#E8EDF4] rounded-[8px] overflow-hidden">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E8EDF4] text-[#475569]">
                    <th className="py-2.5 px-3.5 font-semibold">布局约束项</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">逻辑 px</th>
                    <th className="py-2.5 px-3.5 font-semibold text-right">
                      {Math.round(dpiScale * 100)}% 实绘
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EDF4] font-mono tabular-nums">
                  {[
                    ['窗口默认尺寸', '1140 × 884', `${s(1140)} × ${s(884)}`],
                    ['最小缩放限制', '960 × 720', `${s(960)} × ${s(720)}`],
                    ['窗口外边距 / 栏间距', '16 / 16', `${s(16)} / ${s(16)}`],
                    ['左栏配置区宽度（固定）', '340', `${s(340)}`],
                    ['右栏主工作区宽度（弹性）', '752', `${s(752)}`],
                    ['卡片圆角 / 控件圆角', '10 / 7', `${s(10)} / ${s(7)}`],
                    ['文件清单行高', '40', `${s(40)}`],
                    ['主 CTA 按钮高度', '40', `${s(40)}`],
                    ['<Configure> 重排防抖', '40 ms', '40 ms'],
                  ].map(([label, logical, physical]) => (
                    <tr key={label}>
                      <td className="py-2 px-3.5 font-sans text-[#0F172A]">{label}</td>
                      <td className="py-2 px-3.5 text-right text-[#64748B]">{logical}</td>
                      <td className="py-2 px-3.5 text-right font-semibold text-[#2563EB]">
                        {physical}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 rounded-[8px] bg-[#F8FAFC] border border-[#DCE2EC] p-3 text-[12px] text-[#475569] leading-relaxed flex items-start gap-2">
              <Maximize2 className="h-4 w-4 text-[#2563EB] shrink-0 mt-0.5" />
              <span>
                <strong className="text-[#0F172A]">缩放策略：</strong>
                窗口拉伸时仅重新计算右侧虚拟列表 Canvas 宽度与高度，左栏组件坐标全程零变动，彻底杜绝表单抖动。
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 可复制 Python tkinter 8.6 模块代码 */}
      <section className="bg-white rounded-[10px] border border-[#DCE2EC] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[#DCE2EC] bg-[#F8FAFC]">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(PYTHON_CODE_SNIPPETS).map(([key, item]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveKey(key)}
                className={`px-3 py-1.5 text-[12px] font-mono rounded-[6px] cursor-pointer whitespace-nowrap transition-colors ${
                  activeKey === key
                    ? 'bg-[#0F172A] text-white font-medium'
                    : 'bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {item.filename}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-[6px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white cursor-pointer whitespace-nowrap"
          >
            {copiedKey === activeKey ? (
              <>
                <Check className="h-3.5 w-3.5" />
                已复制 {snippet.filename}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                复制模块源码
              </>
            )}
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[#E8EDF4] flex flex-wrap items-center justify-between gap-2 bg-white">
          <div className="text-[13.5px] font-semibold text-[#0F172A]">{snippet.title}</div>
          <div className="text-[12px] text-[#64748B]">{snippet.subtitle}</div>
        </div>

        <div className="bg-[#0F172A] text-[#E2E8F0] p-5 overflow-x-auto">
          <pre className="font-mono text-[12.5px] leading-[1.65] whitespace-pre">{snippet.code}</pre>
        </div>
      </section>
    </div>
  );
}
