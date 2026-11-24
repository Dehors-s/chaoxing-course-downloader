'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderOpen,
  HelpCircle,
  Layers,
  Minus,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import {
  AssetType,
  COURSE_PRESETS,
  CourseAsset,
  CourseChapter,
  cloneChapters,
} from '@/lib/mock-course-data';
import {
  PROTOTYPE_ANNOTATIONS,
  PrototypeAnnotation,
  TK_PALETTE,
  lerpHex,
} from '@/lib/tk-math';
import {
  TkButton,
  TkCard,
  TkCheckbox,
  TkProgressBar,
  TkSegmentedControl,
  TkToast,
  ToastMessage,
} from '@/components/tk-widgets';

type ExportFormat = 'pdf' | 'pptx' | 'raw';
type QualityPreset = 'high' | 'balanced' | 'lite';
type FilterType = 'all' | AssetType;
type RunPhase = 'idle' | 'downloading' | 'synthesizing' | 'paused' | 'done';

const FOLDERS = [
  'D:\\CourseBackup\\数字信号处理_2026秋',
  'C:\\Users\\Student\\Desktop\\期末复习资料备份',
  'E:\\Academic\\2026_Fall\\学习通归档',
];

/**
 * 16ms 实色骨架屏行（严禁 CSS opacity / linear-gradient 扫光）
 */
function TkSkeletonList() {
  const [fillHex, setFillHex] = useState('#E8EDF4');

  useEffect(() => {
    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const wave = (Math.sin(((now - start) / 900) * Math.PI * 2) + 1) / 2;
      setFillHex(lerpHex('#E8EDF4', '#F3F6FA', wave));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between text-[12px] text-[#475569] pb-1">
        <span>正在请求学习通章节接口并解析图文幻灯片页数...</span>
        <span className="font-mono text-[11.5px] text-[#64748B]">骨架色 {fillHex}</span>
      </div>
      <TkProgressBar value={0} indeterminate height={6} />
      <div className="pt-2 space-y-2.5">
        {[1, 2, 3, 4, 5, 6].map((row) => (
          <div
            key={row}
            className="flex items-center gap-3 h-[38px] px-3 rounded-[6px] border border-[#E8EDF4]"
          >
            <div
              className="h-4 w-4 rounded-[4px] shrink-0"
              style={{ backgroundColor: fillHex }}
            />
            <div
              className="h-4 w-14 rounded-[4px] shrink-0"
              style={{ backgroundColor: fillHex }}
            />
            <div
              className="h-3.5 rounded-[4px] flex-1"
              style={{
                backgroundColor: fillHex,
                maxWidth: row % 2 === 0 ? '62%' : '78%',
              }}
            />
            <div
              className="h-3.5 w-16 rounded-[4px] shrink-0 ml-auto"
              style={{ backgroundColor: fillHex }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetTypeTag({ type, slidePages }: { type: AssetType; slidePages?: number }) {
  const config = {
    slide: {
      label: slidePages ? `图文 ${slidePages}页` : '图文页',
      bg: TK_PALETTE.typeSlideBg,
      text: TK_PALETTE.typeSlideText,
      border: TK_PALETTE.typeSlideBorder,
    },
    pdf: {
      label: 'PDF',
      bg: TK_PALETTE.typePdfBg,
      text: TK_PALETTE.typePdfText,
      border: TK_PALETTE.typePdfBorder,
    },
    docx: {
      label: 'Word',
      bg: TK_PALETTE.typeWordBg,
      text: TK_PALETTE.typeWordText,
      border: TK_PALETTE.typeWordBorder,
    },
    pptx: {
      label: 'PPT',
      bg: TK_PALETTE.typePptBg,
      text: TK_PALETTE.typePptText,
      border: TK_PALETTE.typePptBorder,
    },
  }[type];

  return (
    <span
      style={{
        backgroundColor: config.bg,
        color: config.text,
        borderColor: config.border,
      }}
      className="inline-flex items-center justify-center h-[20px] px-1.5 rounded-[4px] border text-[11px] font-medium whitespace-nowrap shrink-0 tabular-nums"
    >
      {config.label}
    </span>
  );
}

export function DesktopPrototype() {
  const defaultPreset = COURSE_PRESETS[0];

  // 工作台外层预览控制
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<PrototypeAnnotation | null>(null);
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual'>('fit');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);

  // 桌面端业务状态
  const [courseUrl, setCourseUrl] = useState(defaultPreset.url);
  const [cookieText, setCookieText] = useState(defaultPreset.sampleCookie);
  const [maskCookie, setMaskCookie] = useState(true);
  const [cookieExpired, setCookieExpired] = useState(false);
  const [showCookieGuide, setShowCookieGuide] = useState(false);

  const [courseMeta, setCourseMeta] = useState<{
    name: string;
    instructor: string;
    term: string;
  } | null>({
    name: defaultPreset.name,
    instructor: defaultPreset.instructor,
    term: defaultPreset.term,
  });

  const [chapters, setChapters] = useState<CourseChapter[]>(() =>
    cloneChapters(defaultPreset.chapters)
  );
  const [isParsing, setIsParsing] = useState(false);

  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [quality, setQuality] = useState<QualityPreset>('balanced');
  const [mergeSlidesAndPdf, setMergeSlidesAndPdf] = useState(true);
  const [folderIdx, setFolderIdx] = useState(0);

  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 下载与本地合成引擎状态
  const [runPhase, setRunPhase] = useState<RunPhase>('idle');
  const [speedMBps, setSpeedMBps] = useState(0);
  const [currentTaskText, setCurrentTaskText] = useState('就绪 · 勾选章节后即可一键下载并合成');
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    '[23:08:12] 已载入课程「数字信号处理（核心专业课）」，共 4 章 12 份资料。',
    '[23:08:12] 本地合成引擎就绪：PyMuPDF + python-pptx（单文件免 Office 依赖）。',
  ]);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const runPhaseRef = useRef<RunPhase>(runPhase);
  const exportFormatRef = useRef<ExportFormat>(exportFormat);
  const chaptersRef = useRef<CourseChapter[]>(chapters);

  useEffect(() => {
    runPhaseRef.current = runPhase;
  }, [runPhase]);

  useEffect(() => {
    exportFormatRef.current = exportFormat;
  }, [exportFormat]);

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const pushToast = (kind: ToastMessage['kind'], title: string, detail?: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), kind, title, detail });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  const appendLog = (msg: string) => {
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(
      2,
      '0'
    )}:${String(now.getSeconds()).padStart(2, '0')}`;
    setLogs((prev) => [`[${stamp}] ${msg}`, ...prev].slice(0, 40));
  };

  // 计算自适应缩放比（在 1440px 屏幕上保持清晰可读，不产生水平溢出）
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const availW = containerRef.current.clientWidth;
      if (availW < 1140) {
        setFitScale(Math.max(0.55, availW / 1140));
      } else {
        setFitScale(1);
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const appliedScale = zoomMode === 'fit' ? fitScale : 1;

  // 汇总统计
  const stats = useMemo(() => {
    const allAssets = chapters.flatMap((c) => c.assets);
    const checkedAssets = allAssets.filter((a) => a.checked);
    const totalSlides = checkedAssets.reduce((acc, a) => acc + (a.slidePages || 0), 0);
    const totalSize = checkedAssets.reduce((acc, a) => acc + a.sizeMB, 0);
    const doneAssets = checkedAssets.filter((a) => a.status === 'done');
    const errorAssets = checkedAssets.filter((a) => a.status === 'error');
    const activeChapters = chapters.filter((c) => c.assets.some((a) => a.checked));
    const synthesizedChapters = activeChapters.filter((c) => Boolean(c.synthesizedFile));

    const downloadAvg =
      checkedAssets.length === 0
        ? 0
        : checkedAssets.reduce((acc, a) => acc + a.progress, 0) / checkedAssets.length;

    let overallPct = 0;
    if (runPhase === 'done') {
      overallPct = 100;
    } else if (runPhase === 'synthesizing') {
      const synthRatio =
        activeChapters.length === 0
          ? 1
          : activeChapters.reduce(
              (acc, c) => acc + (c.synthesizedFile ? 100 : c.synthProgress || 0),
              0
            ) / activeChapters.length;
      overallPct = 78 + synthRatio * 0.22;
    } else if (runPhase === 'downloading' || runPhase === 'paused') {
      overallPct = downloadAvg * (exportFormat === 'raw' ? 1 : 0.78);
    }

    return {
      allCount: allAssets.length,
      checkedCount: checkedAssets.length,
      doneCount: doneAssets.length,
      errorCount: errorAssets.length,
      totalSlides,
      totalSize,
      chapterCount: chapters.length,
      activeChapterCount: activeChapters.length,
      synthesizedCount: synthesizedChapters.length,
      overallPct,
    };
  }, [chapters, runPhase, exportFormat]);

  // 筛选可见章节与资料
  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chapters
      .map((ch) => ({
        ...ch,
        assets: ch.assets.filter((a) => {
          const matchType = typeFilter === 'all' || a.type === typeFilter;
          const matchQuery = !q || a.title.toLowerCase().includes(q) || ch.title.toLowerCase().includes(q);
          return matchType && matchQuery;
        }),
      }))
      .filter((ch) => ch.assets.length > 0);
  }, [chapters, typeFilter, searchQuery]);

  // 切换课程预设 / 空状态
  const loadPreset = (presetIdx: number) => {
    const preset = COURSE_PRESETS[presetIdx];
    setRunPhase('idle');
    setCookieExpired(false);
    setCourseUrl(preset.url);
    setCookieText(preset.sampleCookie);
    setCourseMeta({ name: preset.name, instructor: preset.instructor, term: preset.term });
    setChapters(cloneChapters(preset.chapters));
    setCurrentTaskText('就绪 · 勾选章节后即可一键下载并合成');
    appendLog(`切换示例课程「${preset.name}」，解析得到 ${preset.chapters.length} 个章节。`);
    pushToast('info', `已载入示例：${preset.name}`, '可直接勾选文件并测试下载与本地合成');
  };

  const resetToEmpty = () => {
    setRunPhase('idle');
    setCourseUrl('');
    setCookieText('');
    setCookieExpired(false);
    setCourseMeta(null);
    setChapters([]);
    setCurrentTaskText('等待粘贴课程链接与浏览器 Cookie');
    pushToast('info', '已切换至初始空状态', '可点击左侧「填入示例」或下方快速开始');
  };

  // 解析课程（触发 16ms 骨架屏插值动画）
  const handleParseCourse = (autoFillPreset = false) => {
    const targetPreset = COURSE_PRESETS[0];
    const effectiveUrl = autoFillPreset ? targetPreset.url : courseUrl.trim();
    const effectiveCookie = autoFillPreset ? targetPreset.sampleCookie : cookieText.trim();

    if (autoFillPreset) {
      setCourseUrl(targetPreset.url);
      setCookieText(targetPreset.sampleCookie);
      setCookieExpired(false);
    }

    if (!effectiveUrl || !effectiveCookie) {
      pushToast('warning', '请先粘贴课程链接与浏览器 Cookie', '点击右上角「填入示例」可一键体验完整流程');
      return;
    }

    if (cookieExpired && !autoFillPreset) {
      pushToast('warning', '当前 Cookie 已失效', '请重新粘贴有效 Cookie 或点击告警栏一键修复');
      return;
    }

    setRunPhase('idle');
    setIsParsing(true);
    setCurrentTaskText('正在解析课程目录与学习通图文页资源...');
    appendLog('开始请求学习通章节目录树（GET /mycourse/studentcourse）...');

    setTimeout(() => {
      const matched =
        COURSE_PRESETS.find((p) => effectiveUrl.includes(p.url.slice(40, 62))) || targetPreset;
      setCourseMeta({ name: matched.name, instructor: matched.instructor, term: matched.term });
      setChapters(cloneChapters(matched.chapters));
      setIsParsing(false);
      setCurrentTaskText('解析完成 · 请确认勾选章节并开始批量下载');
      appendLog(`解析完成：共识别 ${matched.chapters.length} 章、${matched.chapters.flatMap((c) => c.assets).length} 份课件资源。`);
      pushToast('success', '课程章节解析完成', `共发现 ${matched.chapters.length} 个章节，已自动勾选核心课件`);
    }, 950);
  };

  // 勾选控制
  const toggleAsset = (chapterId: string, assetId: string) => {
    if (runPhase === 'downloading' || runPhase === 'synthesizing') return;
    setChapters((prev) =>
      prev.map((ch) =>
        ch.id !== chapterId
          ? ch
          : {
              ...ch,
              assets: ch.assets.map((a) => (a.id === assetId ? { ...a, checked: !a.checked } : a)),
            }
      )
    );
  };

  const toggleChapterCheck = (chapterId: string) => {
    if (runPhase === 'downloading' || runPhase === 'synthesizing') return;
    setChapters((prev) =>
      prev.map((ch) => {
        if (ch.id !== chapterId) return ch;
        const allChecked = ch.assets.every((a) => a.checked);
        return {
          ...ch,
          assets: ch.assets.map((a) => ({ ...a, checked: !allChecked })),
        };
      })
    );
  };

  const toggleChapterExpand = (chapterId: string) => {
    setChapters((prev) =>
      prev.map((ch) => (ch.id === chapterId ? { ...ch, expanded: !ch.expanded } : ch))
    );
  };

  const handleSelectAll = (mode: 'all' | 'invert') => {
    if (runPhase === 'downloading' || runPhase === 'synthesizing') return;
    setChapters((prev) =>
      prev.map((ch) => ({
        ...ch,
        assets: ch.assets.map((a) => ({
          ...a,
          checked: mode === 'all' ? true : !a.checked,
        })),
      }))
    );
  };

  const toggleExpandAll = () => {
    const anyCollapsed = chapters.some((c) => !c.expanded);
    setChapters((prev) => prev.map((c) => ({ ...c, expanded: anyCollapsed })));
  };

  // 重试单个失败文件
  const handleRetryAsset = (chapterId: string, assetId: string) => {
    setChapters((prev) =>
      prev.map((ch) =>
        ch.id !== chapterId
          ? ch
          : {
              ...ch,
              assets: ch.assets.map((a) =>
                a.id === assetId
                  ? { ...a, status: 'downloading', progress: 35, errorMessage: undefined }
                  : a
              ),
            }
      )
    );
    appendLog(`正在重试下载失败资源（ID: ${assetId}）...`);
    setTimeout(() => {
      setChapters((prev) =>
        prev.map((ch) =>
          ch.id !== chapterId
            ? ch
            : {
                ...ch,
                assets: ch.assets.map((a) =>
                  a.id === assetId ? { ...a, status: 'done', progress: 100 } : a
                ),
              }
        )
      );
      appendLog(`重试成功：该文件已下载完成并补齐章节归档。`);
      pushToast('success', '单文件重试成功', '已自动补齐至目标章节目录');
    }, 650);
  };

  // 启动 / 暂停 / 恢复 60fps 下载与合成模拟循环
  useEffect(() => {
    if (runPhase !== 'downloading' && runPhase !== 'synthesizing') return;

    const timer = setInterval(() => {
      const current = chaptersRef.current;

      if (runPhaseRef.current === 'downloading') {
        setSpeedMBps(Number((3.8 + Math.random() * 2.4).toFixed(1)));
        const next = current.map((c) => ({ ...c, assets: c.assets.map((a) => ({ ...a })) }));
        const checked = next.flatMap((c) => c.assets).filter((a) => a.checked);
        const unfinished = checked.filter((a) => a.status !== 'done' && a.status !== 'error');

        if (unfinished.length === 0) {
          if (exportFormatRef.current === 'raw') {
            setRunPhase('done');
            setSpeedMBps(0);
            setCurrentTaskText(`全部 ${checked.length} 份原文件已下载完毕`);
            appendLog(`任务完成：共保存 ${checked.length} 份原文件至本地目录。`);
            pushToast('success', '批量下载完成', `共保存 ${checked.length} 份原始课程资料`);
          } else {
            setRunPhase('synthesizing');
            setSpeedMBps(0);
            const ext = exportFormatRef.current.toUpperCase();
            setCurrentTaskText(`下载完毕，正在本地按章合成 ${ext}（免 Office）...`);
            appendLog(`文件下载完毕，开始调用本地 Python 引擎按章合成 ${ext}...`);
          }
          return;
        }

        const activeSlots = unfinished.slice(0, 3);
        activeSlots.forEach((item, idx) => {
          item.status = 'downloading';
          const step = idx === 0 ? 18 : idx === 1 ? 14 : 11;
          item.progress = Math.min(100, item.progress + step);
          if (item.progress >= 100) {
            item.status = 'done';
          }
        });

        setChapters(next);
        setCurrentTaskText(`正在并发下载：${activeSlots[0].title}`);
      } else if (runPhaseRef.current === 'synthesizing') {
        const ext = exportFormatRef.current === 'pptx' ? 'pptx' : 'pdf';
        const next = current.map((c) => ({ ...c }));
        const pendingChapters = next.filter(
          (c) => c.assets.some((a) => a.checked) && !c.synthesizedFile
        );

        if (pendingChapters.length === 0) {
          const totalSynth = next.filter((c) => c.synthesizedFile).length;
          setRunPhase('done');
          setCurrentTaskText(`全部章节已本地合成 ${ext.toUpperCase()} 完成`);
          appendLog(`全部章节合成完成（输出格式：.${ext}），可直接打开目录查看。`);
          pushToast(
            'success',
            `已自动合成 ${totalSynth} 个章节 ${ext.toUpperCase()}`,
            `输出目录：${FOLDERS[folderIdx]}`
          );
          return;
        }

        const target = pendingChapters[0];
        target.synthesizing = true;
        const nextPct = Math.min(100, (target.synthProgress || 0) + 34);
        target.synthProgress = nextPct;
        setCurrentTaskText(`正在合成 ${target.index}_${target.title.slice(0, 10)}.${ext} (${nextPct}%)`);

        if (nextPct >= 100) {
          target.synthesizing = false;
          target.synthesizedFile = `${target.index.replace(/\s+/g, '')}.${ext}`;
          appendLog(`合成完成：${target.synthesizedFile}（无 Office 本地写入）`);
        }

        setChapters(next);
      }
    }, 180);

    return () => clearInterval(timer);
  }, [runPhase, folderIdx]);

  const handleStartOrToggleRun = () => {
    if (cookieExpired) {
      pushToast('warning', 'Cookie 已失效，无法下载', '请先更新有效浏览器 Cookie');
      return;
    }
    if (stats.checkedCount === 0) {
      pushToast('warning', '尚未勾选任何资料', '请在右侧章节树至少勾选 1 项资料');
      return;
    }
    if (runPhase === 'downloading' || runPhase === 'synthesizing') {
      setRunPhase('paused');
      setSpeedMBps(0);
      setCurrentTaskText('任务已暂停 · 可随时继续');
      appendLog('用户暂停当前批量下载任务。');
      return;
    }
    if (runPhase === 'paused') {
      setRunPhase('downloading');
      appendLog('继续执行剩余下载队列...');
      return;
    }
    if (runPhase === 'done') {
      pushToast('info', '已模拟调用系统资源管理器', `explorer.exe "${FOLDERS[folderIdx]}"`);
      appendLog(`打开本地输出目录：${FOLDERS[folderIdx]}`);
      return;
    }

    // 全新启动
    setChapters((prev) =>
      prev.map((ch) => ({
        ...ch,
        expanded: true,
        synthesizedFile: undefined,
        synthesizing: false,
        synthProgress: 0,
        assets: ch.assets.map((a) => ({
          ...a,
          status: a.checked ? 'pending' : a.status,
          progress: a.checked ? 0 : a.progress,
          errorMessage: undefined,
        })),
      }))
    );
    setRunPhase('downloading');
    appendLog(
      `开始批量任务：共 ${stats.checkedCount} 项（${stats.totalSize.toFixed(
        1
      )} MB），目标格式 ${exportFormat.toUpperCase()}。`
    );
  };

  const handleResetProgress = () => {
    setRunPhase('idle');
    setSpeedMBps(0);
    setChapters((prev) =>
      prev.map((ch) => ({
        ...ch,
        synthesizedFile: undefined,
        synthesizing: false,
        synthProgress: 0,
        assets: ch.assets.map((a) => ({ ...a, status: 'pending', progress: 0, errorMessage: undefined })),
      }))
    );
    setCurrentTaskText('已重置下载状态 · 可重新配置并下载');
  };

  const simulateSingleTimeout = () => {
    if (chapters.length === 0) return;
    setChapters((prev) =>
      prev.map((ch, cIdx) =>
        cIdx !== 0
          ? ch
          : {
              ...ch,
              expanded: true,
              assets: ch.assets.map((a, aIdx) =>
                aIdx === 1
                  ? { ...a, checked: true, status: 'error', progress: 42, errorMessage: '连接超时' }
                  : a
              ),
            }
      )
    );
    appendLog('告警：1.2 LTI 系统卷积和讲义.pdf 请求超时，已标记为单文件重试。');
    pushToast('warning', '已模拟单文件超时态', '点击清单中红色「重试」按钮可单独恢复');
  };

  const formatLabel =
    exportFormat === 'pdf' ? '章节 PDF' : exportFormat === 'pptx' ? '章节 PPTX' : '原文件';

  return (
    <div className="space-y-4">
      {/* 工作台外部工具条（不计入桌面软件本身，用于切换预览场景与开启 Tk 降级标注） */}
      <div className="bg-white rounded-[10px] border border-[#DCE2EC] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-[#64748B] mr-1">状态场景：</span>
          <button
            type="button"
            onClick={() => loadPreset(0)}
            className="px-2.5 py-1 text-[12px] font-medium rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            本科课程示例
          </button>
          <button
            type="button"
            onClick={() => loadPreset(1)}
            className="px-2.5 py-1 text-[12px] font-medium rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            研究生课程示例
          </button>
          <button
            type="button"
            onClick={resetToEmpty}
            className="px-2.5 py-1 text-[12px] font-medium rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#475569] cursor-pointer whitespace-nowrap"
          >
            初始空状态
          </button>
          <button
            type="button"
            onClick={() => {
              setCookieExpired((v) => !v);
              if (!cookieExpired) {
                pushToast('warning', '已触发 Cookie 过期态', '观察非颜色单一编码的警告条与按钮禁用态');
              }
            }}
            className={`px-2.5 py-1 text-[12px] font-medium rounded-[6px] border cursor-pointer whitespace-nowrap ${
              cookieExpired
                ? 'bg-[#FFFBEB] border-[#FCD34D] text-[#B45309]'
                : 'border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#475569]'
            }`}
          >
            {cookieExpired ? '取消 Cookie 失效' : '模拟 Cookie 失效'}
          </button>
          <button
            type="button"
            onClick={simulateSingleTimeout}
            className="px-2.5 py-1 text-[12px] font-medium rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#475569] cursor-pointer whitespace-nowrap"
          >
            模拟单文件超时
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAnnotations((v) => {
                const next = !v;
                if (!next) setActiveAnnotation(null);
                else setActiveAnnotation(PROTOTYPE_ANNOTATIONS[1]);
                return next;
              });
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-[7px] border cursor-pointer whitespace-nowrap transition-colors ${
              showAnnotations
                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                : 'bg-[#EFF5FF] text-[#1D4ED8] border-[#BFDBFE] hover:bg-[#DBEAFE]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            {showAnnotations ? '隐藏 Tk 降级标注' : '显示 Tk 降级标注 (A1–A6)'}
          </button>

          <div className="hidden sm:flex items-center gap-1 p-0.5 bg-[#E9EEF5] rounded-[7px] text-[11.5px]">
            <button
              type="button"
              onClick={() => setZoomMode('fit')}
              className={`px-2.5 py-1 rounded-[5px] cursor-pointer whitespace-nowrap ${
                zoomMode === 'fit' ? 'bg-white text-[#0F172A] font-medium' : 'text-[#475569]'
              }`}
            >
              自适应
            </button>
            <button
              type="button"
              onClick={() => setZoomMode('actual')}
              className={`px-2.5 py-1 rounded-[5px] cursor-pointer whitespace-nowrap font-mono ${
                zoomMode === 'actual' ? 'bg-white text-[#0F172A] font-medium' : 'text-[#475569]'
              }`}
            >
              1:1 (1140px)
            </button>
          </div>
        </div>
      </div>

      {/* 选中标注详情卡片（位于窗口上方，不遮挡操作区） */}
      {showAnnotations && activeAnnotation && (
        <div className="bg-white rounded-[10px] border border-[#2563EB] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="font-mono font-bold text-white bg-[#2563EB] px-1.5 py-0.5 rounded-[4px]">
                {activeAnnotation.code}
              </span>
              <span className="font-semibold text-[#0F172A] text-[13.5px]">
                {activeAnnotation.title}
              </span>
              <span className="text-[#64748B]">·</span>
              <span className="text-[#475569]">{activeAnnotation.region}</span>
              <span className="text-[#64748B]">·</span>
              <span className="font-medium text-[#B45309]">{activeAnnotation.fallbackType}</span>
            </div>
            <p className="text-[12.5px] text-[#475569] leading-relaxed">
              {activeAnnotation.summary}
            </p>
          </div>
          <pre className="bg-[#0F172A] text-[#E2E8F0] rounded-[7px] px-3.5 py-2.5 font-mono text-[11.5px] leading-relaxed overflow-x-auto shrink-0 max-w-full lg:max-w-[460px]">
            {activeAnnotation.tkRecipe}
          </pre>
        </div>
      )}

      {/* 1140×884 Windows 桌面端高保真窗口容器 */}
      <div
        ref={containerRef}
        className={`w-full flex justify-center ${zoomMode === 'actual' ? 'overflow-x-auto pb-2' : ''}`}
      >
        <div
          style={{
            width: `${1140 * appliedScale}px`,
            height: `${884 * appliedScale}px`,
          }}
          className="relative shrink-0"
        >
          {/* 严格 1140×884 逻辑像素 Tkinter 8.6 桌面主窗体 */}
          <div
            style={{
              width: '1140px',
              height: '884px',
              transform: `scale(${appliedScale})`,
              transformOrigin: 'top left',
            }}
            className="tk-window-font relative flex flex-col rounded-[8px] border border-[#94A3B8] bg-[#F3F5F8] overflow-hidden select-none text-[#0F172A]"
          >
            {/* 1. Windows 原生标题栏（34px） */}
            <div className="h-[34px] shrink-0 bg-[#EAEFF5] border-b border-[#D5DDE8] px-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-[18px] w-[18px] rounded-[4px] bg-[#2563EB] flex items-center justify-center">
                  <BookOpen className="h-3 w-3 text-white" />
                </div>
                <span className="text-[12.5px] font-medium text-[#0F172A]">
                  学习通课程文件下载器
                </span>
                <span className="text-[11.5px] text-[#64748B]">
                  · 单文件绿色版（无需安装 Office）
                </span>
              </div>

              <div className="flex items-center">
                <button
                  type="button"
                  aria-label="最小化"
                  onClick={() =>
                    pushToast('info', '保留 Windows 原生标题栏', '不启用 overrideredirect，确保系统贴靠与任务栏行为正常')
                  }
                  className="h-[34px] w-[42px] flex items-center justify-center text-[#475569] hover:bg-[#DCE3ED] cursor-pointer"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="最大化"
                  onClick={() =>
                    pushToast('info', '窗口支持自由缩放', '最小尺寸 960×720，拖拽采用 40ms <Configure> 防抖重绘')
                  }
                  className="h-[34px] w-[42px] flex items-center justify-center text-[#475569] hover:bg-[#DCE3ED] cursor-pointer"
                >
                  <Square className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="关闭窗口"
                  onClick={() =>
                    pushToast('info', '预览模式保护', '实际 exe 中点击将安全取消队列线程并保存用户目录偏好')
                  }
                  className="h-[34px] w-[42px] flex items-center justify-center text-[#475569] hover:bg-[#DC2626] hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* 2. 主工作区（850px 高，外边距 16px，左右间距 16px） */}
            <div className="flex-1 min-h-0 p-[16px] flex gap-[16px]">
              {/* 左栏：定宽 340px（课程接入 + 合成配置 + 批量下载控制底座） */}
              <div className="w-[340px] shrink-0 flex flex-col gap-[12px]">
                {/* 左栏卡片 1：课程接入与 Cookie */}
                <TkCard className="p-[14px]">
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className="text-[13.5px] font-semibold text-[#0F172A]">
                      1. 课程链接与 Cookie
                    </h2>
                    <button
                      type="button"
                      onClick={() => loadPreset(0)}
                      className="text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer whitespace-nowrap"
                    >
                      填入示例
                    </button>
                  </div>

                  {/* 课程链接 */}
                  <div className="space-y-1">
                    <label
                      htmlFor="tk-course-url"
                      className="block text-[12px] font-medium text-[#475569]"
                    >
                      学习通课程主页链接
                    </label>
                    <input
                      id="tk-course-url"
                      type="text"
                      value={courseUrl}
                      onChange={(e) => setCourseUrl(e.target.value)}
                      placeholder="粘贴 https://mooc1.chaoxing.com/mycourse/..."
                      className="w-full h-[34px] px-2.5 rounded-[7px] border border-[#CBD5E1] bg-white font-mono text-[11.5px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  {/* 浏览器 Cookie */}
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="tk-cookie-input"
                        className="text-[12px] font-medium text-[#475569]"
                      >
                        浏览器 Cookie（本地明文仅内存使用）
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMaskCookie((v) => !v)}
                          aria-label={maskCookie ? '显示 Cookie' : '隐藏 Cookie'}
                          className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                        >
                          {maskCookie ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCookieGuide(true)}
                          className="inline-flex items-center gap-1 text-[11.5px] text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer whitespace-nowrap"
                        >
                          <HelpCircle className="h-3 w-3" />
                          获取方式
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="tk-cookie-input"
                      rows={2}
                      value={
                        maskCookie && cookieText
                          ? `${cookieText.slice(0, 26)}••••••••••••••••••••••••••••`
                          : cookieText
                      }
                      onChange={(e) => {
                        setMaskCookie(false);
                        setCookieExpired(false);
                        setCookieText(e.target.value);
                      }}
                      placeholder="按 F12 → Network → 复制 Request Headers 中的 Cookie"
                      className="w-full px-2.5 py-1.5 rounded-[7px] border border-[#CBD5E1] bg-white font-mono text-[11.5px] text-[#0F172A] placeholder:text-[#94A3B8] resize-none leading-snug focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  {/* Cookie 状态指示行（图标 + 实色文本，绝不仅靠颜色传达） */}
                  <div className="mt-2 flex items-center justify-between text-[11.5px]">
                    {cookieExpired ? (
                      <span className="inline-flex items-center gap-1 text-[#B45309] font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Cookie 已过期，请重新粘贴
                      </span>
                    ) : cookieText.trim().length > 12 ? (
                      <span className="inline-flex items-center gap-1 text-[#15803D] font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        凭证格式有效（含 UID / vc3）
                      </span>
                    ) : (
                      <span className="text-[#64748B]">尚未填入浏览器 Cookie</span>
                    )}
                    {cookieText && (
                      <button
                        type="button"
                        onClick={() => {
                          setCookieText('');
                          setCookieExpired(false);
                        }}
                        className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                      >
                        清空
                      </button>
                    )}
                  </div>

                  {/* 解析按钮 */}
                  <div className="mt-3">
                    <TkButton
                      variant="secondary"
                      size="md"
                      className="w-full"
                      disabled={isParsing || runPhase === 'downloading' || runPhase === 'synthesizing'}
                      icon={<RefreshCw className={`h-3.5 w-3.5 ${isParsing ? 'animate-spin' : ''}`} />}
                      onClick={() => handleParseCourse(false)}
                    >
                      {isParsing ? '正在解析课程章节...' : '解析课程章节'}
                    </TkButton>
                  </div>
                </TkCard>

                {/* 左栏卡片 2：章节合成与导出设置 */}
                <TkCard className="p-[14px]">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[13.5px] font-semibold text-[#0F172A]">
                      2. 章节合成设置
                    </h2>
                    <span className="text-[11.5px] text-[#0F766E] font-medium">
                      本地合成 · 免 Office
                    </span>
                  </div>

                  {/* 合成格式分段选择器 */}
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-medium text-[#475569]">章节输出模式</div>
                    <TkSegmentedControl<ExportFormat>
                      value={exportFormat}
                      disabled={runPhase === 'downloading' || runPhase === 'synthesizing'}
                      onChange={(val) => {
                        setExportFormat(val);
                        appendLog(`输出模式切换为：${val === 'pdf' ? '按章合成 PDF' : val === 'pptx' ? '按章合成 PPTX' : '仅保留原文件'}`);
                      }}
                      options={[
                        { value: 'pdf', label: '按章合成 PDF' },
                        { value: 'pptx', label: '按章合成 PPTX' },
                        { value: 'raw', label: '保留原文件' },
                      ]}
                    />
                  </div>

                  {/* 图文清晰度分段选择器 */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[#475569]">
                        图文幻灯片压缩画质
                      </span>
                      <span className="text-[11px] text-[#64748B] font-mono tabular-nums">
                        {quality === 'high' ? '无损原图' : quality === 'balanced' ? 'JPEG 88%' : 'JPEG 72%'}
                      </span>
                    </div>
                    <TkSegmentedControl<QualityPreset>
                      compact
                      value={quality}
                      disabled={runPhase === 'downloading' || runPhase === 'synthesizing'}
                      onChange={setQuality}
                      options={[
                        { value: 'high', label: '高清原图' },
                        { value: 'balanced', label: '均衡推荐' },
                        { value: 'lite', label: '轻量体积' },
                      ]}
                    />
                  </div>

                  {/* 合并选项 */}
                  <div
                    onClick={() => {
                      if (runPhase !== 'downloading' && runPhase !== 'synthesizing') {
                        setMergeSlidesAndPdf((v) => !v);
                      }
                    }}
                    className="mt-3 flex items-start gap-2.5 p-2 rounded-[6px] bg-[#F8FAFC] border border-[#E8EDF4] cursor-pointer"
                  >
                    <div className="mt-0.5">
                      <TkCheckbox
                        state={mergeSlidesAndPdf ? 'checked' : 'unchecked'}
                        onClick={() => setMergeSlidesAndPdf((v) => !v)}
                        ariaLabel="自动合并每章图文幻灯片与讲义"
                      />
                    </div>
                    <div className="text-[11.5px] leading-snug">
                      <div className="font-medium text-[#0F172A]">
                        将同章图文页按顺序合并为单份 {exportFormat === 'pptx' ? 'PPTX' : 'PDF'}
                      </div>
                      <div className="text-[#64748B] mt-0.5">
                        自动按章节编号命名，保留原始 Word / PPT 附件
                      </div>
                    </div>
                  </div>

                  {/* 保存目录 */}
                  <div className="mt-3 space-y-1">
                    <label className="block text-[12px] font-medium text-[#475569]">
                      本地保存目录
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div
                        title={FOLDERS[folderIdx]}
                        className="flex-1 min-w-0 h-[32px] px-2.5 rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] flex items-center font-mono text-[11px] text-[#334155] truncate"
                      >
                        {FOLDERS[folderIdx]}
                      </div>
                      <TkButton
                        variant="secondary"
                        size="sm"
                        className="h-[32px]"
                        icon={<FolderOpen className="h-3.5 w-3.5 text-[#475569]" />}
                        onClick={() => {
                          const nextIdx = (folderIdx + 1) % FOLDERS.length;
                          setFolderIdx(nextIdx);
                          pushToast('info', '已更新保存路径', FOLDERS[nextIdx]);
                        }}
                      >
                        更改
                      </TkButton>
                    </div>
                  </div>
                </TkCard>

                {/* 左栏卡片 3：下载行动底座（固定置底） */}
                <TkCard className="p-[14px] mt-auto">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="font-semibold text-[#0F172A] tabular-nums">
                      已选 {stats.checkedCount} 项资料
                    </span>
                    <span className="font-mono text-[12px] text-[#475569] tabular-nums">
                      约 {stats.totalSize.toFixed(1)} MB
                    </span>
                  </div>
                  <div className="mt-1 text-[11.5px] text-[#64748B] tabular-nums flex items-center justify-between">
                    <span>含 {stats.totalSlides} 页图文幻灯片</span>
                    <span>预计生成 {stats.activeChapterCount} 份{formatLabel}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <TkButton
                      variant={runPhase === 'done' ? 'teal' : 'primary'}
                      size="lg"
                      className="flex-1"
                      disabled={isParsing || stats.checkedCount === 0 || cookieExpired}
                      icon={
                        runPhase === 'downloading' || runPhase === 'synthesizing' ? (
                          <Pause className="h-4 w-4" />
                        ) : runPhase === 'paused' ? (
                          <Play className="h-4 w-4" />
                        ) : runPhase === 'done' ? (
                          <FolderOpen className="h-4 w-4" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )
                      }
                      onClick={handleStartOrToggleRun}
                    >
                      {runPhase === 'downloading'
                        ? '暂停下载'
                        : runPhase === 'synthesizing'
                          ? '正在合成...'
                          : runPhase === 'paused'
                            ? '继续下载'
                            : runPhase === 'done'
                              ? '打开导出目录'
                              : exportFormat === 'raw'
                                ? '开始批量下载'
                                : `开始下载并合成 ${exportFormat.toUpperCase()}`}
                    </TkButton>

                    {(runPhase === 'paused' || runPhase === 'done') && (
                      <TkButton
                        variant="secondary"
                        size="lg"
                        className="px-3"
                        title="重置任务状态"
                        onClick={handleResetProgress}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </TkButton>
                    )}
                  </div>
                </TkCard>
              </div>

              {/* 右栏：弹性主工作区（752px） */}
              <div className="flex-1 min-w-0 flex flex-col gap-[12px]">
                {/* 右栏卡片 1：课程概览 + 类型筛选栏 */}
                <TkCard className="px-[16px] py-[12px]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h1 className="text-[15px] font-semibold text-[#0F172A] truncate">
                          {courseMeta ? courseMeta.name : '未载入课程'}
                        </h1>
                        {courseMeta && (
                          <span className="text-[12px] text-[#64748B] whitespace-nowrap">
                            · {courseMeta.instructor} · {courseMeta.term}
                          </span>
                        )}
                      </div>
                    </div>

                    {courseMeta && (
                      <div className="text-[12px] text-[#475569] font-mono tabular-nums whitespace-nowrap shrink-0">
                        {stats.chapterCount} 章 · {stats.allCount} 份资料 · {stats.totalSlides} 页幻灯片
                      </div>
                    )}
                  </div>

                  {/* 筛选与全选工具条 */}
                  <div className="mt-2.5 pt-2.5 border-t border-[#E8EDF4] flex items-center justify-between gap-2.5">
                    <div className="w-[330px] shrink-0">
                      <TkSegmentedControl<FilterType>
                        compact
                        value={typeFilter}
                        onChange={setTypeFilter}
                        options={[
                          { value: 'all', label: '全部' },
                          { value: 'slide', label: '图文页' },
                          { value: 'pdf', label: 'PDF' },
                          { value: 'docx', label: 'Word' },
                          { value: 'pptx', label: 'PPT' },
                        ]}
                      />
                    </div>

                    <div className="relative flex-1 max-w-[180px]">
                      <Search className="h-3.5 w-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索课件名..."
                        className="w-full h-[30px] pl-7 pr-2.5 rounded-[6px] border border-[#CBD5E1] bg-white text-[12px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <TkButton
                        variant="ghost"
                        size="sm"
                        disabled={chapters.length === 0}
                        onClick={() => handleSelectAll('all')}
                      >
                        全选
                      </TkButton>
                      <TkButton
                        variant="ghost"
                        size="sm"
                        disabled={chapters.length === 0}
                        onClick={() => handleSelectAll('invert')}
                      >
                        反选
                      </TkButton>
                      <TkButton
                        variant="ghost"
                        size="sm"
                        disabled={chapters.length === 0}
                        onClick={toggleExpandAll}
                      >
                        {chapters.some((c) => !c.expanded) ? '展开全部' : '折叠全部'}
                      </TkButton>
                    </div>
                  </div>
                </TkCard>

                {/* 右栏卡片 2：章节与课件虚拟滚动主列表 */}
                <TkCard className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {/* Cookie 失效告警条（实色背景+边框+图标+动作按钮） */}
                  {cookieExpired && (
                    <div className="px-4 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A] flex items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-2 text-[12px] text-[#B45309]">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                          <strong>鉴权提示：</strong>
                          学习通返回 401/重定向登录页，浏览器 Cookie 已过期，请重新复制后继续下载。
                        </span>
                      </div>
                      <TkButton
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setCookieExpired(false);
                          setCookieText(COURSE_PRESETS[0].sampleCookie);
                          pushToast('success', 'Cookie 已刷新恢复', '可继续执行课程解析或下载');
                        }}
                      >
                        一键修复示例
                      </TkButton>
                    </div>
                  )}

                  {/* 列头（固定在滚动区上方） */}
                  {chapters.length > 0 && !isParsing && (
                    <div className="h-[34px] px-4 bg-[#F8FAFC] border-b border-[#DCE2EC] flex items-center text-[11.5px] font-medium text-[#64748B] shrink-0">
                      <div className="flex-1">章节与资料名称</div>
                      <div className="w-[74px] text-right pr-3">体积</div>
                      <div className="w-[144px] text-right">下载 / 合成状态</div>
                    </div>
                  )}

                  {/* 主体内容：骨架屏 / 空状态 / 章节文件树 */}
                  {isParsing ? (
                    <TkSkeletonList />
                  ) : chapters.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center px-10 text-center">
                      <div className="h-12 w-12 rounded-[10px] bg-[#EFF5FF] border border-[#BFDBFE] flex items-center justify-center mb-3.5">
                        <FileSpreadsheet className="h-6 w-6 text-[#2563EB]" />
                      </div>
                      <h3 className="text-[15px] font-semibold text-[#0F172A]">
                        粘贴课程链接与 Cookie，批量归档学习通资料
                      </h3>
                      <p className="text-[12.5px] text-[#64748B] mt-1.5 max-w-[440px] leading-relaxed">
                        自动识别学习通图文幻灯片、PDF、Word 与 PPT 附件，按章节在本地无损合成 PDF 或 PPTX，全程单文件运行，无需安装 Office。
                      </p>

                      {/* 3 步流程条 */}
                      <div className="mt-5 grid grid-cols-3 gap-3 w-full max-w-[540px] text-left">
                        {[
                          ['01', '粘贴课程与 Cookie', '仅在本地内存发起请求'],
                          ['02', '解析并勾选章节', '支持按类型筛选或搜索'],
                          ['03', '下载并自动合成', '按章生成 PDF 或 PPTX'],
                        ].map(([num, title, desc]) => (
                          <div
                            key={num}
                            className="p-3 rounded-[8px] bg-[#F8FAFC] border border-[#E8EDF4]"
                          >
                            <div className="font-mono text-[11px] font-semibold text-[#2563EB]">
                              步骤 {num}
                            </div>
                            <div className="text-[12.5px] font-semibold text-[#0F172A] mt-0.5">
                              {title}
                            </div>
                            <div className="text-[11.5px] text-[#64748B] mt-0.5">{desc}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5">
                        <TkButton
                          variant="primary"
                          size="md"
                          icon={<Sparkles className="h-3.5 w-3.5" />}
                          onClick={() => handleParseCourse(true)}
                        >
                          载入示例课程并体验解析
                        </TkButton>
                      </div>
                    </div>
                  ) : filteredChapters.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#64748B] text-[13px]">
                      当前筛选条件下没有匹配的课程资料
                      <button
                        type="button"
                        onClick={() => {
                          setTypeFilter('all');
                          setSearchQuery('');
                        }}
                        className="mt-2 text-[#2563EB] hover:underline cursor-pointer text-[12.5px]"
                      >
                        清除筛选条件
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto tk-scrollbar">
                      {filteredChapters.map((ch) => {
                        const checkedInChapter = ch.assets.filter((a) => a.checked).length;
                        const chapterState =
                          checkedInChapter === 0
                            ? 'unchecked'
                            : checkedInChapter === ch.assets.length
                              ? 'checked'
                              : 'indeterminate';

                        return (
                          <div key={ch.id} className="border-b border-[#DCE2EC] last:border-b-0">
                            {/* 章节分组头（38px 高） */}
                            <div
                              onClick={() => toggleChapterExpand(ch.id)}
                              className="h-[38px] px-4 bg-[#F8FAFC] hover:bg-[#F1F5F9] flex items-center justify-between gap-2 cursor-pointer border-b border-[#E8EDF4]"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {ch.expanded ? (
                                  <ChevronDown className="h-4 w-4 text-[#64748B] shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-[#64748B] shrink-0" />
                                )}
                                <TkCheckbox
                                  state={chapterState}
                                  onClick={() => toggleChapterCheck(ch.id)}
                                  ariaLabel={`勾选 ${ch.index} ${ch.title}`}
                                />
                                <span className="font-mono text-[11.5px] font-semibold text-[#2563EB] shrink-0">
                                  {ch.index}
                                </span>
                                <span className="text-[12.5px] font-semibold text-[#0F172A] truncate">
                                  {ch.title}
                                </span>
                                <span className="text-[11.5px] text-[#64748B] font-mono tabular-nums shrink-0">
                                  ({checkedInChapter}/{ch.assets.length})
                                </span>
                              </div>

                              {/* 章节合成状态指示 */}
                              <div className="shrink-0 flex items-center gap-2">
                                {ch.synthesizing ? (
                                  <span className="px-2 py-0.5 rounded-[4px] bg-[#F0FDFA] border border-[#99F6E4] text-[#0F766E] text-[11px] font-medium font-mono tabular-nums">
                                    合成中 {ch.synthProgress || 0}%
                                  </span>
                                ) : ch.synthesizedFile ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#ECFDF3] border border-[#BBF7D0] text-[#15803D] text-[11px] font-medium font-mono">
                                    <CheckCircle2 className="h-3 w-3" />
                                    已生成 {ch.synthesizedFile}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* 文件行（40px 高，对齐 VirtualChapterList 规范） */}
                            {ch.expanded && (
                              <div className="divide-y divide-[#EEF2F6]">
                                {ch.assets.map((asset: CourseAsset) => (
                                  <div
                                    key={asset.id}
                                    onClick={() => toggleAsset(ch.id, asset.id)}
                                    className={`h-[40px] pl-10 pr-4 flex items-center gap-2.5 cursor-pointer ${
                                      asset.checked
                                        ? 'bg-white hover:bg-[#F5F8FD]'
                                        : 'bg-[#FAFBFD] hover:bg-[#F5F8FD]'
                                    }`}
                                  >
                                    <TkCheckbox
                                      state={asset.checked ? 'checked' : 'unchecked'}
                                      onClick={() => toggleAsset(ch.id, asset.id)}
                                      ariaLabel={`勾选 ${asset.title}`}
                                    />
                                    <AssetTypeTag type={asset.type} slidePages={asset.slidePages} />
                                    <span
                                      className={`flex-1 min-w-0 text-[12.5px] truncate ${
                                        asset.checked ? 'text-[#0F172A]' : 'text-[#64748B]'
                                      }`}
                                    >
                                      {asset.title}
                                    </span>

                                    {/* 等宽体积 */}
                                    <span className="w-[66px] text-right font-mono text-[11.5px] text-[#64748B] tabular-nums shrink-0">
                                      {asset.sizeMB.toFixed(1)} MB
                                    </span>

                                    {/* 行状态 / 内联进度条 */}
                                    <div
                                      className="w-[144px] flex items-center justify-end gap-2 shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {asset.status === 'pending' && (
                                        <span className="text-[11.5px] text-[#94A3B8]">
                                          {asset.checked ? '待下载' : '未勾选'}
                                        </span>
                                      )}
                                      {asset.status === 'downloading' && (
                                        <>
                                          <div className="w-[88px]">
                                            <TkProgressBar value={asset.progress} height={6} />
                                          </div>
                                          <span className="w-[34px] text-right font-mono text-[11.5px] font-medium text-[#2563EB] tabular-nums">
                                            {asset.progress}%
                                          </span>
                                        </>
                                      )}
                                      {asset.status === 'done' && (
                                        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#15803D]">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          已下载
                                        </span>
                                      )}
                                      {asset.status === 'error' && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[11.5px] font-medium text-[#B91C1C]">
                                            {asset.errorMessage || '失败'}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleRetryAsset(ch.id, asset.id)}
                                            className="px-2 py-0.5 rounded-[4px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] hover:bg-[#FEE2E2] text-[11px] font-medium cursor-pointer"
                                          >
                                            重试
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TkCard>

                {/* 右栏卡片 3：底部全局下载与合成进度底座 + 可展开日志 */}
                <TkCard className="px-[16px] py-[11px] shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[12.5px] font-semibold truncate ${
                          runPhase === 'done'
                            ? 'text-[#15803D]'
                            : runPhase === 'synthesizing'
                              ? 'text-[#0F766E]'
                              : 'text-[#0F172A]'
                        }`}
                      >
                        {currentTaskText}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[12px] text-[#475569] tabular-nums">
                        {runPhase === 'downloading'
                          ? `${speedMBps.toFixed(1)} MB/s`
                          : runPhase === 'synthesizing'
                            ? '本地写入中'
                            : `${Math.round(stats.overallPct)}%`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowLogDrawer((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer whitespace-nowrap"
                      >
                        <Terminal className="h-3.5 w-3.5" />
                        日志
                        {showLogDrawer ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronUp className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2">
                    <TkProgressBar
                      value={stats.overallPct}
                      phase={
                        runPhase === 'done'
                          ? 'done'
                          : runPhase === 'synthesizing'
                            ? 'synth'
                            : 'download'
                      }
                      height={8}
                    />
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-[#64748B] font-mono tabular-nums">
                    <span>
                      文件进度 {stats.doneCount} / {stats.checkedCount}
                      {stats.errorCount > 0 ? `（失败 ${stats.errorCount}）` : ''}
                    </span>
                    <span>
                      章节合成 {stats.synthesizedCount} / {stats.activeChapterCount} · 输出：{formatLabel}
                    </span>
                  </div>

                  {/* 可展开执行日志区 */}
                  {showLogDrawer && (
                    <div className="mt-2.5 pt-2.5 border-t border-[#E8EDF4]">
                      <div className="h-[104px] overflow-y-auto tk-scrollbar rounded-[6px] bg-[#F8FAFC] border border-[#DCE2EC] px-3 py-2 font-mono text-[11px] text-[#334155] space-y-1">
                        {logs.map((line, i) => (
                          <div key={i} className="leading-snug">
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TkCard>
              </div>
            </div>

            {/* 3. Cookie 获取教程弹窗（严格遵循 Tk 约束：无 backdrop-filter，使用高对比实色边框卡片） */}
            {showCookieGuide && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center"
                style={{
                  // 模拟 tkinter stipple="gray25" 点阵遮罩，非高斯模糊
                  backgroundImage:
                    'radial-gradient(#64748B 0.75px, transparent 0.75px)',
                  backgroundSize: '4px 4px',
                  backgroundColor: 'rgba(241, 245, 249, 0.78)',
                }}
              >
                <div className="w-[460px] rounded-[10px] bg-white border-2 border-[#94A3B8] p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E8EDF4]">
                    <h3 className="text-[14px] font-semibold text-[#0F172A]">
                      如何获取学习通浏览器 Cookie（30 秒）
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowCookieGuide(false)}
                      className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <ol className="mt-3 space-y-2.5 text-[12.5px] text-[#334155] list-decimal list-inside leading-relaxed">
                    <li>
                      在 Edge / Chrome 浏览器中正常登录学习通，打开要备份的课程首页。
                    </li>
                    <li>
                      按 <kbd className="px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] font-mono text-[11px]">F12</kbd> 打开开发者工具，切换到 <strong>Network（网络）</strong> 标签并刷新页面。
                    </li>
                    <li>
                      点击第一条 <code className="font-mono text-[11.5px] text-[#2563EB]">studentcourse</code> 请求，在右侧 <strong>Request Headers</strong> 中整行复制 <code className="font-mono text-[11.5px]">Cookie</code> 值。
                    </li>
                  </ol>
                  <div className="mt-3 rounded-[6px] bg-[#F8FAFC] border border-[#E8EDF4] p-2.5 text-[11.5px] text-[#64748B]">
                    Tk 降级提示：模态弹窗不使用毛玻璃模糊，实际 tkinter 使用 stipple=&quot;gray25&quot; 网格蒙版 + 2px 深灰外框保证层级聚焦。
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <TkButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCookieText(COURSE_PRESETS[0].sampleCookie);
                        setCookieExpired(false);
                        setShowCookieGuide(false);
                        pushToast('success', '已自动填入示例 Cookie');
                      }}
                    >
                      直接填入示例 Cookie
                    </TkButton>
                    <TkButton
                      variant="primary"
                      size="sm"
                      onClick={() => setShowCookieGuide(false)}
                    >
                      我知道了
                    </TkButton>
                  </div>
                </div>
              </div>
            )}

            {/* 4. 自绘 Y 轴滑入 Toast（零 opacity） */}
            <TkToast toast={toast} onClose={() => setToast(null)} />

            {/* 5. Tk 降级标注覆盖层（点击编号查阅具体降级策略） */}
            {showAnnotations && (
              <div className="pointer-events-none absolute inset-0 z-40">
                {PROTOTYPE_ANNOTATIONS.map((ann) => {
                  const isSelected = activeAnnotation?.id === ann.id;
                  return (
                    <button
                      key={ann.id}
                      type="button"
                      onClick={() => setActiveAnnotation(ann)}
                      style={{
                        left: `${ann.xPercent}%`,
                        top: `${ann.yPercent}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className={`pointer-events-auto absolute h-[28px] px-2.5 rounded-[6px] border-2 font-mono text-[11.5px] font-bold flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 ${
                        isSelected
                          ? 'bg-[#0F172A] text-white border-[#2563EB]'
                          : 'bg-[#2563EB] text-white border-white'
                      }`}
                    >
                      <span>{ann.code}</span>
                      <span className="font-sans font-medium text-[11px] max-w-[110px] truncate">
                        {ann.title.split('：')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
