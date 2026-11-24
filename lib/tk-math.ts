/**
 * Python tkinter 8.6 Canvas 约束核心数学工具与设计令牌
 * 规则：100% 实色十六进制（零 alpha / 零 opacity / 零模糊阴影）
 */

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * 对应 tkinter after(16) 逐帧颜色线性插值
 */
export function lerpHex(hexA: string, hexB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return rgbToHex(r1 + (r2 - r1) * clamped, g1 + (g2 - g1) * clamped, b1 + (b2 - b1) * clamped);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

export function easeInOutQuad(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/**
 * Tk 8.6 实色令牌表（全部预混合，零 rgba）
 */
export const TK_PALETTE = {
  // 60% 主画布中性底色
  windowBg: '#F3F5F8',
  titleBarBg: '#EAEFF5',
  titleBarBorder: '#D5DDE8',

  // 30% 结构卡片与阶梯描边（降级阴影）
  cardBg: '#FFFFFF',
  cardSubtleBg: '#F8FAFC',
  cardBorder: '#DCE2EC',
  cardShadowStep1: '#E6EBF2', // 底部 1px 阶梯描边，模拟 1dp 投影
  cardShadowStep2: '#EEF2F7', // 底部 2px 极浅过渡线
  divider: '#E8EDF4',
  rowHover: '#F5F8FD',
  rowSelected: '#EEF4FF',

  // 文本层级（WCAG AA >= 4.5:1）
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textPlaceholder: '#94A3B8',

  // 10% 核心交互强调色（学术钴蓝）
  accent: '#2563EB',
  accentHover: '#1D4ED8',
  accentPress: '#1E40AF',
  accentTint: '#EFF5FF', // 预混合替代 rgba(37,99,235,0.07) on #FFF
  accentBorder: '#BFDBFE',
  accentDisabledBg: '#CBD5E1',
  accentDisabledText: '#F8FAFC',

  // 控件中性色
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  inputBorderFocus: '#2563EB',
  inputBgReadonly: '#F8FAFC',
  segTrackBg: '#E9EEF5',
  segThumbBg: '#FFFFFF',
  segThumbBorder: '#D4DCE7',
  btnSecondaryBg: '#FFFFFF',
  btnSecondaryHover: '#F1F5F9',
  btnSecondaryPress: '#E2E8F0',
  btnSecondaryBorder: '#CBD5E1',

  // 语义实色组（全预混合，配文字+图标）
  successText: '#15803D',
  successBg: '#ECFDF3',
  successBorder: '#BBF7D0',
  successFill: '#16A34A',

  synthText: '#0F766E',
  synthBg: '#F0FDFA',
  synthBorder: '#99F6E4',
  synthFill: '#0D9488',

  warningText: '#B45309',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningFill: '#D97706',

  errorText: '#B91C1C',
  errorBg: '#FEF2F2',
  errorBorder: '#FECACA',
  errorFill: '#DC2626',

  // 文件类型纯色标签（实色替代透明胶囊）
  typeSlideBg: '#EEF2FF',
  typeSlideText: '#3730A3',
  typeSlideBorder: '#C7D2FE',

  typePdfBg: '#FEF2F2',
  typePdfText: '#991B1B',
  typePdfBorder: '#FECACA',

  typeWordBg: '#EFF6FF',
  typeWordText: '#1E40AF',
  typeWordBorder: '#BFDBFE',

  typePptBg: '#FFF7ED',
  typePptText: '#9A3412',
  typePptBorder: '#FED7AA',
} as const;

export interface ColorTokenSpec {
  name: string;
  hex: string;
  role: string;
  replaces: string;
  category: 'surface' | 'text' | 'accent' | 'semantic';
}

export const COLOR_TOKEN_SPECS: ColorTokenSpec[] = [
  {
    name: 'WINDOW_BG',
    hex: '#F3F5F8',
    role: '窗口底层画布（60% 面积）',
    replaces: '纯白或高饱和渐变背景',
    category: 'surface',
  },
  {
    name: 'CARD_BG',
    hex: '#FFFFFF',
    role: '功能卡片背板（30% 结构面）',
    replaces: '半透明毛玻璃卡片',
    category: 'surface',
  },
  {
    name: 'CARD_BORDER',
    hex: '#DCE2EC',
    role: '卡片 1px 主描边',
    replaces: 'rgba(15,23,42,0.08) 边框',
    category: 'surface',
  },
  {
    name: 'CARD_SHADOW_STEP',
    hex: '#E6EBF2',
    role: '底部 1px 阶梯底线（降级阴影）',
    replaces: 'box-shadow: 0 2px 8px rgba(0,0,0,0.06)',
    category: 'surface',
  },
  {
    name: 'SEG_TRACK_BG',
    hex: '#E9EEF5',
    role: '分段选择器凹槽底色',
    replaces: 'rgba(15,23,42,0.05) 凹槽',
    category: 'surface',
  },
  {
    name: 'ROW_HOVER',
    hex: '#F5F8FD',
    role: '章节清单悬停底色',
    replaces: 'rgba(37,99,235,0.04) 叠加层',
    category: 'surface',
  },
  {
    name: 'TEXT_PRIMARY',
    hex: '#0F172A',
    role: '主标题、课程名、关键数值（对比度 17.8:1）',
    replaces: '纯黑 #000000',
    category: 'text',
  },
  {
    name: 'TEXT_SECONDARY',
    hex: '#475569',
    role: '次级说明、文件大小、章节统计（对比度 7.5:1）',
    replaces: 'rgba(15,23,42,0.68)',
    category: 'text',
  },
  {
    name: 'TEXT_MUTED',
    hex: '#64748B',
    role: '表单标签、辅助路径、占位提示（对比度 4.7:1）',
    replaces: 'rgba(15,23,42,0.52)',
    category: 'text',
  },
  {
    name: 'ACCENT',
    hex: '#2563EB',
    role: '主按钮、勾选框、下载进度条（10% 预算）',
    replaces: '高饱和渐变按钮',
    category: 'accent',
  },
  {
    name: 'ACCENT_HOVER',
    hex: '#1D4ED8',
    role: '主按钮 Hover 插值终点（140ms lerpHex）',
    replaces: 'CSS filter: brightness(0.92)',
    category: 'accent',
  },
  {
    name: 'ACCENT_TINT',
    hex: '#EFF5FF',
    role: '选中行 / 聚焦卡片预混合浅蓝底',
    replaces: 'rgba(37,99,235,0.07) on #FFFFFF',
    category: 'accent',
  },
  {
    name: 'SUCCESS_BG / TEXT',
    hex: '#ECFDF3',
    role: '下载完成 / Cookie 有效状态（配字 #15803D）',
    replaces: 'rgba(22,163,74,0.10)',
    category: 'semantic',
  },
  {
    name: 'SYNTH_BG / TEXT',
    hex: '#F0FDFA',
    role: '正在本地合成 PDF/PPTX 状态（配字 #0F766E）',
    replaces: '半透明青色呼吸光效',
    category: 'semantic',
  },
  {
    name: 'WARNING_BG / TEXT',
    hex: '#FFFBEB',
    role: 'Cookie 即将失效 / 未勾选警告（配字 #B45309）',
    replaces: 'rgba(217,119,6,0.12)',
    category: 'semantic',
  },
  {
    name: 'ERROR_BG / TEXT',
    hex: '#FEF2F2',
    role: '单文件超时 / 鉴权失败重试（配字 #B91C1C）',
    replaces: 'rgba(220,38,38,0.10)',
    category: 'semantic',
  },
];

export interface FallbackItem {
  id: string;
  area: string;
  webFeature: string;
  tkFallback: string;
  implementationNote: string;
  cpuCost: '极低 (<1%)' | '低 (1-3%)' | '中 (需节流)';
  severity: '必须降级' | '替代方案' | '性能保护';
}

export const FALLBACK_MATRIX: FallbackItem[] = [
  {
    id: 'shadow',
    area: '卡片投影与层级',
    webFeature: 'box-shadow: 0 4px 16px rgba(15,23,42,0.08)',
    tkFallback: '双层 1px 实色描边 + 底部 1px 阶梯灰线 (#DCE2EC + #E6EBF2)',
    implementationNote:
      '先在 (x, y+1) 画一层 #E6EBF2 圆角背板，再在 (x, y) 画 #FFFFFF 主背板配 #DCE2EC 描边，零像素模糊开销，层次清晰且不显脏。',
    cpuCost: '极低 (<1%)',
    severity: '必须降级',
  },
  {
    id: 'rounded',
    area: '圆角控件与卡片',
    webFeature: 'border-radius: 8px / 10px 抗锯齿裁剪',
    tkFallback: 'canvas.create_polygon(12控制点, smooth=True, splinesteps=12)',
    implementationNote:
      'Tk 的 smooth=True 使用二次 B 样条，直接用 8 点会导致直边微弯；必须在每个圆角切点处成对放置控制点（共 12~16 点）才能保证直边笔直、圆角圆润。',
    cpuCost: '极低 (<1%)',
    severity: '替代方案',
  },
  {
    id: 'opacity-fade',
    area: 'Toast / 弹窗淡入淡出',
    webFeature: 'opacity: 0 → 1 + backdrop-filter: blur(8px)',
    tkFallback: 'Y 轴位移滑入 (easeOutCubic) + 背景色到文字色的 lerp_hex 插值',
    implementationNote:
      'Tkinter Canvas 单个图形不支持 alpha 通道。Toast 改为从窗口右下角 y+28 → y 滑入（200ms）；模态弹窗用高对比 2px 外框卡片居中弹出，遮罩改用低开销半色调 stipple="gray25" 或直接禁用底栏按钮。',
    cpuCost: '低 (1-3%)',
    severity: '必须降级',
  },
  {
    id: 'hover-motion',
    area: '按钮与分段滑块动效',
    webFeature: 'CSS transition + GPU transform 合成',
    tkFallback: 'root.after(16) 单例帧调度器 + lerp_hex / 坐标插值',
    implementationNote:
      '严禁每个控件各自开独立 after() 定时器（会导致事件队列抖动）。全局只维护 1 个 60fps Animator 调度器，有活动动画时每 16ms 批量调用 canvas.itemconfig / canvas.coords，静止时自动停泵实现 0% CPU 占用。',
    cpuCost: '低 (1-3%)',
    severity: '替代方案',
  },
  {
    id: 'skeleton',
    area: '解析中骨架屏动画',
    webFeature: 'CSS linear-gradient 扫光流光效果',
    tkFallback: '实色矩形块呼吸插值 (#E8EDF4 ↔ #F3F6FA，周期 900ms)',
    implementationNote:
      '无渐变着色器，使用全局 Animator 对 6~8 个占位圆角矩形统一做 hex 线性往返插值，每帧仅 1 次 itemconfig(tag, fill=hex)，流畅且视觉克制。',
    cpuCost: '极低 (<1%)',
    severity: '必须降级',
  },
  {
    id: 'virtual-list',
    area: '长章节文件列表滚动',
    webFeature: 'DOM 原生滚动容器 + Sticky 吸顶分组头',
    tkFallback: '单 Canvas 虚拟列表重绘（仅渲染可见区 16~20 行）',
    implementationNote:
      '如果给 80 个文件分别创建 tk.Frame/Canvas 子组件，Windows 下滚动必掉帧且超过 32767px 会坐标溢出。改为 1 个 Canvas 维护行数据数组，根据 scroll_y 只绘制视口内行，复选框与进度条直接画在同一画布上。',
    cpuCost: '低 (1-3%)',
    severity: '性能保护',
  },
  {
    id: 'hidpi',
    area: 'Windows 125%/150% DPI 缩放',
    webFeature: '浏览器自动 devicePixelRatio 矢量渲染',
    tkFallback: '启动时调用 SetProcessDpiAwareness(1) + 逻辑像素乘法因子 S',
    implementationNote:
      'Windows 下若不声明 DPI Awareness，tkinter 会被系统拉伸发糊。启用 Per-Monitor/System DPI 感知后，所有坐标与圆角半径乘以缩放系数 S（125% 时 S=1.25），字体用负像素字号（如 -13）精确锁定像素高度。',
    cpuCost: '极低 (<1%)',
    severity: '必须降级',
  },
  {
    id: 'resize',
    area: '窗口自由缩放重排',
    webFeature: 'CSS Flex / Grid 实时流式响应',
    tkFallback: '左侧配置栏定宽 340px + 右侧主区弹性伸缩 + <Configure> 40ms 防抖',
    implementationNote:
      '拖拽窗口边框时 <Configure> 每秒触发数十次，直接全量重绘 Canvas 会闪烁。锁定 minsize(960, 720)，左栏宽固定 340px，仅右侧区域与底栏进度条在 40ms 防抖后更新坐标。',
    cpuCost: '中 (需节流)',
    severity: '性能保护',
  },
];

export interface PrototypeAnnotation {
  id: string;
  code: string;
  title: string;
  region: string;
  xPercent: number;
  yPercent: number;
  fallbackType: '必须降级' | 'Canvas 自绘' | '性能策略';
  summary: string;
  tkRecipe: string;
}

export const PROTOTYPE_ANNOTATIONS: PrototypeAnnotation[] = [
  {
    id: 'ann-titlebar',
    code: 'A1',
    title: '原生系统标题栏（不自绘）',
    region: '顶部 34px',
    xPercent: 50,
    yPercent: 2.2,
    fallbackType: '必须降级',
    summary: '保留 Windows 原生标题栏，避免 overrideredirect(True) 丢失任务栏图标、Win+方向键贴靠和缩放热区。',
    tkRecipe: 'root.title("学习通课程文件下载器")\n# 可选 ctypes DwmSetWindowAttribute(hwnd, 35, #EAEFF5) 定制标题栏实色',
  },
  {
    id: 'ann-card-shadow',
    code: 'A2',
    title: '卡片降级阴影：双层 1px 阶梯描边',
    region: '左栏卡片背板',
    xPercent: 18,
    yPercent: 23,
    fallbackType: '必须降级',
    summary: '无模糊阴影。先在 y+1 绘制 #E6EBF2 实色多边形，再覆盖 #FFFFFF 主背板与 #DCE2EC 描边。',
    tkRecipe: 'draw_rounded_rect(c, x1, y1+1, x2, y2+1, r=10, fill="#E6EBF2", outline="")\ndraw_rounded_rect(c, x1, y1, x2, y2, r=10, fill="#FFFFFF", outline="#DCE2EC")',
  },
  {
    id: 'ann-segmented',
    code: 'A3',
    title: '自绘分段选择器：X 轴坐标插值滑块',
    region: '合成格式区',
    xPercent: 17,
    yPercent: 56,
    fallbackType: 'Canvas 自绘',
    summary: '点击切换 PDF / PPTX / 原文件时，Animator 在 180ms 内按 easeOutCubic 插值白色滑块 X 坐标，文字颜色同步 lerp_hex。',
    tkRecipe: 'x = lerp(start_x, target_x, ease_out_cubic(t))\nc.coords(thumb_id, *rounded_rect_pts(x, 3, x+seg_w, h-3, r=6))',
  },
  {
    id: 'ann-cta',
    code: 'A4',
    title: '自绘圆角主按钮：16ms 颜色插值',
    region: '左栏底部操作区',
    xPercent: 16,
    yPercent: 91,
    fallbackType: 'Canvas 自绘',
    summary: '悬停与按下不使用 opacity，通过 140ms 的 lerp_hex("#2563EB", "#1D4ED8", t) 驱动背景重绘，禁用态切换 #CBD5E1。',
    tkRecipe: 'animator.tween(140, lambda t: c.itemconfig(bg_id, fill=lerp_hex(c0, c1, t)))',
  },
  {
    id: 'ann-virtual-list',
    code: 'A5',
    title: '单 Canvas 虚拟滚动章节清单',
    region: '右侧主列表区',
    xPercent: 66,
    yPercent: 45,
    fallbackType: '性能策略',
    summary: '80+ 文件不创建子 Widget，全部行元素（勾选框、类型标签、文件名、行进度条）在单一 Canvas 内按可见视口重绘。',
    tkRecipe: 'first = max(0, int(scroll_y // ROW_H))\nvisible = rows[first : first + viewport_rows + 2]\n# 仅更新视口内对象池，零卡顿',
  },
  {
    id: 'ann-progress',
    code: 'A6',
    title: '双阶段实色进度条 + Y 轴滑入 Toast',
    region: '右栏底部总进度条',
    xPercent: 66,
    yPercent: 89,
    fallbackType: '必须降级',
    summary: '下载期用钴蓝 #2563EB，进入 PDF/PPTX 本地合成期颜色插值过渡到青绿 #0D9488；完成 Toast 仅做 Y 轴位移，零透明度淡入。',
    tkRecipe: 'bar_fill = lerp_hex("#2563EB", "#0D9488", synth_t)\ntoast_y = lerp(win_h + 12, win_h - 68, ease_out_cubic(t))',
  },
];

export const PYTHON_CODE_SNIPPETS: Record<
  string,
  { filename: string; title: string; subtitle: string; code: string }
> = {
  theme: {
    filename: 'theme.py',
    title: '实色设计令牌与 HiDPI 缩放校准',
    subtitle: '零 rgba 预混合色板 + Windows 125% DPI 清晰度配置',
    code: `import ctypes
import sys

def enable_windows_dpi_awareness() -> float:
    """开启 Windows DPI 感知并返回逻辑像素缩放因子（125% 返回 1.25）"""
    if sys.platform == "win32":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
            hdc = ctypes.windll.user32.GetDC(0)
            dpi = ctypes.windll.gdi32.GetDeviceCaps(hdc, 88)  # LOGPIXELSX
            ctypes.windll.user32.ReleaseDC(0, hdc)
            return round(dpi / 96.0, 2)
        except Exception:
            return 1.0
    return 1.0


class Palette:
    """Tkinter 8.6 100% 实色令牌（所有浅色均为对白底预混合结果）"""
    WINDOW_BG         = "#F3F5F8"
    CARD_BG           = "#FFFFFF"
    CARD_BORDER       = "#DCE2EC"
    CARD_SHADOW_STEP  = "#E6EBF2"  # 替代模糊阴影的 1px 阶梯底线
    DIVIDER           = "#E8EDF4"

    TEXT_PRIMARY      = "#0F172A"
    TEXT_SECONDARY    = "#475569"
    TEXT_MUTED        = "#64748B"

    ACCENT            = "#2563EB"
    ACCENT_HOVER      = "#1D4ED8"
    ACCENT_PRESS      = "#1E40AF"
    ACCENT_TINT       = "#EFF5FF"  # 替代 rgba(37, 99, 235, 0.07)
    ACCENT_BORDER     = "#BFDBFE"

    SEG_TRACK         = "#E9EEF5"
    SEG_THUMB         = "#FFFFFF"
    SEG_THUMB_BORDER  = "#D4DCE7"

    SUCCESS_BG        = "#ECFDF3"
    SUCCESS_TEXT      = "#15803D"
    SUCCESS_FILL      = "#16A34A"

    SYNTH_BG          = "#F0FDFA"
    SYNTH_TEXT        = "#0F766E"
    SYNTH_FILL        = "#0D9488"

    WARNING_BG        = "#FFFBEB"
    WARNING_TEXT      = "#B45309"

    ERROR_BG          = "#FEF2F2"
    ERROR_TEXT        = "#B91C1C"


def px(val: float, scale: float) -> int:
    """将 1140x884 逻辑像素换算为当前 DPI 物理像素"""
    return int(round(val * scale))


def font_spec(size_px: int, weight: str = "normal", mono: bool = False):
    """使用负像素字号锁定字体高度，避免不同 Windows 缩放下换行错位"""
    family = "Cascadia Mono" if mono else "Microsoft YaHei UI"
    return (family, -abs(size_px), weight)
`,
  },
  animator: {
    filename: 'animator.py',
    title: '全局 60fps 帧调度器与十六进制颜色插值',
    subtitle: '单例 root.after(16) 循环，无活动动画时自动休眠（0% CPU）',
    code: `import time
import tkinter as tk
from dataclasses import dataclass
from typing import Callable, List


def lerp(a: float, b: float, t: float) -> float:
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return a + (b - a) * t


def ease_out_cubic(t: float) -> float:
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return 1.0 - (1.0 - t) ** 3


def lerp_hex(hex_a: str, hex_b: str, t: float) -> str:
    """纯整数十六进制 RGB 线性插值，适配 tkinter Canvas fill/outline"""
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    a = int(hex_a.lstrip("#"), 16)
    b = int(hex_b.lstrip("#"), 16)
    r1, g1, b1 = (a >> 16) & 255, (a >> 8) & 255, a & 255
    r2, g2, b2 = (b >> 16) & 255, (b >> 8) & 255, b & 255
    r = int(round(r1 + (r2 - r1) * t))
    g = int(round(g1 + (g2 - g1) * t))
    bl = int(round(b1 + (b2 - b1) * t))
    return f"#{r:02X}{g:02X}{bl:02X}"


@dataclass
class _Tween:
    key: str
    start_ts: float
    duration_s: float
    on_frame: Callable[[float], None]
    on_done: Callable[[], None] | None = None


class FrameAnimator:
    """全局单循环 16ms 调度器：避免多控件同时启动多个 after() 导致掉帧"""
    def __init__(self, root: tk.Tk, fps_ms: int = 16):
        self.root = root
        self.fps_ms = fps_ms
        self._tweens: List[_Tween] = []
        self._running = False

    def start(self, key: str, duration_ms: int,
              on_frame: Callable[[float], None],
              on_done: Callable[[], None] | None = None):
        # 相同 key 覆盖旧动画（如鼠标快速移入移出按钮）
        self._tweens = [tw for tw in self._tweens if tw.key != key]
        self._tweens.append(
            _Tween(key, time.perf_counter(), max(duration_ms, 1) / 1000.0, on_frame, on_done)
        )
        if not self._running:
            self._running = True
            self._tick()

    def _tick(self):
        now = time.perf_counter()
        still_active: List[_Tween] = []
        for tw in self._tweens:
            t = min(1.0, (now - tw.start_ts) / tw.duration_s)
            tw.on_frame(t)
            if t < 1.0:
                still_active.append(tw)
            elif tw.on_done:
                tw.on_done()
        self._tweens = still_active
        if self._tweens:
            self.root.after(self.fps_ms, self._tick)
        else:
            self._running = False
`,
  },
  widgets: {
    filename: 'canvas_widgets.py',
    title: 'Canvas 自绘圆角几何、按钮与分段滑块',
    subtitle: '12 控制点无畸变圆角多边形 + 阶梯卡片背板 + 滑块插值',
    code: `import tkinter as tk
from animator import FrameAnimator, ease_out_cubic, lerp, lerp_hex
from theme import Palette, font_spec


def rounded_rect_points(x1: float, y1: float, x2: float, y2: float, r: float):
    """
    12 控制点圆角多边形：在每个拐角两侧重复切点，
    防止 smooth=True (B-Spline) 把直边拉弯。
    """
    r = min(r, (x2 - x1) / 2.0, (y2 - y1) / 2.0)
    return [
        x1 + r, y1,
        x1 + r, y1,
        x2 - r, y1,
        x2 - r, y1,
        x2, y1,
        x2, y1 + r,
        x2, y1 + r,
        x2, y2 - r,
        x2, y2 - r,
        x2, y2,
        x2 - r, y2,
        x2 - r, y2,
        x1 + r, y2,
        x1 + r, y2,
        x1, y2,
        x1, y2 - r,
        x1, y2 - r,
        x1, y1 + r,
        x1, y1 + r,
        x1, y1,
    ]


def draw_card_panel(canvas: tk.Canvas, x1: float, y1: float, x2: float, y2: float, r: float = 10):
    """降级阴影卡片：y+1 实色阶梯线 + 主卡片 1px 描边"""
    pts_shadow = rounded_rect_points(x1, y1 + 1, x2, y2 + 1, r)
    canvas.create_polygon(pts_shadow, smooth=True, splinesteps=12,
                          fill=Palette.CARD_SHADOW_STEP, outline="")
    pts_main = rounded_rect_points(x1, y1, x2, y2, r)
    return canvas.create_polygon(pts_main, smooth=True, splinesteps=12,
                                 fill=Palette.CARD_BG, outline=Palette.CARD_BORDER, width=1)


class CanvasRoundedButton(tk.Canvas):
    def __init__(self, master, animator: FrameAnimator, text: str, command,
                 width=160, height=38, radius=8,
                 bg_normal=Palette.ACCENT, bg_hover=Palette.ACCENT_HOVER,
                 bg_press=Palette.ACCENT_PRESS, fg="#FFFFFF", parent_bg=Palette.CARD_BG):
        super().__init__(master, width=width, height=height, bg=parent_bg,
                         highlightthickness=0, bd=0, cursor="hand2")
        self.anim = animator
        self.command = command
        self.colors = (bg_normal, bg_hover, bg_press)
        self._curr_bg = bg_normal
        self._w, self._h, self._r = width, height, radius

        pts = rounded_rect_points(1, 1, width - 1, height - 1, radius)
        self._shape = self.create_polygon(pts, smooth=True, splinesteps=12,
                                          fill=bg_normal, outline="")
        self._label = self.create_text(width / 2, height / 2, text=text,
                                       fill=fg, font=font_spec(13, "bold"))

        self.bind("<Enter>", lambda _: self._fade_to(self.colors[1], 130))
        self.bind("<Leave>", lambda _: self._fade_to(self.colors[0], 150))
        self.bind("<ButtonPress-1>", lambda _: self._fade_to(self.colors[2], 70))
        self.bind("<ButtonRelease-1>", self._on_release)

    def _fade_to(self, target_hex: str, ms: int):
        start_hex = self._curr_bg
        def step(t: float):
            c = lerp_hex(start_hex, target_hex, ease_out_cubic(t))
            self._curr_bg = c
            self.itemconfig(self._shape, fill=c)
        self.anim.start(f"btn-{id(self)}", ms, step)

    def _on_release(self, _):
        self._fade_to(self.colors[1], 100)
        if callable(self.command):
            self.command()


class CanvasSegmentedControl(tk.Canvas):
    """自绘分段选择器：180ms 滑块 X 坐标插值 + 文字颜色插值"""
    def __init__(self, master, animator: FrameAnimator, options: list[str],
                 on_change, width=308, height=34, parent_bg=Palette.CARD_BG):
        super().__init__(master, width=width, height=height, bg=parent_bg,
                         highlightthickness=0, bd=0, cursor="hand2")
        self.anim = animator
        self.options = options
        self.on_change = on_change
        self._idx = 0
        self._pad = 3
        self._seg_w = (width - self._pad * 2) / len(options)
        self._thumb_x = float(self._pad)

        # 轨道凹槽
        self.create_polygon(rounded_rect_points(0, 0, width, height, 8),
                            smooth=True, splinesteps=12, fill=Palette.SEG_TRACK, outline="")
        # 白色滑块
        self._thumb = self.create_polygon(
            rounded_rect_points(self._pad, self._pad, self._pad + self._seg_w, height - self._pad, 6),
            smooth=True, splinesteps=12, fill=Palette.SEG_THUMB,
            outline=Palette.SEG_THUMB_BORDER, width=1
        )
        # 文本项
        self._texts = []
        for i, label in enumerate(options):
            cx = self._pad + self._seg_w * (i + 0.5)
            tid = self.create_text(
                cx, height / 2, text=label,
                fill=Palette.TEXT_PRIMARY if i == 0 else Palette.TEXT_SECONDARY,
                font=font_spec(12, "bold" if i == 0 else "normal")
            )
            self._texts.append(tid)

        self.bind("<Button-1>", self._on_click)

    def _on_click(self, event):
        new_idx = int((event.x - self._pad) // self._seg_w)
        new_idx = max(0, min(len(self.options) - 1, new_idx))
        if new_idx == self._idx:
            return
        old_idx = self._idx
        self._idx = new_idx
        start_x = self._thumb_x
        target_x = self._pad + new_idx * self._seg_w
        h = int(self["height"])

        def step(t: float):
            e = ease_out_cubic(t)
            x = lerp(start_x, target_x, e)
            self._thumb_x = x
            self.coords(self._thumb, *rounded_rect_points(x, self._pad, x + self._seg_w, h - self._pad, 6))
            self.itemconfig(self._texts[old_idx], fill=lerp_hex(Palette.TEXT_PRIMARY, Palette.TEXT_SECONDARY, e))
            self.itemconfig(self._texts[new_idx], fill=lerp_hex(Palette.TEXT_SECONDARY, Palette.TEXT_PRIMARY, e))

        self.anim.start(f"seg-{id(self)}", 180, step)
        self.on_change(new_idx, self.options[new_idx])
`,
  },
  virtual_list: {
    filename: 'virtual_list.py',
    title: '单 Canvas 虚拟滚动章节树（防卡顿核心）',
    subtitle: '只渲染视口内 16~20 行，内嵌复选框与实时行进度条',
    code: `import tkinter as tk
from theme import Palette, font_spec
from canvas_widgets import rounded_rect_points


class VirtualChapterList(tk.Canvas):
    """
    核心性能降级方案：
    不创建子 tk.Frame，所有章节头、复选框、文件类型标签、下载进度条
    都在单一 Canvas 上按 scroll_y 偏移量重绘，支持 500+ 课件丝滑 60fps 滚动。
    """
    ROW_H = 40
    HEADER_H = 38

    def __init__(self, master, **kwargs):
        super().__init__(master, bg=Palette.CARD_BG, highlightthickness=0, bd=0, **kwargs)
        self.rows = []         # 扁平化后的可见节点列表 (header | file)
        self.scroll_y = 0.0
        self.hover_row = -1
        self.bind("<MouseWheel>", self._on_wheel)
        self.bind("<Motion>", self._on_motion)
        self.bind("<Configure>", lambda _: self.redraw())

    def _on_wheel(self, event):
        max_scroll = max(0, len(self.rows) * self.ROW_H - self.winfo_height())
        self.scroll_y = max(0.0, min(max_scroll, self.scroll_y - (event.delta / 120) * 48))
        self.redraw()

    def _on_motion(self, event):
        idx = int((event.y + self.scroll_y) // self.ROW_H)
        if idx != self.hover_row:
            self.hover_row = idx
            self.redraw()

    def redraw(self):
        self.delete("all")
        w = max(self.winfo_width(), 400)
        h = max(self.winfo_height(), 200)
        first = max(0, int(self.scroll_y // self.ROW_H))
        count = int(h // self.ROW_H) + 2

        for idx in range(first, min(len(self.rows), first + count)):
            row = self.rows[idx]
            y = idx * self.ROW_H - self.scroll_y

            # 1. 行背景与 1px 底部分隔线
            bg = Palette.ROW_HOVER if idx == self.hover_row else Palette.CARD_BG
            self.create_rectangle(0, y, w, y + self.ROW_H, fill=bg, outline="")
            self.create_line(16, y + self.ROW_H - 1, w - 16, y + self.ROW_H - 1, fill=Palette.DIVIDER)

            # 2. 自绘复选框 (16x16)
            cx1, cy1 = 18, y + 12
            checked = row.get("checked", False)
            self.create_polygon(
                rounded_rect_points(cx1, cy1, cx1 + 16, cy1 + 16, 4),
                smooth=True, splinesteps=8,
                fill=Palette.ACCENT if checked else Palette.CARD_BG,
                outline=Palette.ACCENT if checked else "#CBD5E1", width=1
            )

            # 3. 文件名与右对齐等宽体积
            self.create_text(46, y + self.ROW_H / 2, text=row["title"], anchor="w",
                             fill=Palette.TEXT_PRIMARY, font=font_spec(13))
            self.create_text(w - 130, y + self.ROW_H / 2, text=row["size"], anchor="e",
                             fill=Palette.TEXT_SECONDARY, font=font_spec(12, mono=True))

            # 4. 内联下载进度条 (88x6)
            pct = row.get("progress", 0.0)
            px1, py1 = w - 108, y + 17
            self.create_polygon(rounded_rect_points(px1, py1, px1 + 88, py1 + 6, 3),
                                smooth=True, fill="#E2E8F0", outline="")
            if pct > 0:
                fill_w = max(6, 88 * pct)
                bar_c = Palette.SUCCESS_FILL if pct >= 1.0 else Palette.ACCENT
                self.create_polygon(rounded_rect_points(px1, py1, px1 + fill_w, py1 + 6, 3),
                                    smooth=True, fill=bar_c, outline="")
`,
  },
};
