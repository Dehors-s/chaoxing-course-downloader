'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Play, RotateCcw } from 'lucide-react';
import {
  COLOR_TOKEN_SPECS,
  FALLBACK_MATRIX,
  TK_PALETTE,
  easeOutCubic,
  lerp,
  lerpHex,
} from '@/lib/tk-math';

/**
 * 用原生 HTML5 Canvas 精确复现 tkinter create_polygon(smooth=True) + after(16) 逐帧重绘，
 * 并实时输出当前帧的十六进制插值与坐标。
 */
function CanvasMotionSandbox() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [btnState, setBtnState] = useState<'normal' | 'hover' | 'press'>('normal');
  const [segIndex, setSegIndex] = useState<number>(0);
  const [progressTarget, setProgressTarget] = useState<number>(0.72);
  const [phase, setPhase] = useState<'download' | 'synth'>('download');
  const [toastTrigger, setToastTrigger] = useState<number>(0);

  const [telemetry, setTelemetry] = useState({
    btnHex: '#2563EB',
    thumbX: 28,
    barHex: '#2563EB',
    toastY: 270,
    frameMs: 16.6,
  });

  // 动画持久引用
  const animStateRef = useRef({
    btnHex: '#2563EB',
    btnStartHex: '#2563EB',
    btnTargetHex: '#2563EB',
    btnStartTs: 0,

    thumbX: 28,
    thumbStartX: 28,
    thumbTargetX: 28,
    thumbStartTs: 0,

    barPct: 0.72,
    barStartPct: 0.72,
    barTargetPct: 0.72,
    barHex: '#2563EB',
    barStartHex: '#2563EB',
    barTargetHex: '#2563EB',
    barStartTs: 0,

    toastY: 270,
    toastActiveUntil: 0,
    toastStartTs: 0,
  });

  useEffect(() => {
    const target =
      btnState === 'press'
        ? TK_PALETTE.accentPress
        : btnState === 'hover'
          ? TK_PALETTE.accentHover
          : TK_PALETTE.accent;
    const s = animStateRef.current;
    s.btnStartHex = s.btnHex;
    s.btnTargetHex = target;
    s.btnStartTs = performance.now();
  }, [btnState]);

  useEffect(() => {
    const s = animStateRef.current;
    s.thumbStartX = s.thumbX;
    s.thumbTargetX = 28 + segIndex * 98;
    s.thumbStartTs = performance.now();
  }, [segIndex]);

  useEffect(() => {
    const s = animStateRef.current;
    s.barStartPct = s.barPct;
    s.barTargetPct = progressTarget;
    s.barStartHex = s.barHex;
    s.barTargetHex = phase === 'synth' ? TK_PALETTE.synthFill : TK_PALETTE.accent;
    s.barStartTs = performance.now();
  }, [progressTarget, phase]);

  useEffect(() => {
    if (toastTrigger === 0) return;
    const s = animStateRef.current;
    const now = performance.now();
    s.toastStartTs = now;
    s.toastActiveUntil = now + 2200;
  }, [toastTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();

    const drawRoundRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      fill: string,
      stroke?: string
    ) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const render = (now: number) => {
      const dt = Math.max(8, Math.min(34, now - lastTs));
      lastTs = now;
      const s = animStateRef.current;

      // 1. 按钮色插值
      const tBtn = Math.min(1, (now - s.btnStartTs) / 140);
      s.btnHex = lerpHex(s.btnStartHex, s.btnTargetHex, easeOutCubic(tBtn));

      // 2. 分段滑块 X 坐标插值
      const tSeg = Math.min(1, (now - s.thumbStartTs) / 180);
      s.thumbX = lerp(s.thumbStartX, s.thumbTargetX, easeOutCubic(tSeg));

      // 3. 进度条宽度与阶段色插值
      const tBar = Math.min(1, (now - s.barStartTs) / 260);
      const eBar = easeOutCubic(tBar);
      s.barPct = lerp(s.barStartPct, s.barTargetPct, eBar);
      s.barHex = lerpHex(s.barStartHex, s.barTargetHex, eBar);

      // 4. Toast 纯 Y 轴滑入（无 alpha）
      if (now < s.toastActiveUntil) {
        const tIn = Math.min(1, (now - s.toastStartTs) / 190);
        s.toastY = lerp(268, 206, easeOutCubic(tIn));
      } else {
        const tOut = Math.min(1, (now - s.toastActiveUntil) / 180);
        s.toastY = lerp(206, 268, easeOutCubic(tOut));
      }

      const dpr = window.devicePixelRatio || 1;
      const logicalW = 620;
      const logicalH = 260;
      if (canvas.width !== logicalW * dpr || canvas.height !== logicalH * dpr) {
        canvas.width = logicalW * dpr;
        canvas.height = logicalH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 窗口底色
      ctx.fillStyle = TK_PALETTE.windowBg;
      ctx.fillRect(0, 0, logicalW, logicalH);

      // 阶梯卡片背板（降级阴影）
      drawRoundRect(16, 17, 588, 228, 10, TK_PALETTE.cardShadowStep1);
      drawRoundRect(16, 16, 588, 228, 10, TK_PALETTE.cardBg, TK_PALETTE.cardBorder);

      // 分区小标
      ctx.fillStyle = TK_PALETTE.textMuted;
      ctx.font = '500 11px "Microsoft YaHei UI", sans-serif';
      ctx.fillText('1. 分段选择器（180ms X 坐标插值）', 28, 38);
      ctx.fillText('2. 圆角主按钮（140ms lerp_hex）', 356, 38);

      // 分段选择器轨道 + 滑块
      drawRoundRect(25, 48, 300, 36, 8, TK_PALETTE.segTrackBg);
      drawRoundRect(s.thumbX, 51, 98, 30, 6, TK_PALETTE.segThumbBg, TK_PALETTE.segThumbBorder);
      const segLabels = ['合成 PDF', '合成 PPTX', '保留原文件'];
      segLabels.forEach((lbl, idx) => {
        const cx = 28 + idx * 98 + 49;
        ctx.fillStyle = idx === segIndex ? TK_PALETTE.textPrimary : TK_PALETTE.textSecondary;
        ctx.font = `${idx === segIndex ? '600' : '400'} 12px "Microsoft YaHei UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(lbl, cx, 70);
      });
      ctx.textAlign = 'left';

      // 自绘圆角按钮
      drawRoundRect(356, 48, 228, 36, 8, s.btnHex);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 12.5px "Microsoft YaHei UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('开始批量下载并合成 (60fps)', 356 + 114, 70);
      ctx.textAlign = 'left';

      // 3. 进度条（下载钴蓝 -> 合成青绿）
      ctx.fillStyle = TK_PALETTE.textMuted;
      ctx.font = '500 11px "Microsoft YaHei UI", sans-serif';
      ctx.fillText(
        `3. 双阶段实色进度条（当前阶段：${phase === 'synth' ? '本地合成 PDF' : '并发下载文件'} · ${Math.round(
          s.barPct * 100
        )}%）`,
        28,
        118
      );
      drawRoundRect(28, 130, 556, 10, 5, '#E2E8F0');
      drawRoundRect(28, 130, Math.max(12, 556 * s.barPct), 10, 5, s.barHex);

      // 4. 实色状态标签行（零透明度）
      ctx.fillStyle = TK_PALETTE.textMuted;
      ctx.fillText('4. 预混合实色状态胶囊（零 rgba，色+文双编码）', 28, 174);
      const capsules = [
        { x: 28, w: 96, text: 'Cookie 有效', bg: TK_PALETTE.successBg, bd: TK_PALETTE.successBorder, fg: TK_PALETTE.successText },
        { x: 134, w: 108, text: '正在合成 PDF', bg: TK_PALETTE.synthBg, bd: TK_PALETTE.synthBorder, fg: TK_PALETTE.synthText },
        { x: 252, w: 112, text: 'Cookie 即将失效', bg: TK_PALETTE.warningBg, bd: TK_PALETTE.warningBorder, fg: TK_PALETTE.warningText },
        { x: 374, w: 102, text: '超时 · 点击重试', bg: TK_PALETTE.errorBg, bd: TK_PALETTE.errorBorder, fg: TK_PALETTE.errorText },
      ];
      capsules.forEach((cap) => {
        drawRoundRect(cap.x, 184, cap.w, 24, 5, cap.bg, cap.bd);
        ctx.fillStyle = cap.fg;
        ctx.font = '500 11.5px "Microsoft YaHei UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cap.text, cap.x + cap.w / 2, 200);
      });
      ctx.textAlign = 'left';

      // 5. 纯 Y 轴位移滑入 Toast（无透明度渐变）
      if (s.toastY < 264) {
        drawRoundRect(344, s.toastY + 1, 244, 42, 8, '#CBD5E1');
        drawRoundRect(344, s.toastY, 244, 42, 8, TK_PALETTE.successBg, '#86EFAC');
        ctx.fillStyle = TK_PALETTE.successText;
        ctx.font = '600 12px "Microsoft YaHei UI", sans-serif';
        ctx.fillText('已完成：第 1 章合成 PDF', 358, s.toastY + 18);
        ctx.fillStyle = TK_PALETTE.textSecondary;
        ctx.font = '400 11px "Microsoft YaHei UI", sans-serif';
        ctx.fillText('纯 Y 位移滑入，零 opacity 开销', 358, s.toastY + 34);
      }

      const nextBtnHex = s.btnHex;
      const nextThumbX = Math.round(s.thumbX);
      const nextBarHex = s.barHex;
      const nextToastY = Math.round(s.toastY);

      if (
        lastTelemetry.btnHex !== nextBtnHex ||
        lastTelemetry.thumbX !== nextThumbX ||
        lastTelemetry.barHex !== nextBarHex ||
        lastTelemetry.toastY !== nextToastY
      ) {
        lastTelemetry.btnHex = nextBtnHex;
        lastTelemetry.thumbX = nextThumbX;
        lastTelemetry.barHex = nextBarHex;
        lastTelemetry.toastY = nextToastY;
        setTelemetry({
          btnHex: nextBtnHex,
          thumbX: nextThumbX,
          barHex: nextBarHex,
          toastY: nextToastY,
          frameMs: Number(dt.toFixed(1)),
        });
      }

      rafId = requestAnimationFrame(render);
    };

    const lastTelemetry = {
      btnHex: '',
      thumbX: -1,
      barHex: '',
      toastY: -1,
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [segIndex, phase]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-8 bg-white rounded-[10px] border border-[#DCE2EC] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0F172A]">
              真实 Canvas 60fps 动效与插值沙盒
            </h3>
            <p className="text-[12.5px] text-[#64748B] mt-0.5">
              下方画布完全用 2D Canvas 逐帧重绘，与 Python tkinter 8.6 约束 1:1 等价
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-mono tabular-nums text-[#475569]">
            <span>帧间隔 {telemetry.frameMs}ms</span>
            <span aria-hidden="true">·</span>
            <span>零 alpha</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <canvas
            ref={canvasRef}
            className="w-full max-w-[620px] h-[260px] rounded-[8px] border border-[#DCE2EC] block"
          />
        </div>

        {/* 触发沙盒交互的控制条 */}
        <div className="mt-4 pt-4 border-t border-[#E8EDF4] flex flex-wrap items-center gap-2.5">
          <span className="text-[12px] font-medium text-[#475569] mr-1">触发控件测试：</span>
          <button
            type="button"
            onClick={() => setSegIndex((i) => (i + 1) % 3)}
            className="px-3 py-1.5 text-[12px] font-medium rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            切换分段滑块
          </button>
          <button
            type="button"
            onMouseEnter={() => setBtnState('hover')}
            onMouseLeave={() => setBtnState('normal')}
            onMouseDown={() => setBtnState('press')}
            onMouseUp={() => setBtnState('hover')}
            className="px-3 py-1.5 text-[12px] font-medium rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            悬停/按压按钮测 lerp_hex
          </button>
          <button
            type="button"
            onClick={() => {
              const nextPhase = phase === 'download' ? 'synth' : 'download';
              setPhase(nextPhase);
              setProgressTarget(nextPhase === 'synth' ? 0.94 : 0.42);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 text-[#2563EB]" />
            切换下载/合成阶段
          </button>
          <button
            type="button"
            onClick={() => setToastTrigger((c) => c + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-[6px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            触发 Y 轴滑入 Toast
          </button>
        </div>
      </div>

      {/* 右侧实时插值读数表 */}
      <div className="lg:col-span-4 bg-white rounded-[10px] border border-[#DCE2EC] p-5">
        <h4 className="text-[14px] font-semibold text-[#0F172A]">逐帧参数读数（等价 after(16)）</h4>
        <p className="text-[12px] text-[#64748B] mt-1">
          交互时观察纯十六进制 RGB 线性插值与整型坐标变化
        </p>

        <dl className="mt-4 divide-y divide-[#E8EDF4] text-[12.5px]">
          <div className="py-2.5 flex items-center justify-between gap-2">
            <dt className="text-[#475569]">按钮填充色 fill</dt>
            <dd className="flex items-center gap-2 font-mono tabular-nums font-medium text-[#0F172A]">
              <span
                className="inline-block h-3.5 w-3.5 rounded-[3px] border border-[#CBD5E1]"
                style={{ backgroundColor: telemetry.btnHex }}
              />
              {telemetry.btnHex}
            </dd>
          </div>
          <div className="py-2.5 flex items-center justify-between gap-2">
            <dt className="text-[#475569]">滑块坐标 thumb_x</dt>
            <dd className="font-mono tabular-nums font-medium text-[#0F172A]">
              {telemetry.thumbX} px
            </dd>
          </div>
          <div className="py-2.5 flex items-center justify-between gap-2">
            <dt className="text-[#475569]">进度条相位色</dt>
            <dd className="flex items-center gap-2 font-mono tabular-nums font-medium text-[#0F172A]">
              <span
                className="inline-block h-3.5 w-3.5 rounded-[3px] border border-[#CBD5E1]"
                style={{ backgroundColor: telemetry.barHex }}
              />
              {telemetry.barHex}
            </dd>
          </div>
          <div className="py-2.5 flex items-center justify-between gap-2">
            <dt className="text-[#475569]">Toast 纵坐标 y</dt>
            <dd className="font-mono tabular-nums font-medium text-[#0F172A]">
              {telemetry.toastY} px
            </dd>
          </div>
          <div className="py-2.5 flex items-center justify-between gap-2">
            <dt className="text-[#475569]">Opacity 通道</dt>
            <dd className="font-mono text-[#15803D] font-medium">未使用 (100% 实色)</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function TkSpecView() {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'surface' | 'text' | 'accent' | 'semantic'>('all');

  const handleCopy = (hex: string) => {
    navigator.clipboard?.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1400);
  };

  const filteredTokens =
    categoryFilter === 'all'
      ? COLOR_TOKEN_SPECS
      : COLOR_TOKEN_SPECS.filter((t) => t.category === categoryFilter);

  return (
    <div className="space-y-8">
      {/* 1. 实时 Canvas 沙盒 */}
      <section>
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold text-[#0F172A]">
            01. Tkinter 8.6 Canvas 动效与手绘约束验证
          </h2>
          <p className="text-[13px] text-[#475569] mt-0.5">
            所有交互反馈均在 200ms 内完成：颜色只做 RGB 十六进制插值，层级只做双层实色描边，提示只做位移滑入。
          </p>
        </div>
        <CanvasMotionSandbox />
      </section>

      {/* 2. 必须降级实现对照表 */}
      <section>
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold text-[#0F172A]">
            02. Web 视觉效果 → Tkinter 8.6 降级实现对照表
          </h2>
          <p className="text-[13px] text-[#475569] mt-0.5">
            明确标注全部无法直接实现或存在 Windows GDI 性能隐患的特性及可落地替代方案。
          </p>
        </div>

        <div className="bg-white rounded-[10px] border border-[#DCE2EC] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#DCE2EC] text-[12px] font-semibold text-[#475569]">
                  <th className="py-3 px-4 w-[150px]">设计模块</th>
                  <th className="py-3 px-4 w-[100px]">处理分级</th>
                  <th className="py-3 px-4 w-[240px]">受限的 Web 写法</th>
                  <th className="py-3 px-4">Tkinter 8.6 可落地降级方案与工程细节</th>
                  <th className="py-3 px-4 w-[110px] text-right">CPU 开销</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EDF4] text-[12.5px]">
                {FALLBACK_MATRIX.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8FAFC] align-top">
                    <td className="py-3.5 px-4 font-semibold text-[#0F172A]">{item.area}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[11.5px] font-medium px-2 py-0.5 rounded-[4px] border whitespace-nowrap ${
                          item.severity === '必须降级'
                            ? 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]'
                            : item.severity === '性能保护'
                              ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
                              : 'bg-[#EFF5FF] text-[#1D4ED8] border-[#BFDBFE]'
                        }`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11.5px] text-[#64748B]">
                      {item.webFeature}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#0F172A]">{item.tkFallback}</div>
                      <p className="mt-1 text-[12px] text-[#475569] leading-relaxed">
                        {item.implementationNote}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[12px] text-[#475569] whitespace-nowrap">
                      {item.cpuCost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. 预混合实色令牌库 */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
          <div>
            <h2 className="text-[18px] font-semibold text-[#0F172A]">
              03. 60-30-10 预混合实色令牌表（零 Alpha）
            </h2>
            <p className="text-[13px] text-[#475569] mt-0.5">
              全部半透明浅色均已按白底 #FFFFFF 预混合为精确十六进制色值，点击任意色块即可复制。
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#E2E8F0] rounded-[8px]">
            {(
              [
                ['all', '全部'],
                ['surface', '画布与层级'],
                ['text', '字体阶梯'],
                ['accent', '主强调色'],
                ['semantic', '语义状态'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(key)}
                className={`px-3 py-1 text-[12px] font-medium rounded-[6px] cursor-pointer whitespace-nowrap transition-colors ${
                  categoryFilter === key
                    ? 'bg-white text-[#0F172A]'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {filteredTokens.map((token) => (
            <button
              key={token.name}
              type="button"
              onClick={() => handleCopy(token.hex)}
              className="group text-left bg-white rounded-[8px] border border-[#DCE2EC] p-3.5 hover:border-[#2563EB] transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className="h-9 w-12 rounded-[6px] border border-[#CBD5E1] shrink-0"
                  style={{ backgroundColor: token.hex }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-mono font-semibold text-[#0F172A] truncate">
                    {token.name}
                  </div>
                  <div className="text-[12px] font-mono text-[#475569] tabular-nums">
                    {token.hex}
                  </div>
                </div>
                <span className="text-[#64748B] group-hover:text-[#2563EB]">
                  {copiedHex === token.hex ? (
                    <Check className="h-4 w-4 text-[#15803D]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </span>
              </div>
              <div className="mt-2.5 text-[12px] text-[#0F172A] leading-snug">{token.role}</div>
              <div className="mt-1 text-[11px] text-[#64748B] leading-snug">
                替代：{token.replaces}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
