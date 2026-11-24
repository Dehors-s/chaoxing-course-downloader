'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Minus, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { easeOutCubic, lerp, lerpHex, TK_PALETTE } from '@/lib/tk-math';

/**
 * 模拟 tkinter root.after(16) 逐帧十六进制颜色插值 Hook
 */
export function useLerpedHex(targetHex: string, durationMs = 140): string {
  const [currentHex, setCurrentHex] = useState(targetHex);
  const currentRef = useRef(targetHex);

  useEffect(() => {
    const startHex = currentRef.current;
    if (startHex.toUpperCase() === targetHex.toUpperCase()) return;

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const next = lerpHex(startHex, targetHex, easeOutCubic(t));
      currentRef.current = next;
      setCurrentHex(next);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [targetHex, durationMs]);

  return currentHex;
}

/**
 * Tk 卡片背板：零模糊阴影，使用双层 1px 实色阶梯描边模拟层级
 */
export function TkCard({
  children,
  className = '',
  subtle = false,
}: {
  children: React.ReactNode;
  className?: string;
  subtle?: boolean;
}) {
  return (
    <div
      className={`relative rounded-[10px] border border-[#DCE2EC] border-b-2 border-b-[#DCE2EC] ${
        subtle ? 'bg-[#F8FAFC]' : 'bg-[#FFFFFF]'
      } ${className}`}
      style={{
        // 严格模拟 draw_card_panel 的底部 1px 实色阶梯线，严禁任何 blur 模糊阴影
        outline: '0',
      }}
    >
      {children}
      {/* 底部 1px 实色投影降级层（紧贴外底缘，无模糊、无透明度） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[3px] left-[6px] right-[6px] h-[1px] bg-[#E6EBF2]"
      />
    </div>
  );
}

/**
 * Tk 自绘圆角按钮：纯 16ms 十六进制颜色插值，无 opacity 变化
 */
interface TkButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'teal';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export function TkButton({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  disabled,
  className = '',
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...rest
}: TkButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const paletteMap = {
    primary: {
      normal: TK_PALETTE.accent,
      hover: TK_PALETTE.accentHover,
      press: TK_PALETTE.accentPress,
      disabled: TK_PALETTE.accentDisabledBg,
      text: '#FFFFFF',
      disabledText: '#F8FAFC',
      border: 'transparent',
    },
    teal: {
      normal: TK_PALETTE.synthFill,
      hover: '#0F766E',
      press: '#115E59',
      disabled: '#CBD5E1',
      text: '#FFFFFF',
      disabledText: '#F8FAFC',
      border: 'transparent',
    },
    secondary: {
      normal: TK_PALETTE.btnSecondaryBg,
      hover: TK_PALETTE.btnSecondaryHover,
      press: TK_PALETTE.btnSecondaryPress,
      disabled: '#F1F5F9',
      text: TK_PALETTE.textPrimary,
      disabledText: '#94A3B8',
      border: TK_PALETTE.btnSecondaryBorder,
    },
    danger: {
      normal: TK_PALETTE.errorBg,
      hover: '#FEE2E2',
      press: '#FECACA',
      disabled: '#F1F5F9',
      text: TK_PALETTE.errorText,
      disabledText: '#94A3B8',
      border: TK_PALETTE.errorBorder,
    },
    ghost: {
      normal: '#FFFFFF',
      hover: '#F1F5F9',
      press: '#E2E8F0',
      disabled: '#FFFFFF',
      text: TK_PALETTE.textSecondary,
      disabledText: '#94A3B8',
      border: 'transparent',
    },
  };

  const p = paletteMap[variant];
  const targetBg = disabled ? p.disabled : pressed ? p.press : hovered ? p.hover : p.normal;
  const animatedBg = useLerpedHex(targetBg, pressed ? 65 : 135);

  const sizeClass =
    size === 'sm'
      ? 'h-[28px] px-2.5 text-[12px] rounded-[6px] gap-1.5'
      : size === 'lg'
        ? 'h-[40px] px-4 text-[13px] font-semibold rounded-[8px] gap-2'
        : 'h-[34px] px-3.5 text-[12.5px] font-medium rounded-[7px] gap-1.5';

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        setPressed(false);
        onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        setPressed(true);
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        onMouseUp?.(e);
      }}
      style={{
        backgroundColor: animatedBg,
        color: disabled ? p.disabledText : p.text,
        borderColor: p.border,
      }}
      className={`inline-flex items-center justify-center border whitespace-nowrap shrink-0 select-none cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB] ${sizeClass} ${className}`}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/**
 * Tk 自绘分段选择器：16ms easeOutCubic 滑块 X 坐标插值
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function TkSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (val: T) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const activeIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const [thumbPos, setThumbPos] = useState(activeIdx);
  const posRef = useRef(activeIdx);

  useEffect(() => {
    const startPos = posRef.current;
    if (Math.abs(startPos - activeIdx) < 0.001) return;

    let rafId = 0;
    const startTs = performance.now();
    const duration = 180;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      const next = lerp(startPos, activeIdx, easeOutCubic(t));
      posRef.current = next;
      setThumbPos(next);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeIdx]);

  const count = options.length;
  const segWidthPct = 100 / count;

  return (
    <div
      className={`relative grid rounded-[8px] bg-[#E9EEF5] p-[3px] select-none ${
        compact ? 'h-[30px]' : 'h-[34px]'
      }`}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {/* 实色滑块（纯坐标平移，无阴影模糊、无透明） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[3px] bottom-[3px] rounded-[6px] bg-[#FFFFFF] border border-[#D4DCE7]"
        style={{
          left: `calc(${thumbPos * segWidthPct}% + 3px)`,
          width: `calc(${segWidthPct}% - 6px)`,
        }}
      />
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 flex items-center justify-center whitespace-nowrap truncate px-2 cursor-pointer disabled:cursor-not-allowed ${
              compact ? 'text-[11.5px]' : 'text-[12px]'
            } ${isActive ? 'font-semibold text-[#0F172A]' : 'font-normal text-[#475569] hover:text-[#0F172A]'}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tk 自绘进度条：支持确定进度（16ms 宽度与颜色插值）和不确定解析扫条（纯坐标平移）
 */
export function TkProgressBar({
  value,
  phase = 'download',
  indeterminate = false,
  height = 8,
}: {
  value: number;
  phase?: 'download' | 'synth' | 'done' | 'error';
  indeterminate?: boolean;
  height?: number;
}) {
  const [sweep, setSweep] = useState(0);

  useEffect(() => {
    if (!indeterminate) return;
    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) % 1100;
      setSweep(elapsed / 1100);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [indeterminate]);

  const targetColor =
    phase === 'done'
      ? TK_PALETTE.successFill
      : phase === 'synth'
        ? TK_PALETTE.synthFill
        : phase === 'error'
          ? TK_PALETTE.errorFill
          : TK_PALETTE.accent;

  const animatedColor = useLerpedHex(targetColor, 220);
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className="relative w-full overflow-hidden rounded-full bg-[#E2E8F0]"
      style={{ height: `${height}px` }}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? (
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            width: '32%',
            left: `${sweep * 132 - 32}%`,
            backgroundColor: TK_PALETTE.accent,
          }}
        />
      ) : (
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            backgroundColor: animatedColor,
          }}
        />
      )}
    </div>
  );
}

/**
 * Tk 自绘三态复选框：纯实色 + 16ms hex 过渡
 */
export function TkCheckbox({
  state,
  onClick,
  ariaLabel,
}: {
  state: 'unchecked' | 'indeterminate' | 'checked';
  onClick: () => void;
  ariaLabel: string;
}) {
  const isFilled = state !== 'unchecked';
  const fillHex = useLerpedHex(isFilled ? TK_PALETTE.accent : '#FFFFFF', 110);
  const borderHex = useLerpedHex(isFilled ? TK_PALETTE.accent : '#CBD5E1', 110);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={ariaLabel}
      aria-checked={state === 'indeterminate' ? 'mixed' : state === 'checked'}
      role="checkbox"
      style={{ backgroundColor: fillHex, borderColor: borderHex }}
      className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB]"
    >
      {state === 'checked' && <Check className="h-3 w-3 text-white stroke-[2.8]" />}
      {state === 'indeterminate' && <Minus className="h-3 w-3 text-white stroke-[2.8]" />}
    </button>
  );
}

/**
 * Tk 自绘提示 Toast：严禁 opacity 淡入！严格遵循 Y 轴位移插值滑入 + 实色描边
 */
export interface ToastMessage {
  id: number;
  kind: 'success' | 'warning' | 'info';
  title: string;
  detail?: string;
}

export function TkToast({
  toast,
  onClose,
}: {
  toast: ToastMessage | null;
  onClose: () => void;
}) {
  const [offsetY, setOffsetY] = useState(54);
  const toastId = toast?.id ?? 0;

  useEffect(() => {
    if (!toastId) return;
    let rafId = 0;
    const startTs = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / 190);
      setOffsetY(lerp(54, 0, easeOutCubic(t)));
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [toastId]);

  if (!toast) return null;

  const styleMap = {
    success: {
      bg: TK_PALETTE.successBg,
      border: '#86EFAC',
      text: TK_PALETTE.successText,
      icon: <CheckCircle2 className="h-4 w-4 text-[#15803D] shrink-0" />,
    },
    warning: {
      bg: TK_PALETTE.warningBg,
      border: '#FCD34D',
      text: TK_PALETTE.warningText,
      icon: <AlertTriangle className="h-4 w-4 text-[#B45309] shrink-0" />,
    },
    info: {
      bg: '#FFFFFF',
      border: '#93C5FD',
      text: TK_PALETTE.textPrimary,
      icon: <Info className="h-4 w-4 text-[#2563EB] shrink-0" />,
    },
  };

  const s = styleMap[toast.kind];

  return (
    <div
      className="pointer-events-auto absolute right-4 bottom-4 z-40 max-w-[360px]"
      style={{
        transform: `translateY(${offsetY}px)`,
      }}
      role="status"
    >
      <div
        style={{ backgroundColor: s.bg, borderColor: s.border }}
        className="flex items-start gap-2.5 rounded-[8px] border border-b-2 px-3.5 py-2.5"
      >
        <div className="mt-0.5">{s.icon}</div>
        <div className="min-w-0 flex-1">
          <div style={{ color: s.text }} className="text-[12.5px] font-semibold leading-snug">
            {toast.title}
          </div>
          {toast.detail && (
            <div className="mt-0.5 text-[11.5px] text-[#475569] leading-snug">
              {toast.detail}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭提示"
          className="mt-0.5 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
