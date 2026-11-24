'use client';

import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { NextGenPrototype } from '@/components/nextgen-prototype';
import { TechArchitectureView } from '@/components/tech-architecture-view';
import { DesktopPrototype } from '@/components/desktop-prototype';
import { TkSpecView } from '@/components/tk-spec-view';
import { TkCodeView } from '@/components/tk-code-view';

type ActiveTab = 'nextgen' | 'architecture' | 'tk-prototype' | 'tk-reference';

export function WorkbenchShell() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('nextgen');
  const [tkSubTab, setTkSubTab] = useState<'spec' | 'code'>('spec');

  const isTkTab = activeTab === 'tk-prototype' || activeTab === 'tk-reference';

  return (
    <div className="min-h-screen flex flex-col bg-[#EEF1F6] text-[#0F172A]">
      {/* 严格遵循 3-Zone Top Bar Contract：单行品牌名 — 4 个单行导航 — 1 个主动作按钮 */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#DCE2EC]">
        <div className="max-w-[1380px] mx-auto px-6 h-[56px] flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('nextgen')}
            className="text-[15.5px] font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer"
          >
            学习通下载器 · 桌面设计台
          </button>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav className="flex items-center gap-6 text-[13.5px] font-medium">
            {(
              [
                ['nextgen', '新一代 Mica 方案'],
                ['architecture', '不限栈架构选型'],
                ['tk-prototype', 'Tkinter 8.6 原型'],
                ['tk-reference', 'Tk 降级规范与源码'],
              ] as const
            ).map(([key, label]) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`relative py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    isActive ? 'text-[#2563EB] font-semibold' : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 right-0 -bottom-[17px] h-[2px] bg-[#2563EB]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab(isTkTab ? 'nextgen' : 'tk-prototype')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-medium text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-[7px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {isTkTab ? '切换至 Mica 新方案' : '对比 Tk8.6 原型'}
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-6">
        <div className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#0F172A] [text-wrap:balance]">
              {activeTab === 'nextgen'
                ? '不限技术栈：Tauri 2 + Windows 11 Mica 独立桌面方案'
                : activeTab === 'architecture'
                  ? '独立打包技术栈对比与免 Office 工程架构'
                  : activeTab === 'tk-prototype'
                    ? 'Python tkinter 8.6 强约束版 · 1140×884 交互原型'
                    : 'Python tkinter 8.6 降级规范、沙盒与源码'}
            </h1>
            <p className="text-[13px] text-[#475569] mt-1">
              {activeTab === 'nextgen' ? (
                <>
                  <span>Tauri 2 (Rust + WebView2)</span>
                  <span aria-hidden="true" className="mx-2 text-[#94A3B8]">·</span>
                  <span>单文件约 10–14 MB，免安装 Office</span>
                  <span aria-hidden="true" className="mx-2 text-[#94A3B8]">·</span>
                  <span>内置扫码免抄 Cookie + 合成前可视化剔页</span>
                </>
              ) : activeTab === 'architecture' ? (
                <>
                  <span>Tauri 2 vs PySide6 vs Electron vs Tkinter 8.6</span>
                  <span aria-hidden="true" className="mx-2 text-[#94A3B8]">·</span>
                  <span>兼顾 10MB 轻量化单文件分发与现代顶级桌面质感</span>
                </>
              ) : (
                <>
                  <span>1140×884 逻辑像素（125% DPI 约 1425×1105）</span>
                  <span aria-hidden="true" className="mx-2 text-[#94A3B8]">·</span>
                  <span>零 opacity / 零模糊阴影 / 16ms 十六进制插值</span>
                </>
              )}
            </p>
          </div>

          <div className="text-[12px] text-[#64748B] whitespace-nowrap">
            {activeTab === 'nextgen'
              ? '可直接切换课程、演示扫码直连、点击图文页剔除冗余页并一键合成'
              : activeTab === 'architecture'
                ? '涵盖包体、内存、冷启动、无 Office 合成链路与 5 项体验跃迁'
                : '保留完整 Python tkinter 8.6 Canvas 约束设计与源码'}
          </div>
        </div>

        {activeTab === 'nextgen' && <NextGenPrototype />}
        {activeTab === 'architecture' && <TechArchitectureView />}
        {activeTab === 'tk-prototype' && <DesktopPrototype />}
        {activeTab === 'tk-reference' && (
          <div className="space-y-6">
            <div className="inline-flex items-center gap-1 p-1 bg-[#E2E8F0] rounded-[8px]">
              <button
                type="button"
                onClick={() => setTkSubTab('spec')}
                className={`px-3.5 py-1.5 text-[12.5px] font-medium rounded-[6px] cursor-pointer whitespace-nowrap ${
                  tkSubTab === 'spec'
                    ? 'bg-white text-[#0F172A]'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                Canvas 动效沙盒与降级对照表
              </button>
              <button
                type="button"
                onClick={() => setTkSubTab('code')}
                className={`px-3.5 py-1.5 text-[12.5px] font-medium rounded-[6px] cursor-pointer whitespace-nowrap ${
                  tkSubTab === 'code'
                    ? 'bg-white text-[#0F172A]'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                1140×884 坐标与 Python 源码
              </button>
            </div>
            {tkSubTab === 'spec' ? <TkSpecView /> : <TkCodeView />}
          </div>
        )}
      </main>

      <footer className="border-t border-[#DCE2EC] bg-white mt-8">
        <div className="max-w-[1380px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#64748B]">
          <span>学习通课程文件下载器 · 新一代独立桌面方案（Tauri 2）与 Tkinter 8.6 双版本对照</span>
          <span>无需安装 Office · 本地合成 PDF / PPTX</span>
        </div>
      </footer>
    </div>
  );
}
