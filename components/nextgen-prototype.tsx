'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FolderOpen,
  Layers,
  Link2,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Square,
  Sun,
  X,
} from 'lucide-react';
import wallpaperImg from '@/src/assets/images/win11_mica_wallpaper_1795420841218.jpg';
import {
  AssetType,
  COURSE_PRESETS,
  CourseAsset,
  CourseChapter,
  cloneChapters,
} from '@/lib/mock-course-data';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  getEnrolledCourses,
  isTauriRuntime,
  openChaoxingLoginWindow,
  parseCourseChapters,
  fetchSlideThumb,
  pollQrLogin,
  setManualCookie,
  startQrLogin,
  startBatchDownload,
  type TauriAssetItem,
  type TauriCourseSummary,
  type TauriDownloadEvent,
  type TauriParsedChapter,
} from '@/lib/tauri-bridge';

type ExportFormat = 'pdf' | 'pptx' | 'raw';
type QualityPreset = 'high' | 'balanced' | 'lite';
type FilterType = 'all' | AssetType;
type RunPhase = 'idle' | 'downloading' | 'synthesizing' | 'paused' | 'done';

interface ExtendedCourse {
  id: string;
  name: string;
  shortName: string;
  instructor: string;
  term: string;
  accentHex: string;
  folder: string;
  courseUrl?: string;
  chapters: CourseChapter[];
}

interface SlidePageMock {
  page: number;
  title: string;
  tag: '核心推导' | '图示' | '封面' | '签到/无关';
  defaultKeep: boolean;
}

const THIRD_COURSE_CHAPTERS: CourseChapter[] = [
  {
    id: 'comm-1',
    index: '第 1 章',
    title: '基带数字传输与奈奎斯特准则',
    expanded: true,
    assets: [
      {
        id: 'c-101',
        chapterId: 'comm-1',
        title: '1.1 码间串扰消除与升余弦滚降波形（图文页）',
        type: 'slide',
        sizeMB: 6.8,
        slidePages: 16,
        checked: true,
        status: 'pending',
        progress: 0,
      },
      {
        id: 'c-102',
        chapterId: 'comm-1',
        title: '1.2 眼图分析与匹配滤波器最佳接收.pdf',
        type: 'pdf',
        sizeMB: 4.2,
        checked: true,
        status: 'pending',
        progress: 0,
      },
    ],
  },
  {
    id: 'comm-2',
    index: '第 2 章',
    title: '正交调制（QPSK / QAM）与误码性能',
    expanded: true,
    assets: [
      {
        id: 'c-201',
        chapterId: 'comm-2',
        title: '2.1 信号空间星座图与格雷码映射（图文页）',
        type: 'slide',
        sizeMB: 8.5,
        slidePages: 20,
        checked: true,
        status: 'pending',
        progress: 0,
      },
      {
        id: 'c-202',
        chapterId: 'comm-2',
        title: '2.2 高斯白噪声信道下的最小错误概率推导.pptx',
        type: 'pptx',
        sizeMB: 10.4,
        checked: true,
        status: 'pending',
        progress: 0,
      },
    ],
  },
];

const INITIAL_COURSES: ExtendedCourse[] = [
  {
    id: COURSE_PRESETS[0].id,
    name: COURSE_PRESETS[0].name,
    shortName: '数字信号处理',
    instructor: COURSE_PRESETS[0].instructor,
    term: COURSE_PRESETS[0].term,
    accentHex: '#2563EB',
    folder: COURSE_PRESETS[0].defaultFolder,
    chapters: cloneChapters(COURSE_PRESETS[0].chapters),
  },
  {
    id: COURSE_PRESETS[1].id,
    name: COURSE_PRESETS[1].name,
    shortName: '统计机器学习理论',
    instructor: COURSE_PRESETS[1].instructor,
    term: COURSE_PRESETS[1].term,
    accentHex: '#0D9488',
    folder: COURSE_PRESETS[1].defaultFolder,
    chapters: cloneChapters(COURSE_PRESETS[1].chapters),
  },
  {
    id: 'comm-2026',
    name: '现代数字通信系统（选修核心）',
    shortName: '现代数字通信系统',
    instructor: '周明哲 副教授',
    term: '2026 秋',
    accentHex: '#4F46E5',
    folder: 'D:\\CourseBackup\\现代数字通信系统_2026秋',
    chapters: cloneChapters(THIRD_COURSE_CHAPTERS),
  },
];

function buildSlideThumbnails(asset: CourseAsset): SlidePageMock[] {
  const count = Math.min(8, Math.max(6, Math.round((asset.slidePages || 18) / 3)));
  const templates: Omit<SlidePageMock, 'page'>[] = [
    { title: '章节导论与学习目标', tag: '封面', defaultKeep: true },
    { title: '核心数学模型与定义推导', tag: '核心推导', defaultKeep: true },
    { title: '课堂随堂扫码签到页（可剔除）', tag: '签到/无关', defaultKeep: false },
    { title: '时域与频域响应对比图示', tag: '图示', defaultKeep: true },
    { title: '边界条件与典型例题演算', tag: '核心推导', defaultKeep: true },
    { title: '课间休息提示页（可剔除）', tag: '签到/无关', defaultKeep: false },
    { title: '离散系统实现结构框图', tag: '图示', defaultKeep: true },
    { title: '本节关键结论与复习要点', tag: '核心推导', defaultKeep: true },
  ];
  return templates.slice(0, count).map((t, i) => ({
    page: i + 1,
    ...t,
  }));
}

// Tauri 资产 -> 界面资产：把原始 objectId / 直链暂存，供下载时回传给 Rust
const TAURI_ASSET_META = new Map<string, TauriAssetItem>();

function mapTauriAsset(item: TauriAssetItem, courseKey = ''): CourseAsset {
  const uid = courseKey ? `${courseKey}#${item.id}` : item.id;
  TAURI_ASSET_META.set(uid, item);
  return {
    id: uid,
    chapterId: item.chapterId,
    title: item.title,
    type: (item.assetType as AssetType) || 'pdf',
    sizeMB: item.estimatedSizeMb ?? 0,
    slidePages: item.slideImageUrls?.length || undefined,
    checked: true,
    status: 'pending',
    progress: 0,
  };
}

function mapTauriChapters(
  chapters: TauriParsedChapter[],
  courseKey = ''
): CourseChapter[] {
  return (chapters || []).map((ch, i) => ({
    id: courseKey ? `${courseKey}#${ch.id}` : ch.id,
    index: ch.index || `第 ${i + 1} 章`,
    title: ch.title,
    expanded: i === 0,
    assets: (ch.assets || []).map((a) => mapTauriAsset(a, courseKey)),
  }));
}

function safeFolderName(name: string): string {
  return (name || '课程').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

function mapTauriCourse(c: TauriCourseSummary): ExtendedCourse {
  const name = c.name || '未命名课程';
  return {
    id: `${c.courseId}-${c.clazzId}`,
    name,
    shortName: name.length > 8 ? name.slice(0, 8) : name,
    instructor: c.instructor || '已同步',
    term: '',
    accentHex: '#2563EB',
    folder: `D:\\CourseBackup\\${safeFolderName(name)}`,
    courseUrl: c.courseUrl,
    chapters: [],
  };
}

export function NextGenPrototype() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [darkMica, setDarkMica] = useState(false);

  // 多课程书架状态
  // 桌面端不预置任何示例课程，必须扫码登录后从学习通真实拉取
  const [courses, setCourses] = useState<ExtendedCourse[]>(() =>
    isTauriRuntime() ? [] : INITIAL_COURSES
  );
  const [activeCourseId, setActiveCourseId] = useState<string>(
    isTauriRuntime() ? '' : INITIAL_COURSES[0].id
  );

  // 登录态与扫码弹窗（彻底替代 F12 复制 Cookie）
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrState, setQrState] = useState<'waiting' | 'scanned' | 'done'>('waiting');

  // 外部链接导入弹窗
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');

  // 筛选与预览抽屉
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewAsset, setPreviewAsset] = useState<CourseAsset | null>(null);
  const [excludedPagesMap, setExcludedPagesMap] = useState<Record<string, number[]>>({
    'a-101': [3, 6],
    'a-201': [3],
  });

  // 合成配置与悬浮选项
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [quality, setQuality] = useState<QualityPreset>('balanced');
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [removeJunkSlides, setRemoveJunkSlides] = useState(true);

  // 下载与合成状态
  const [runPhase, setRunPhase] = useState<RunPhase>('idle');
  const [speedMBps, setSpeedMBps] = useState(0);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [floatingNotice, setFloatingNotice] = useState<{
    id: number;
    title: string;
    detail: string;
    tone: 'success' | 'info';
  } | null>(null);

  const runPhaseRef = useRef(runPhase);
  const exportFormatRef = useRef(exportFormat);
  const activeCourseIdRef = useRef(activeCourseId);
  const coursesRef = useRef(courses);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    runPhaseRef.current = runPhase;
  }, [runPhase]);

  useEffect(() => {
    exportFormatRef.current = exportFormat;
  }, [exportFormat]);

  useEffect(() => {
    activeCourseIdRef.current = activeCourseId;
  }, [activeCourseId]);

  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const [tauriLive, setTauriLive] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrNote, setQrNote] = useState<string>('');
  const [syncError, setSyncError] = useState<string>('');
  const [courseQuery, setCourseQuery] = useState('');
  const [onlyWithContent, setOnlyWithContent] = useState(false);
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({});
  const [zoomImage, setZoomImage] = useState<{ url: string; page: number } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualCookie, setManualCookie] = useState('');
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadQrCode = async () => {
    if (!isTauriRuntime()) return;
    setQrImage(null);
    try {
      const bytes = await startQrLogin();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      setQrImage(URL.createObjectURL(blob));
    } catch (e) {
      notify('二维码获取失败', String(e), 'info');
    }
  };

  // 弹窗打开时拉真实二维码并轮询登录结果
  useEffect(() => {
    if (!showQrModal || !isTauriRuntime()) return;
    let alive = true;
    setQrState('waiting');
    void loadQrCode();

    const tick = async () => {
      if (!alive) return;
      try {
        const r = await pollQrLogin();
        if (!alive) return;
        if (r.state === 'success') {
          setQrState('done');
          if (!r.cookie) {
            notify('登录成功但没取到 Cookie', r.note || '请重试或改用外部链接', 'info');
            return;
          }
          try {
            await setManualCookie(r.cookie);
          } catch (e) {
            notify('写入会话失败', String(e), 'info');
            return;
          }
          const list = await refreshCourses();
          if (list.length === 0) {
            notify(
              '扫码已通过，但没拿到课程',
              '会话不完整，请展开下方「手动粘贴 Cookie」兜底',
              'info'
            );
            setQrState('waiting');
            setShowManual(true);
            return;
          }
          setTimeout(() => {
            setShowQrModal(false);
            setQrState('waiting');
            setQrImage(null);
          }, 600);
          notify('扫码登录成功', `已同步 ${list.length} 门已选课程`, 'success');
          return;
        }
        if (r.state === 'expired') {
          notify('二维码已失效', '点右下角「刷新二维码」重试', 'info');
          return;
        }
        setQrNote(r.note || '');
        if (r.state === 'waiting') {
          setQrState(r.scanned ? 'scanned' : 'waiting');
        }
      } catch {
        /* 网络抖动继续轮询 */
      }
      qrTimerRef.current = setTimeout(tick, 2200);
    };
    qrTimerRef.current = setTimeout(tick, 2500);

    return () => {
      alive = false;
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrModal]);

  const handleOpenFolder = async () => {
    if (!isTauriRuntime()) {
      notify('浏览器预览不支持', '请在桌面端使用', 'info');
      return;
    }
    const dir = activeCourse.folder;
    if (!dir) return;
    try {
      const opener = await import('@tauri-apps/plugin-opener');
      await opener.revealItemInDir(dir);
    } catch {
      try {
        const opener = await import('@tauri-apps/plugin-opener');
        await opener.openPath(dir);
      } catch (e2) {
        notify('打开目录失败', `${dir}\n${String(e2)}`, 'info');
      }
    }
  };

  const handleOpenLogin = async () => {
    if (!isTauriRuntime()) {
      setShowQrModal(true);
      return;
    }
    try {
      await openChaoxingLoginWindow();
      notify('已打开学习通登录窗', '在里面扫码或输账号密码，登录成功后会自动同步课程', 'info');
    } catch (e) {
      notify('打开登录窗失败', String(e), 'info');
    }
  };

  const handleManualCookie = async () => {
    const v = manualCookie.trim();
    if (!v) return;
    // 学习通认登录态至少要有这几个字段，缺一个都白搭
    const missing = ['UID', 'vc3', 'uf', 'fid'].filter((k) => !new RegExp(`${k}=`, 'i').test(v));
    if (missing.length) {
      notify(
        'Cookie 不完整',
        `缺少 ${missing.join(' / ')} 字段。请在浏览器 F12 → Network → 任意请求 → Request Headers 里复制完整的 Cookie 整行`,
        'info'
      );
      return;
    }
    try {
      await setManualCookie(v);
      const list = await refreshCourses();
      setShowManual(false);
      setManualCookie('');
      setShowQrModal(false);
      notify('已使用手动 Cookie', `同步到 ${list.length} 门课程`, 'success');
    } catch (e) {
      notify('同步失败', String(e), 'info');
    }
  };

  // 归档目录选择（原生目录选择器）
  const handleChangeFolder = async () => {
    if (!isTauriRuntime()) {
      notify('浏览器预览不支持', '请在桌面端 exe 中使用', 'info');
      return;
    }
    try {
      const dir = await openDialog({
        directory: true,
        multiple: false,
        title: '选择归档目录',
      });
      if (typeof dir === 'string' && dir) {
        setCourses((prev) =>
          prev.map((c) => (c.id === activeCourse.id ? { ...c, folder: dir } : c))
        );
        notify('归档目录已更新', dir, 'success');
      }
    } catch (e) {
      notify('选择目录失败', String(e), 'info');
    }
  };


  const refreshCourses = async (): Promise<ExtendedCourse[]> => {
    try {
      const list = await getEnrolledCourses();
      if (list && list.length) {
        const mapped = list.map(mapTauriCourse);
        setCourses(mapped);
        // 优先选中已有课件的课程，避免一进来就看到「暂无课件」
        const withContent = mapped.find((c) => c.chapters.length > 0);
        setActiveCourseId((withContent || mapped[0]).id);
        return mapped;
      }
    } catch (e) {
      const msg = String(e);
      setSyncError(msg);
      notify('同步课程失败', msg, 'info');
    }
    return [];
  };

  // 启动即尝试同步真实书架
  useEffect(() => {
    if (!isTauriRuntime()) return;
    document.documentElement.classList.add('cx-desktop');
    setTauriLive(true);
    void refreshCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 扫码登录成功后自动刷新课程
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    listen('chaoxing-login-success', async () => {
      const list = await refreshCourses();
      setQrState('done');
      setTimeout(() => {
        setShowQrModal(false);
        setQrState('waiting');
      }, 700);
      notify('学习通会话已自动接管', `已同步 ${list.length} 门已选课程`, 'success');
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify = (title: string, detail: string, tone: 'success' | 'info' = 'info') => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setFloatingNotice({ id: Date.now(), title, detail, tone });
    noticeTimerRef.current = setTimeout(() => setFloatingNotice(null), 3400);
  };

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      if (tauriLive) {
      setFitScale(1);
      return;
    }
    const availW = containerRef.current.clientWidth - 48;
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

  const EMPTY_COURSE: ExtendedCourse = {
    id: '__empty__',
    name: '尚未同步课程',
    shortName: '—',
    instructor: '—',
    term: '',
    accentHex: '#2563EB',
    folder: '',
    courseUrl: undefined,
    chapters: [],
  };

  const visibleCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    return courses.filter((c) => {
      if (onlyWithContent && c.chapters.length === 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.instructor || '').toLowerCase().includes(q)
      );
    });
  }, [courses, courseQuery, onlyWithContent]);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === activeCourseId) || courses[0] || EMPTY_COURSE,
    [courses, activeCourseId]
  );

  // 仅在用户主动选中某门课时解析一次目录（失败不重试，避免卡住）
  const loadingCourseRef = useRef<string>('');
  const triedCourseRef = useRef<Set<string>>(new Set());
  const allDoneHandledRef = useRef(false);
  const attemptedRef = useRef<number>(0);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const c = courses.find((x) => x.id === activeCourseId);
    if (!c || c.chapters.length > 0) return;
    if (loadingCourseRef.current === c.id) return;
    if (triedCourseRef.current.has(c.id)) return;
    if (!c.name || c.id === '__empty__') return;
    loadingCourseRef.current = c.id;
    triedCourseRef.current.add(c.id);
    setStatusBanner(`${c.name}：正在解析目录…`);

    const url = c.courseUrl || '';
    if (!url) return;

    (async () => {
      try {
        setStatusBanner('正在解析课程目录…');
        // 用 courseId/clazzId 拼学生学习页
        const detail = await parseCourseChapters(url);
        const mapped = mapTauriChapters(detail.chapters, c.id);
        setCourses((prev) =>
          prev.map((x) => (x.id === c.id ? { ...x, chapters: mapped } : x))
        );
        if (mapped.length === 0) {
          setCourses((prev) =>
            prev.map((x) => (x.id === c.id ? { ...x, chapters: [] } : x))
          );
          setStatusBanner(`${c.name}：该课程暂无课件，可切换其他课程`);
          // 自动尝试下一门未试过的课程（最多 3 次，避免长列表空转）
          attemptedRef.current += 1;
          if (attemptedRef.current <= 3) {
            const next = courses.find(
              (x) =>
                x.id !== c.id &&
                x.chapters.length === 0 &&
                !triedCourseRef.current.has(x.id) &&
                x.id !== '__empty__'
            );
            if (next) setActiveCourseId(next.id);
          }
        } else {
          setStatusBanner(null);
        }
      } catch (e) {
        setStatusBanner(`解析失败：${String(e)}`);
      } finally {
        loadingCourseRef.current = '';
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourseId, courses]);

  // 切换课程时清掉上一门的状态提示
  useEffect(() => {
    setStatusBanner(null);
    setPreviewAsset(null);
    setZoomImage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourseId]);

  const updateActiveChapters = (updater: (chs: CourseChapter[]) => CourseChapter[]) => {
    setCourses((prev) =>
      prev.map((course) =>
        course.id === activeCourseId ? { ...course, chapters: updater(course.chapters) } : course
      )
    );
  };

  const stats = useMemo(() => {
    const allAssets = activeCourse.chapters.flatMap((c) => c.assets);
    const checked = allAssets.filter((a) => a.checked);
    const doneCount = checked.filter((a) => a.status === 'done').length;
    const totalSize = checked.reduce((acc, a) => acc + a.sizeMB, 0);
    const excludedCount = checked.reduce(
      (acc, a) => acc + (excludedPagesMap[a.id]?.length || 0),
      0
    );
    const totalSlides = checked.reduce((acc, a) => acc + (a.slidePages || 0), 0);
    const activeChapters = activeCourse.chapters.filter((c) => c.assets.some((a) => a.checked));
    const synthDoneCount = activeChapters.filter((c) => Boolean(c.synthesizedFile)).length;

    const dlAvg =
      checked.length === 0
        ? 0
        : checked.reduce((acc, a) => acc + a.progress, 0) / checked.length;

    let overallPct = 0;
    if (runPhase === 'done') overallPct = 100;
    else if (runPhase === 'synthesizing') {
      const synthAvg =
        activeChapters.length === 0
          ? 100
          : activeChapters.reduce(
              (acc, c) => acc + (c.synthesizedFile ? 100 : c.synthProgress || 0),
              0
            ) / activeChapters.length;
      overallPct = 76 + synthAvg * 0.24;
    } else if (runPhase === 'downloading' || runPhase === 'paused') {
      overallPct = dlAvg * (exportFormat === 'raw' ? 1 : 0.76);
    }

    return {
      allCount: allAssets.length,
      checkedCount: checked.length,
      doneCount,
      totalSize,
      totalSlides,
      excludedCount,
      activeChapterCount: activeChapters.length,
      synthDoneCount,
      overallPct,
    };
  }, [activeCourse, excludedPagesMap, runPhase, exportFormat]);

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeCourse.chapters
      .map((ch) => ({
        ...ch,
        assets: ch.assets.filter((a) => {
          const matchType = typeFilter === 'all' || a.type === typeFilter;
          const matchQ =
            !q || a.title.toLowerCase().includes(q) || ch.title.toLowerCase().includes(q);
          return matchType && matchQ;
        }),
      }))
      .filter((ch) => ch.assets.length > 0);
  }, [activeCourse, typeFilter, searchQuery]);

  // 并发下载与本地无 Office 合成模拟循环
  useEffect(() => {
    if (tauriLive) return; // 桌面端走 Rust 真实流水线，禁用本地模拟
    if (runPhase !== 'downloading' && runPhase !== 'synthesizing') return;

    const timer = setInterval(() => {
      const targetCourseId = activeCourseIdRef.current;
      const targetCourse = coursesRef.current.find((c) => c.id === targetCourseId);
      if (!targetCourse) return;

      if (runPhaseRef.current === 'downloading') {
        setSpeedMBps(Number((8.4 + Math.random() * 5.2).toFixed(1)));
        const nextChapters = targetCourse.chapters.map((c) => ({
          ...c,
          assets: c.assets.map((a) => ({ ...a })),
        }));
        const checked = nextChapters.flatMap((c) => c.assets).filter((a) => a.checked);
        const pending = checked.filter((a) => a.status !== 'done');

        if (pending.length === 0) {
          if (exportFormatRef.current === 'raw') {
            setRunPhase('done');
            setSpeedMBps(0);
            setStatusBanner(`已并行下载 ${checked.length} 份原文件`);
            notify(
              '下载完成（原生系统通知）',
              `已保存 ${checked.length} 份原始资料至 ${targetCourse.folder}`,
              'success'
            );
          } else {
            setRunPhase('synthesizing');
            setSpeedMBps(0);
            setStatusBanner(
              `Rust 引擎正在无损合成章节 ${exportFormatRef.current.toUpperCase()}（自动过滤已剔除页）...`
            );
          }
          return;
        }

        // Rust tokio 4 路并发下载
        pending.slice(0, 4).forEach((item, idx) => {
          item.status = 'downloading';
          const delta = idx === 0 ? 22 : idx === 1 ? 18 : 15;
          item.progress = Math.min(100, item.progress + delta);
          if (item.progress >= 100) item.status = 'done';
        });

        setCourses((prev) =>
          prev.map((c) => (c.id === targetCourseId ? { ...c, chapters: nextChapters } : c))
        );
        setStatusBanner(`Tokio 4 路并发下载：${pending[0].title}`);
      } else if (runPhaseRef.current === 'synthesizing') {
        const ext = exportFormatRef.current === 'pptx' ? 'pptx' : 'pdf';
        const nextChapters = targetCourse.chapters.map((c) => ({ ...c }));
        const pendingChs = nextChapters.filter(
          (c) => c.assets.some((a) => a.checked) && !c.synthesizedFile
        );

        if (pendingChs.length === 0) {
          const totalOut = nextChapters.filter((c) => c.synthesizedFile).length;
          setRunPhase('done');
          setStatusBanner(`已生成 ${totalOut} 份章节 ${ext.toUpperCase()} · 零 Office 依赖`);
          notify(
            `全部合成完成（${totalOut} 份 ${ext.toUpperCase()}）`,
            `已自动应用剔页规则并输出至 ${targetCourse.folder}`,
            'success'
          );
          return;
        }

        const cur = pendingChs[0];
        cur.synthesizing = true;
        const pct = Math.min(100, (cur.synthProgress || 0) + 40);
        cur.synthProgress = pct;
        setStatusBanner(`正在合成 ${cur.index}_${cur.title.slice(0, 12)}.${ext} (${pct}%)`);
        if (pct >= 100) {
          cur.synthesizing = false;
          cur.synthesizedFile = `${cur.index.replace(/\s+/g, '')}.${ext}`;
        }

        setCourses((prev) =>
          prev.map((c) => (c.id === targetCourseId ? { ...c, chapters: nextChapters } : c))
        );
      }
    }, 150);

    return () => clearInterval(timer);
  }, [runPhase]);

  const runRealPipeline = async () => {
    const jobs = activeCourse.chapters
      .map((c) => ({ chapter: c, assets: c.assets.filter((a) => a.checked) }))
      .filter((x) => x.assets.length > 0);

    if (!jobs.length) {
      notify('请先勾选资料', '至少选中 1 份课程资料后开始下载');
      return;
    }

    allDoneHandledRef.current = false;
    setShowSettingsPopover(false);
    setRunPhase('downloading');
    setStatusBanner('Rust 内核并发下载中…');

    const excluded: Record<string, number[]> = {};
    Object.keys(excludedPagesMap).forEach((k) => {
      if (excludedPagesMap[k]?.length) excluded[k] = excludedPagesMap[k];
    });

    try {
      await startBatchDownload(
        {
          cookie: '',
          outputDir: activeCourse.folder,
          exportFormat,
          quality,
          chapters: jobs.map(({ chapter, assets }) => ({
            id: chapter.id,
            index: chapter.index,
            title: chapter.title,
            assets: assets.map(
              (a) =>
                TAURI_ASSET_META.get(a.id) ?? {
                  id: a.id,
                  chapterId: chapter.id,
                  title: a.title,
                  assetType: a.type,
                  objectId: '',
                  downloadUrl: '',
                  slideImageUrls: [],
                  estimatedSizeMb: a.sizeMB,
                }
            ),
          })),
          excludedPages: excluded,
        },
        (ev: TauriDownloadEvent) => {
          if (ev.event === 'assetProgress') {
            const { assetId, progress, status } = ev.data;
            updateActiveChapters((chs) =>
              chs.map((c) => ({
                ...c,
                assets: c.assets.map((a) =>
                  a.id === assetId
                    ? {
                        ...a,
                        progress,
                        status:
                          status === 'done'
                            ? 'done'
                            : status === 'synthesizing'
                              ? 'synthesizing'
                              : 'downloading',
                      }
                    : a
                ),
              }))
            );
            setSpeedMBps(Math.max(0.6, Math.round((progress / 100) * 9.4 * 10) / 10));
          } else if (ev.event === 'chapterSynthesizing') {
            const { chapterId, progress } = ev.data;
            setRunPhase('synthesizing');
            setStatusBanner('纯 Rust 合成 PDF / PPTX 中…');
            updateActiveChapters((chs) =>
              chs.map((c) =>
                c.id === chapterId ? { ...c, synthesizing: true, synthProgress: progress } : c
              )
            );
          } else if (ev.event === 'chapterDone') {
            const { chapterId, outputFile } = ev.data;
            updateActiveChapters((chs) =>
              chs.map((c) =>
                c.id === chapterId
                  ? {
                      ...c,
                      synthesizing: false,
                      synthProgress: 100,
                      synthesizedFile: outputFile,
                      assets: c.assets.map((a) => ({ ...a, status: 'done', progress: 100 })),
                    }
                  : c
              )
            );
          } else if (ev.event === 'allDone') {
            if (allDoneHandledRef.current) return;
            allDoneHandledRef.current = true;
            setRunPhase('done');
            setSpeedMBps(0);
            setStatusBanner(`已输出 ${ev.data.totalFiles} 个文件 → ${ev.data.outputDir}`);
            notify('全部完成', `共 ${ev.data.totalFiles} 个文件，已保存到 ${ev.data.outputDir}`, 'success');
          } else if (ev.event === 'error') {
            notify('任务出错', ev.data.message, 'info');
          }
        }
      );
    } catch (e) {
      setRunPhase('idle');
      setStatusBanner(null);
      notify('下载未启动', String(e), 'info');
    }
  };

  const handleToggleRun = () => {
    if (!courses.length) {
      notify('还没有课程', '请先点「扫码重连」用学习通 App 扫码同步课程', 'info');
      return;
    }
    if (tauriLive) {
      if (runPhase === 'downloading' || runPhase === 'synthesizing') {
        notify('暂不支持暂停', 'Rust 并发管线会一次性跑完，可关闭窗口中止');
        return;
      }
      if (runPhase === 'done') {
        void handleOpenFolder();
        return;
      }
      void runRealPipeline();
      return;
    }
    if (stats.checkedCount === 0) {
      notify('请先勾选资料', '至少选中 1 份课程资料后开始下载');
      return;
    }
    if (runPhase === 'downloading' || runPhase === 'synthesizing') {
      setRunPhase('paused');
      setSpeedMBps(0);
      setStatusBanner('下载已暂停，支持断点续传');
      return;
    }
    if (runPhase === 'paused') {
      setRunPhase('downloading');
      return;
    }
    if (runPhase === 'done') {
      notify('已调用系统文件管理器', `定位至 ${activeCourse.folder}`, 'success');
      return;
    }

    updateActiveChapters((chs) =>
      chs.map((c) => ({
        ...c,
        expanded: true,
        synthesizedFile: undefined,
        synthesizing: false,
        synthProgress: 0,
        assets: c.assets.map((a) => ({
          ...a,
          status: a.checked ? 'pending' : a.status,
          progress: a.checked ? 0 : a.progress,
        })),
      }))
    );
    setShowSettingsPopover(false);
    setRunPhase('downloading');
  };

  const handleResetRun = () => {
    setRunPhase('idle');
    setSpeedMBps(0);
    setStatusBanner(null);
    updateActiveChapters((chs) =>
      chs.map((c) => ({
        ...c,
        synthesizedFile: undefined,
        synthesizing: false,
        synthProgress: 0,
        assets: c.assets.map((a) => ({ ...a, status: 'pending', progress: 0 })),
      }))
    );
  };

  const handleSimulateQrLogin = async () => {
    if (tauriLive) {
      try {
        await openChaoxingLoginWindow();
        notify('已打开学习通登录窗', '用学习通 App 扫码，登录成功后会自动同步课程', 'info');
      } catch (e) {
        notify('无法打开登录窗', String(e), 'info');
      }
      return;
    }
    setQrState('scanned');
    setTimeout(() => {
      setQrState('done');
      setTimeout(() => {
        setShowQrModal(false);
        setQrState('waiting');
        notify(
          '学习通会话已自动接管',
          '已同步本学期 3 门已选课程，全程无需手动复制 Cookie',
          'success'
        );
      }, 650);
    }, 800);
  };

  const handleImportExternalUrl = async () => {
    if (!externalUrl.trim()) return;
    const url = externalUrl.trim();

    if (tauriLive) {
      setShowUrlModal(false);
      setExternalUrl('');
      setStatusBanner('正在解析课程目录…');
      try {
        const detail = await parseCourseChapters(url);
        const name = detail.name || '外部课程';
        const extId = `ext-${Date.now()}`;
        const course: ExtendedCourse = {
          id: extId,
          name,
          shortName: name.length > 8 ? name.slice(0, 8) : name,
          instructor: detail.instructor || '已同步',
          term: '',
          accentHex: '#0D9488',
          folder: `D:\\CourseBackup\\${safeFolderName(name)}`,
          chapters: mapTauriChapters(detail.chapters, extId),
        };
        setCourses((prev) => [course, ...prev]);
        setActiveCourseId(course.id);
        setStatusBanner(null);
        notify('课程目录已解析', `共 ${detail.chapters.length} 章`, 'success');
      } catch (e) {
        setStatusBanner(null);
        notify('解析失败', String(e), 'info');
      }
      return;
    }

    setShowUrlModal(false);
    setExternalUrl('');
    notify('外部课程链接解析完成', '已复用当前 WebView2 登录态载入课程目录', 'success');
  };

  const toggleExcludedPage = (assetId: string, pageNum: number) => {
    setExcludedPagesMap((prev) => {
      const list = prev[assetId] || [];
      const exists = list.includes(pageNum);
      return {
        ...prev,
        [assetId]: exists ? list.filter((p) => p !== pageNum) : [...list, pageNum],
      };
    });
  };

  // 打开预览抽屉时，按需拉取真实页面图
  useEffect(() => {
    if (!previewAsset || !isTauriRuntime()) return;
    const meta = TAURI_ASSET_META.get(previewAsset.id);
    const urls = meta?.slideImageUrls || [];
    if (!urls.length) return;

    let alive = true;
    (async () => {
      for (let i = 0; i < urls.length; i++) {
        const key = `${previewAsset.id}#${i + 1}`;
        if (thumbCache[key]) continue;
        try {
          const dataUrl = await fetchSlideThumb(urls[i]);
          if (!alive) return;
          setThumbCache((prev) => ({ ...prev, [key]: dataUrl }));
        } catch {
          /* 单页失败不影响其他 */
        }
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewAsset]);

  useEffect(() => {
    if (!zoomImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomImage]);

  const previewSlides = useMemo(
    () => (previewAsset ? buildSlideThumbnails(previewAsset) : []),
    [previewAsset]
  );

  // 统一明暗 Mica 样式配对
  const theme = darkMica
    ? {
        shellBg: 'bg-slate-950/75 border-white/15 text-slate-100',
        sidebarBg: 'bg-slate-900/55 border-white/10',
        mainBg: 'bg-slate-900/92',
        cardBg: 'bg-slate-800/70 border-white/10',
        rowHover: 'hover:bg-white/[0.04]',
        divider: 'border-white/10',
        textPrimary: 'text-slate-100',
        textSecondary: 'text-slate-300',
        textMuted: 'text-slate-400',
        inputBg: 'bg-slate-950/70 border-white/15 text-slate-100 placeholder:text-slate-500',
        dockBg: 'bg-slate-900/88 border-white/15',
        segBg: 'bg-slate-950/80',
        segThumb: 'bg-slate-800 border-white/15',
      }
    : {
        shellBg: 'bg-white/62 border-white/80 text-slate-900',
        sidebarBg: 'bg-white/45 border-slate-200/70',
        mainBg: 'bg-white/94',
        cardBg: 'bg-white border-slate-200/80',
        rowHover: 'hover:bg-slate-50/90',
        divider: 'border-slate-200/75',
        textPrimary: 'text-slate-900',
        textSecondary: 'text-slate-600',
        textMuted: 'text-slate-500',
        inputBg: 'bg-white/90 border-slate-200 text-slate-900 placeholder:text-slate-400',
        dockBg: 'bg-white/86 border-slate-200/90',
        segBg: 'bg-slate-100/90',
        segThumb: 'bg-white border-slate-200/90',
      };

  return (
    <div className={tauriLive ? "fixed inset-0 overflow-hidden" : "space-y-4"}>
      {!tauriLive && (
      <>
      <div className="bg-white rounded-[10px] border border-[#DCE2EC] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[#475569]">
          <span className="font-semibold text-[#0F172A]">推荐架构：Tauri 2 (Rust + WebView2)</span>
          <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
          <span>独立单文件约 10–14 MB</span>
          <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
          <span>内置扫码免抄 Cookie</span>
          <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
          <span>点击任意「图文页」可体验合成前可视化剔页</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-[7px] bg-[#EFF5FF] text-[#1D4ED8] border border-[#BFDBFE] hover:bg-[#DBEAFE] cursor-pointer whitespace-nowrap"
          >
            <QrCode className="h-3.5 w-3.5" />
            演示扫码免 Cookie 登录
          </button>
          <button
            type="button"
            onClick={() => setDarkMica((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-[7px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            {darkMica ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5 text-slate-600" />}
            {darkMica ? '切换浅色 Mica' : '切换深色 Mica'}
          </button>
        </div>
      </div>
      </>
      )}

      {/* 桌面环境舞台（铺设生成的极简浅蓝白瓷壁纸，让 Windows 11 Mica 玻璃产生真实通透折射） */}
      <div
        ref={containerRef}
        className={
          tauriLive
            ? "relative w-full h-full overflow-hidden"
            : "relative rounded-[16px] border border-[#CBD5E1] overflow-hidden p-6 flex justify-center items-center"
        }
        style={tauriLive ? { width: '100vw', height: '100vh' } : undefined}
      >
        {!tauriLive && (
        <Image
          src={wallpaperImg}
          alt="Windows 11 architectural porcelain silk backdrop"
          fill
          referrerPolicy="no-referrer"
          className={`object-cover transition-all duration-500 ${
            darkMica ? 'brightness-[0.38] contrast-[1.15] saturate-[1.1]' : 'brightness-100'
          }`}
          priority
        />
        )}

        {/* 等比缩放外壳 */}
        <div
          style={
            tauriLive
              ? { width: '100%', height: '100%' }
              : {
                  width: `${1140 * fitScale}px`,
                  height: `${884 * fitScale}px`,
                }
          }
          className="relative z-10 shrink-0"
        >
          {/* 1140×884 无边框 Windows 11 Fluent Mica 独立桌面窗口 */}
          <div
            style={
              tauriLive
                ? { width: '100%', height: '100%' }
                : {
                    width: '1140px',
                    height: '884px',
                    transform: `scale(${fitScale})`,
                    transformOrigin: 'top left',
                  }
            }
            className={`${
              darkMica ? 'dark' : ''
            } relative flex flex-col ${tauriLive ? (darkMica ? 'bg-slate-950' : 'bg-[#F3F5F8]') + ' overflow-hidden select-none transition-colors duration-300' : 'rounded-[14px] border backdrop-blur-2xl shadow-[0_28px_70px_-14px_rgba(15,23,42,0.28),0_6px_20px_-4px_rgba(15,23,42,0.12)] overflow-hidden select-none transition-colors duration-300 ' + theme.shellBg}`}
          >
            {/* 无边框集成式标题栏（38px，原生 Win11 Snap 拖拽区） */}
            <div
              data-tauri-drag-region
              className={`h-[38px] shrink-0 px-4 flex items-center justify-between border-b ${theme.divider}`}
            >
              <div data-tauri-drag-region className="flex items-center gap-2.5">
                <div data-tauri-drag-region className="h-[20px] w-[20px] rounded-[6px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center shadow-sm">
                  <BookOpen className="h-3 w-3 text-white" />
                </div>
                <span data-tauri-drag-region className={`text-[12.5px] font-semibold tracking-tight ${theme.textPrimary}`}>
                  学习通课程归档助手
                </span>
                <span data-tauri-drag-region className={`text-[11.5px] ${theme.textMuted}`}>
                  · 离线归档与章节合成
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDarkMica((v) => !v)}
                  title="切换明暗主题"
                  className={`h-[26px] w-[28px] rounded-[6px] flex items-center justify-center transition-colors cursor-pointer ${
                    darkMica
                      ? 'text-slate-300 hover:bg-white/10'
                      : 'text-slate-600 hover:bg-slate-900/5'
                  }`}
                >
                  {darkMica ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </button>
                <div className="w-[1px] h-3.5 bg-slate-400/25 mx-1" />
                <button
                  type="button"
                  aria-label="最小化"
                  onClick={() => {
                    if (isTauriRuntime()) void getCurrentWindow().minimize();
                  }}
                  className={`h-[28px] w-[36px] rounded-[6px] flex items-center justify-center transition-colors cursor-pointer ${
                    darkMica ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-900/5'
                  }`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="最大化"
                  onClick={() => {
                    if (isTauriRuntime()) void getCurrentWindow().toggleMaximize();
                  }}
                  className={`h-[28px] w-[36px] rounded-[6px] flex items-center justify-center transition-colors cursor-pointer ${
                    darkMica ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-900/5'
                  }`}
                >
                  <Square className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={() => {
                    if (isTauriRuntime()) void getCurrentWindow().close();
                  }}
                  className="h-[28px] w-[36px] rounded-[6px] flex items-center justify-center text-slate-500 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* 窗口内部双栏架构：左侧 Mica 课程书架 (252px) + 右侧沉浸工作画布 */}
            <div className="flex-1 min-h-0 flex relative">
              {/* 左侧 Mica 磨砂玻璃侧边栏 */}
              <aside
                className={`w-[252px] shrink-0 border-r flex flex-col min-h-0 ${theme.sidebarBg}`}
              >
                <div className="p-3.5 flex flex-col min-h-0 flex-1 gap-4">
                  {/* 登录状态卡 */}
                  <div
                    className={`rounded-[10px] border p-3 transition-colors ${
                      darkMica
                        ? 'bg-white/[0.05] border-white/10'
                        : 'bg-white/75 border-white shadow-[0_1px_4px_rgba(15,23,42,0.04)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-[9px] bg-gradient-to-br from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center shrink-0">
                        <QrCode className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[13px] font-semibold truncate ${theme.textPrimary}`}>
                          {courses.length > 0 ? '学习通已连接' : '未登录'}
                        </div>
                        <div className={`text-[11px] truncate ${theme.textMuted}`}>
                          {courses.length > 0
                            ? `已同步 ${courses.length} 门课程`
                            : '扫码同步已选课程与课件'}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] ${theme.divider}`}
                    >
                      <span
                        className={
                          courses.length > 0
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : `${theme.textMuted} font-medium`
                        }
                      >
                        {courses.length > 0 ? '会话有效' : '尚未登录'}
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenLogin}
                        className="text-[#2563EB] dark:text-blue-400 font-medium hover:underline cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {courses.length > 0 ? '重新登录' : '登录学习通'}
                      </button>
                    </div>
                  </div>

                  {/* 自动同步的已选课程列表 */}
                  <div className="flex flex-col min-h-0 flex-1">
                    {/* 课程搜索 + 过滤 */}
                    <div className="px-1 mb-2 shrink-0 space-y-1.5">
                      <div
                        className={`flex items-center gap-1.5 h-[30px] rounded-[7px] border px-2 ${
                          darkMica
                            ? 'bg-white/[0.06] border-white/15'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <Search className={`h-3 w-3 shrink-0 ${theme.textMuted}`} />
                        <input
                          value={courseQuery}
                          onChange={(e) => setCourseQuery(e.target.value)}
                          placeholder="搜索课程…"
                          className={`flex-1 min-w-0 bg-transparent outline-none text-[11.5px] ${theme.textPrimary} placeholder:text-slate-400`}
                        />
                        {courseQuery && (
                          <button
                            type="button"
                            onClick={() => setCourseQuery('')}
                            className={`shrink-0 cursor-pointer ${theme.textMuted} hover:text-slate-600`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <label
                        className={`flex items-center gap-1.5 px-1 cursor-pointer select-none text-[10.5px] ${theme.textMuted}`}
                      >
                        <input
                          type="checkbox"
                          checked={onlyWithContent}
                          onChange={(e) => setOnlyWithContent(e.target.checked)}
                          className="accent-[#2563EB] cursor-pointer"
                        />
                        只显示已加载课件的课程
                      </label>
                    </div>

                    <div className="px-1.5 mb-2 shrink-0 flex items-center justify-between">
                      <span className={`text-[11.5px] font-semibold ${theme.textMuted}`}>
                        已选课程 ({visibleCourses.length}/{courses.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowUrlModal(true)}
                        title="粘贴单门课程链接"
                        className={`inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer ${
                          darkMica ? 'text-blue-400 hover:text-blue-300' : 'text-[#2563EB] hover:text-[#1D4ED8]'
                        }`}
                      >
                        <Plus className="h-3 w-3" />
                        外部链接
                      </button>
                    </div>

                    <div className="space-y-1 overflow-y-auto tk-scrollbar pr-1 flex-1 min-h-0">
                      {visibleCourses.length === 0 && courses.length > 0 && (
                        <div className={`px-1.5 py-6 text-center text-[11px] ${theme.textMuted}`}>
                          没有匹配的课程
                        </div>
                      )}
                      {visibleCourses.map((course) => {
                        const isSelected = course.id === activeCourseId;
                        const totalItems = course.chapters.reduce((a, c) => a + c.assets.length, 0);
                        return (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => {
                              if (runPhase === 'downloading' || runPhase === 'synthesizing') {
                                notify('当前课程正在执行下载', '请先暂停或等待当前课程合成完成');
                                return;
                              }
                              setActiveCourseId(course.id);
                              setPreviewAsset(null);
                              setRunPhase('idle');
                              setStatusBanner(null);
                            }}
                            className={`relative w-full text-left px-3 py-2.5 rounded-[9px] transition-all cursor-pointer ${
                              isSelected
                                ? darkMica
                                  ? 'bg-white/12 text-white'
                                  : 'bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] text-slate-900'
                                : darkMica
                                  ? 'text-slate-300 hover:bg-white/[0.06]'
                                  : 'text-slate-700 hover:bg-white/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12.5px] font-semibold truncate">
                                {course.shortName}
                              </span>
                              <span
                                className={`font-mono text-[11px] tabular-nums shrink-0 ${theme.textMuted}`}
                              >
                                {totalItems}份
                              </span>
                            </div>
                            <div className={`mt-0.5 text-[11px] truncate ${theme.textMuted}`}>
                              {course.instructor} · {course.chapters.length} 章
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 底部归档目录速览 */}
                <div
                  className={`rounded-[10px] border p-3 space-y-2 ${
                    darkMica ? 'bg-white/[0.04] border-white/10' : 'bg-white/65 border-white/90'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className={`font-medium ${theme.textSecondary}`}>本地归档路径</span>
                    <button
                      type="button"
                      onClick={handleChangeFolder}
                      className="text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      更改
                    </button>
                  </div>
                  <div
                    title={activeCourse.folder}
                    className={`font-mono text-[10.5px] truncate ${theme.textMuted}`}
                  >
                    {activeCourse.folder}
                  </div>
                  <div className={`text-[11px] ${theme.textMuted}`}>
                    纯 Rust 引擎合成 PDF / PPTX · 免 Office
                  </div>
                </div>
              </aside>

              {/* 右侧主画布 + 可滑出幻灯片剔页抽屉 */}
              <div className={`flex-1 min-w-0 relative flex ${theme.mainBg}`}>
                {/* 章节清单主区 */}
                <div className="flex-1 min-w-0 flex flex-col relative">
                  {/* 顶部课程头与筛选区 */}
                  <div className={`px-6 pt-5 pb-4 border-b shrink-0 ${theme.divider}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className={`text-[18px] font-bold tracking-tight truncate ${theme.textPrimary}`}>
                          {activeCourse.name}
                        </h2>
                        <div className={`mt-1 flex items-center gap-2 text-[12px] ${theme.textMuted}`}>
                          <span>{activeCourse.instructor}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeCourse.term}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {activeCourse.chapters.length} 章 / {stats.allCount} 份课件 / {stats.totalSlides} 页图文
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const firstSlide = activeCourse.chapters
                              .flatMap((c) => c.assets)
                              .find((a) => a.type === 'slide');
                            if (firstSlide) setPreviewAsset(firstSlide);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            darkMica
                              ? 'bg-white/[0.06] border-white/15 text-slate-200 hover:bg-white/10'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5 text-[#2563EB]" />
                          预览图文选页
                        </button>
                      </div>
                    </div>

                    {/* 筛选与搜索条 */}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      {/* GPU 弹簧分段筛选器 */}
                      <div className={`relative inline-flex p-1 rounded-[9px] ${theme.segBg}`}>
                        {(
                          [
                            ['all', '全部'],
                            ['slide', '图文幻灯片'],
                            ['pdf', 'PDF'],
                            ['docx', 'Word'],
                            ['pptx', 'PPT'],
                          ] as const
                        ).map(([key, label]) => {
                          const active = typeFilter === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setTypeFilter(key)}
                              className={`relative px-3 py-1 text-[12px] rounded-[7px] cursor-pointer whitespace-nowrap transition-colors ${
                                active
                                  ? `font-semibold ${theme.textPrimary}`
                                  : `${theme.textMuted} hover:${theme.textPrimary}`
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="nextgen-filter-pill"
                                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                                  className={`absolute inset-0 rounded-[7px] border shadow-xs ${theme.segThumb}`}
                                />
                              )}
                              <span className="relative z-10">{label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative w-[176px]">
                          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索章节或课件..."
                            className={`w-full h-[30px] pl-8 pr-2.5 rounded-[8px] border text-[12px] focus:outline-none focus:border-[#2563EB] ${theme.inputBg}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const allChecked =
                              activeCourse.chapters.length > 0 &&
                              activeCourse.chapters.every((c) =>
                                c.assets.every((a) => a.checked)
                              );
                            updateActiveChapters((chs) =>
                              chs.map((c) => ({
                                ...c,
                                assets: c.assets.map((a) => ({
                                  ...a,
                                  checked: !allChecked,
                                })),
                              }))
                            );
                            notify(
                              allChecked ? '已取消全选' : '已全选',
                              `${activeCourse.chapters.reduce(
                                (n, c) => n + c.assets.length,
                                0
                              )} 份课件`,
                              'info'
                            );
                          }}
                          className={`px-2.5 py-1 text-[12px] rounded-[7px] cursor-pointer whitespace-nowrap ${theme.textSecondary} ${theme.rowHover}`}
                        >
                          {activeCourse.chapters.length > 0 &&
                          activeCourse.chapters.every((c) =>
                            c.assets.every((a) => a.checked)
                          )
                            ? '取消全选'
                            : '全选'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 实时任务细进度条（仅运行中或完成后优雅滑出） */}
                  {/* 页面放大预览 */}
            <AnimatePresence>
              {zoomImage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setZoomImage(null)}
                  className="absolute inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
                >
                  <motion.div
                    initial={{ scale: 0.94 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="max-w-full max-h-full flex flex-col items-center gap-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={zoomImage.url}
                      alt={`第 ${zoomImage.page} 页`}
                      className="max-w-full max-h-[80vh] object-contain rounded-[10px] shadow-2xl"
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] text-white/80">第 {zoomImage.page} 页</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomImage(null);
                        }}
                        className="px-3 py-1 rounded-[6px] bg-white/15 hover:bg-white/25 text-white text-[12px] cursor-pointer"
                      >
                        关闭 (Esc)
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
                    {statusBanner && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`overflow-hidden border-b shrink-0 ${theme.divider}`}
                      >
                        <div className="px-6 py-2.5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2.5 min-w-0 text-[12px]">
                            <span
                              className={`font-medium truncate ${
                                runPhase === 'done'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : runPhase === 'synthesizing'
                                    ? 'text-teal-600 dark:text-teal-400'
                                    : theme.textPrimary
                              }`}
                            >
                              {statusBanner}
                            </span>
                          </div>
                          <div className={`font-mono text-[11.5px] tabular-nums shrink-0 ${theme.textMuted}`}>
                            {runPhase === 'downloading'
                              ? `${speedMBps.toFixed(1)} MB/s · ${Math.round(stats.overallPct)}%`
                              : `${Math.round(stats.overallPct)}%`}
                          </div>
                        </div>
                        <div className="h-[3px] w-full bg-slate-200/70 dark:bg-white/10">
                          <motion.div
                            className={`h-full ${
                              runPhase === 'done'
                                ? 'bg-emerald-500'
                                : runPhase === 'synthesizing'
                                  ? 'bg-teal-500'
                                  : 'bg-[#2563EB]'
                            }`}
                            animate={{ width: `${stats.overallPct}%` }}
                            transition={{ duration: 0.16, ease: 'easeOut' }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 章节与课件流（留足底部空间给悬浮操作岛） */}
                  <div className="flex-1 min-h-0 overflow-y-auto tk-scrollbar px-6 py-4 pb-28 space-y-3">
                    {courses.length === 0 && (
                      <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 text-center">
                        <BookOpen className="h-10 w-10 text-slate-300" />
                        <div className={`text-[14px] font-semibold ${theme.textPrimary}`}>
                          还没有同步课程
                        </div>
                        <div className={`text-[12px] max-w-[320px] leading-relaxed ${theme.textMuted}`}>
                          点左下角「扫码重连」，用学习通 App 扫一扫，即可自动同步本学期已选课程与课件。
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenLogin}
                          className="mt-1 px-4 py-2 text-[12px] font-semibold rounded-[8px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white cursor-pointer"
                        >
                          立即登录学习通
                        </button>
                      </div>
                    )}
                    {filteredChapters.map((ch) => {
                      const chChecked = ch.assets.filter((a) => a.checked).length;
                      const allChChecked = chChecked === ch.assets.length;

                      return (
                        <div
                          key={ch.id}
                          className={`rounded-[11px] border overflow-hidden transition-colors ${theme.cardBg}`}
                        >
                          {/* 章节头 */}
                          <div
                            onClick={() =>
                              updateActiveChapters((chs) =>
                                chs.map((item) =>
                                  item.id === ch.id ? { ...item, expanded: !item.expanded } : item
                                )
                              )
                            }
                            className={`px-4 h-[42px] flex items-center justify-between gap-3 cursor-pointer ${
                              darkMica ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-slate-50/75 hover:bg-slate-100/70'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {ch.expanded ? (
                                <ChevronDown className={`h-4 w-4 shrink-0 ${theme.textMuted}`} />
                              ) : (
                                <ChevronRight className={`h-4 w-4 shrink-0 ${theme.textMuted}`} />
                              )}
                              <button
                                type="button"
                                aria-label={`勾选${ch.index}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateActiveChapters((chs) =>
                                    chs.map((item) =>
                                      item.id === ch.id
                                        ? {
                                            ...item,
                                            assets: item.assets.map((a) => ({
                                              ...a,
                                              checked: !allChChecked,
                                            })),
                                          }
                                        : item
                                    )
                                  );
                                }}
                                className={`h-[16px] w-[16px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                  chChecked > 0
                                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                                    : darkMica
                                      ? 'border-slate-600 bg-transparent'
                                      : 'border-slate-300 bg-white'
                                }`}
                              >
                                {allChChecked && <Check className="h-3 w-3 stroke-[2.8]" />}
                                {!allChChecked && chChecked > 0 && (
                                  <Minus className="h-3 w-3 stroke-[2.8]" />
                                )}
                              </button>
                              <span className="font-mono text-[11.5px] font-semibold text-[#2563EB] dark:text-blue-400 shrink-0">
                                {ch.index}
                              </span>
                              <span className={`text-[13px] font-semibold truncate ${theme.textPrimary}`}>
                                {ch.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-[11.5px]">
                              {ch.synthesizing ? (
                                <span className="font-mono text-teal-600 dark:text-teal-400 font-medium tabular-nums">
                                  正在合成 {ch.synthProgress || 0}%
                                </span>
                              ) : ch.synthesizedFile ? (
                                <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {ch.synthesizedFile}
                                </span>
                              ) : (
                                <span className={`font-mono tabular-nums ${theme.textMuted}`}>
                                  {chChecked}/{ch.assets.length}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 课件列表（GPU 平滑展开） */}
                          <AnimatePresence initial={false}>
                            {ch.expanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                className={`overflow-hidden divide-y ${theme.divider}`}
                              >
                                {ch.assets.map((asset) => {
                                  const excluded = excludedPagesMap[asset.id]?.length || 0;
                                  const isPreviewing = previewAsset?.id === asset.id;

                                  return (
                                    <div
                                      key={asset.id}
                                      onClick={() => {
                                        if (asset.type === 'slide') {
                                          setPreviewAsset(asset);
                                        } else {
                                          updateActiveChapters((chs) =>
                                            chs.map((c) =>
                                              c.id !== ch.id
                                                ? c
                                                : {
                                                    ...c,
                                                    assets: c.assets.map((a) =>
                                                      a.id === asset.id
                                                        ? { ...a, checked: !a.checked }
                                                        : a
                                                    ),
                                                  }
                                            )
                                          );
                                        }
                                      }}
                                      className={`group px-4 pl-10 h-[44px] flex items-center gap-3 cursor-pointer transition-colors ${
                                        isPreviewing
                                          ? darkMica
                                            ? 'bg-blue-500/12'
                                            : 'bg-blue-50/75'
                                          : theme.rowHover
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        aria-label={`勾选 ${asset.title}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateActiveChapters((chs) =>
                                            chs.map((c) =>
                                              c.id !== ch.id
                                                ? c
                                                : {
                                                    ...c,
                                                    assets: c.assets.map((a) =>
                                                      a.id === asset.id
                                                        ? { ...a, checked: !a.checked }
                                                        : a
                                                    ),
                                                  }
                                            )
                                          );
                                        }}
                                        className={`h-[16px] w-[16px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                          asset.checked
                                            ? 'bg-[#2563EB] border-[#2563EB] text-white'
                                            : darkMica
                                              ? 'border-slate-600 bg-transparent'
                                              : 'border-slate-300 bg-white'
                                        }`}
                                      >
                                        {asset.checked && <Check className="h-3 w-3 stroke-[2.8]" />}
                                      </button>

                                      <div className="min-w-0 flex-1 flex items-center gap-2">
                                        <span
                                          className={`text-[12.5px] truncate ${
                                            asset.checked ? theme.textPrimary : theme.textMuted
                                          }`}
                                        >
                                          {asset.title}
                                        </span>
                                      </div>

                                      {/* 简洁无胶囊元数据：类型 · 页数/剔页提示 · 体积 */}
                                      <div className={`flex items-center gap-2 text-[11.5px] shrink-0 ${theme.textMuted}`}>
                                        {asset.type === 'slide' ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewAsset(asset);
                                            }}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px] font-medium transition-colors cursor-pointer ${
                                              excluded > 0
                                                ? 'text-teal-700 bg-teal-50 dark:bg-teal-500/15 dark:text-teal-300'
                                                : 'text-[#2563EB] bg-blue-50/80 dark:bg-blue-500/15 dark:text-blue-300'
                                            }`}
                                          >
                                            <Layers className="h-3 w-3" />
                                            {excluded > 0
                                              ? `已剔除 ${excluded} 页`
                                              : `${asset.slidePages}页 · 预览`}
                                          </button>
                                        ) : (
                                          <span className="font-mono uppercase text-[11px]">
                                            {asset.type}
                                          </span>
                                        )}

                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums w-[52px] text-right">
                                          {asset.sizeMB.toFixed(1)} MB
                                        </span>
                                      </div>

                                      {/* 状态/进度 */}
                                      <div className="w-[82px] flex items-center justify-end shrink-0">
                                        {asset.status === 'downloading' ? (
                                          <div className="w-full flex items-center gap-1.5">
                                            <div className="flex-1 h-[5px] rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                              <div
                                                className="h-full bg-[#2563EB] rounded-full transition-all duration-150"
                                                style={{ width: `${asset.progress}%` }}
                                              />
                                            </div>
                                            <span className="font-mono text-[10.5px] text-[#2563EB] tabular-nums w-[28px] text-right">
                                              {asset.progress}%
                                            </span>
                                          </div>
                                        ) : asset.status === 'done' ? (
                                          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            完成
                                          </span>
                                        ) : (
                                          <span className={`text-[11px] ${theme.textMuted}`}>
                                            {asset.checked ? '已选' : '跳过'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>

                  {/* 底部毛玻璃悬浮行动岛（Floating Glass Dock） */}
                  <div className="pointer-events-none absolute left-6 right-6 bottom-5 z-20 flex flex-col items-center">
                    {/* 弹出式合成偏好浮层 */}
                    <AnimatePresence>
                      {showSettingsPopover && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.98 }}
                          transition={{ duration: 0.16 }}
                          className={`pointer-events-auto mb-2.5 w-full max-w-[660px] rounded-[12px] border backdrop-blur-2xl p-4 shadow-[0_14px_36px_rgba(15,23,42,0.16)] ${theme.dockBg}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className={`text-[12.5px] font-semibold ${theme.textPrimary}`}>
                              合成引擎偏好设置（纯 Rust 本地处理，零 Office）
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowSettingsPopover(false)}
                              className={`${theme.textMuted} hover:${theme.textPrimary} cursor-pointer`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-[12px]">
                            <div>
                              <div className={`mb-1.5 font-medium ${theme.textSecondary}`}>
                                图文页输出清晰度
                              </div>
                              <div className={`grid grid-cols-3 gap-1 p-1 rounded-[8px] ${theme.segBg}`}>
                                {(
                                  [
                                    ['high', '无损原图'],
                                    ['balanced', '均衡'],
                                    ['lite', '轻量'],
                                  ] as const
                                ).map(([k, lbl]) => (
                                  <button
                                    key={k}
                                    type="button"
                                    onClick={() => setQuality(k)}
                                    className={`py-1 rounded-[6px] text-[11.5px] cursor-pointer ${
                                      quality === k
                                        ? `${theme.segThumb} border font-semibold ${theme.textPrimary}`
                                        : theme.textMuted
                                    }`}
                                  >
                                    {lbl}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 px-3 rounded-[8px] border border-slate-200/70 dark:border-white/10">
                              <div>
                                <div className={`font-medium ${theme.textPrimary}`}>
                                  自动识别并剔除签到/空白页
                                </div>
                                <div className={`text-[11px] ${theme.textMuted}`}>
                                  合成 PDF / PPTX 时跳过冗余幻灯片
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setRemoveJunkSlides((v) => !v)}
                                className={`h-5 w-9 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                                  removeJunkSlides ? 'bg-[#2563EB]' : 'bg-slate-300 dark:bg-slate-700'
                                }`}
                              >
                                <div
                                  className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                    removeJunkSlides ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* 主悬浮操作条 */}
                    <div
                      className={`pointer-events-auto w-full max-w-[780px] rounded-[13px] border backdrop-blur-2xl px-4 py-2.5 shadow-[0_14px_38px_-6px_rgba(15,23,42,0.18)] flex items-center justify-between gap-3 ${theme.dockBg}`}
                    >
                      {/* 左：选中概览 */}
                      <div className="min-w-0">
                        <div className={`text-[12.5px] font-semibold tabular-nums ${theme.textPrimary}`}>
                          已选 {stats.checkedCount} 项 · {stats.totalSize.toFixed(1)} MB
                        </div>
                        <div className={`text-[11px] tabular-nums truncate ${theme.textMuted}`}>
                          {stats.activeChapterCount} 个章节
                          {stats.excludedCount > 0 ? ` · 已剔除 ${stats.excludedCount} 页冗余幻灯片` : ''}
                        </div>
                      </div>

                      {/* 中：弹簧格式切换 + 偏好按钮 */}
                      <div className="flex items-center gap-2">
                        <div className={`relative inline-flex p-1 rounded-[9px] ${theme.segBg}`}>
                          {(
                            [
                              ['pdf', '合成 PDF'],
                              ['pptx', '合成 PPTX'],
                              ['raw', '原文件'],
                            ] as const
                          ).map(([fmt, label]) => {
                            const active = exportFormat === fmt;
                            return (
                              <button
                                key={fmt}
                                type="button"
                                disabled={runPhase === 'downloading' || runPhase === 'synthesizing'}
                                onClick={() => setExportFormat(fmt)}
                                className={`relative px-2.5 py-1 text-[11.5px] rounded-[6px] cursor-pointer whitespace-nowrap disabled:cursor-not-allowed ${
                                  active ? `font-semibold ${theme.textPrimary}` : theme.textMuted
                                }`}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="nextgen-format-pill"
                                    transition={{ type: 'spring', stiffness: 480, damping: 35 }}
                                    className={`absolute inset-0 rounded-[6px] border shadow-xs ${theme.segThumb}`}
                                  />
                                )}
                                <span className="relative z-10">{label}</span>
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowSettingsPopover((v) => !v)}
                          title="合成偏好设置"
                          className={`h-[32px] w-[32px] rounded-[8px] border flex items-center justify-center transition-colors cursor-pointer ${
                            showSettingsPopover
                              ? 'bg-[#2563EB] text-white border-[#2563EB]'
                              : darkMica
                                ? 'bg-white/[0.06] border-white/15 text-slate-300 hover:bg-white/10'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* 右：主 CTA */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleToggleRun}
                          className={`inline-flex items-center gap-1.5 h-[36px] px-4 rounded-[9px] text-[12.5px] font-semibold text-white transition-all cursor-pointer whitespace-nowrap shadow-sm active:scale-[0.98] ${
                            runPhase === 'done'
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : runPhase === 'synthesizing'
                                ? 'bg-teal-600 hover:bg-teal-700'
                                : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
                          }`}
                        >
                          {runPhase === 'downloading' || runPhase === 'synthesizing' ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : runPhase === 'paused' ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : runPhase === 'done' ? (
                            <FolderOpen className="h-3.5 w-3.5" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {runPhase === 'downloading'
                            ? '暂停下载'
                            : runPhase === 'synthesizing'
                              ? '本地合成中...'
                              : runPhase === 'paused'
                                ? '继续下载'
                                : runPhase === 'done'
                                  ? '打开归档目录'
                                  : exportFormat === 'raw'
                                    ? '批量下载'
                                    : `下载并合成 ${exportFormat.toUpperCase()}`}
                        </button>

                        {(runPhase === 'done' || runPhase === 'paused') && (
                          <button
                            type="button"
                            onClick={handleResetRun}
                            title="重置队列"
                            className={`h-[36px] w-[34px] rounded-[9px] border flex items-center justify-center cursor-pointer ${
                              darkMica
                                ? 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右侧滑出式：图文幻灯片缩略图预览与合成前剔页抽屉 */}
                <AnimatePresence>
                  {previewAsset && (
                    <motion.aside
                      initial={{ x: 40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 40, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                      className={`absolute top-0 right-0 bottom-0 z-30 w-[340px] border-l overflow-hidden flex flex-col shadow-[-8px_0_24px_rgba(15,23,42,0.10)] ${theme.divider} ${
                        darkMica ? 'bg-slate-900' : 'bg-white'
                      }`}
                    >
                      <div className={`px-4 py-3.5 border-b flex items-start justify-between gap-2 ${theme.divider}`}>
                        <div className="min-w-0">
                          <div className={`text-[12.5px] font-semibold truncate ${theme.textPrimary}`}>
                            合成前选页与剔除
                          </div>
                          <div className={`text-[11px] truncate mt-0.5 ${theme.textMuted}`}>
                            {previewAsset.title}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewAsset(null)}
                          className={`p-1 rounded-[6px] cursor-pointer ${theme.textMuted} ${theme.rowHover}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="px-4 py-2.5 flex items-center justify-between text-[11.5px] border-b border-slate-200/60 dark:border-white/10">
                        <span className={theme.textSecondary}>
                          点击缩略图排除冗余页（如签到页）
                        </span>
                        <span className="font-mono text-teal-600 dark:text-teal-400 font-semibold tabular-nums">
                          剔除 {(excludedPagesMap[previewAsset.id] || []).length} 页
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto tk-scrollbar p-3.5 grid grid-cols-2 gap-2.5 content-start">
                        {previewSlides.map((slide) => {
                          const isExcluded = (excludedPagesMap[previewAsset.id] || []).includes(
                            slide.page
                          );
                          return (
                            <button
                              key={slide.page}
                              type="button"
                              onClick={() => toggleExcludedPage(previewAsset.id, slide.page)}
                              className={`text-left rounded-[8px] border p-2 transition-all cursor-pointer ${
                                isExcluded
                                  ? darkMica
                                    ? 'border-red-500/40 bg-red-950/20 opacity-55'
                                    : 'border-red-200 bg-red-50/40 opacity-55'
                                  : darkMica
                                    ? 'border-white/15 bg-slate-800/80 hover:border-blue-400'
                                    : 'border-slate-200 bg-white hover:border-[#2563EB] shadow-xs'
                              }`}
                            >
                              {/* 真实页面缩略图（点击放大） */}
                              {(() => {
                                const img = thumbCache[`${previewAsset.id}#${slide.page}`];
                                return (
                                  <div className="aspect-[16/10] rounded-[5px] overflow-hidden mb-1.5 border border-slate-200/70 bg-slate-100 relative group">
                                    {img ? (
                                      <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={img}
                                          alt={`第 ${slide.page} 页`}
                                          className="w-full h-full object-cover"
                                        />
                                        <span
                                          role="button"
                                          tabIndex={0}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setZoomImage({ url: img, page: slide.page });
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.stopPropagation();
                                              setZoomImage({ url: img, page: slide.page });
                                            }
                                          }}
                                          className="absolute inset-0 flex items-center justify-center bg-slate-900/45 text-white text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity cursor-zoom-in"
                                        >
                                          点击放大
                                        </span>
                                      </>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                                        加载中…
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* 旧占位（隐藏） */}
                              <div className="hidden" />
                            </button>
                          );
                        })}
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 弹窗 1：内置 WebView 扫码直连学习通（告别 F12 复制 Cookie） */}
            <AnimatePresence>
              {showQrModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 bg-slate-950/35 backdrop-blur-md flex items-center justify-center"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 10 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className={`w-[380px] rounded-[14px] border p-6 shadow-2xl ${
                      darkMica
                        ? 'bg-slate-900 border-white/15 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-[15px] font-semibold">学习通 App 扫码直连</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQrModal(false);
                          setQrState('waiting');
                        }}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className={`text-[12px] mt-1 leading-relaxed ${theme.textMuted}`}>
                      利用内置 WebView2 登录态自动捕获会话 Cookie 并拉取全部已选课程，无需再按 F12 手动复制。
                    </p>

                    <div className="my-5 flex flex-col items-center">
                      <div
                        className={`h-[164px] w-[164px] rounded-[12px] border flex flex-col items-center justify-center gap-2 ${
                          qrState === 'done'
                            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/30'
                            : darkMica
                              ? 'bg-slate-950 border-white/15'
                              : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        {qrState === 'done' ? (
                          <>
                            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                            <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                              登录态捕获成功
                            </span>
                          </>
                        ) : qrState === 'scanned' ? (
                          <>
                            <CheckCircle2 className="h-10 w-10 text-[#2563EB]" />
                            <span className="text-[12px] font-semibold text-[#2563EB]">
                              已扫码，请在手机上确认
                            </span>
                            <span className="text-[10px] text-slate-400">确认后会自动同步课程</span>
                          </>
                        ) : (
                          <>
                            {qrImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={qrImage}
                                alt="学习通登录二维码"
                                className="h-[148px] w-[148px] rounded-[6px]"
                              />
                            ) : (
                              <QrCode className="h-24 w-24 text-slate-800 dark:text-slate-200 stroke-[1.4]" />
                            )}
                            <span className="text-[11px] text-slate-500">
                              {qrImage ? '打开学习通 App 扫一扫' : '正在生成二维码…'}
                            </span>
                            {qrNote ? (
                              <span className="text-[10px] text-slate-400">{qrNote}</span>
                            ) : null}
                            {syncError ? (
                              <span className="text-[10px] text-amber-600 max-w-[220px] text-center break-all">
                                {syncError}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowManual((v) => !v)}
                      className="mt-1 mb-3 text-[11px] text-slate-400 hover:text-slate-600 hover:underline cursor-pointer"
                    >
                      {showManual ? '收起手动粘贴' : '扫码不成功？手动粘贴 Cookie'}
                    </button>

                    {showManual && (
                      <div className="mb-3 space-y-2">
                        <textarea
                          value={manualCookie}
                          onChange={(e) => setManualCookie(e.target.value)}
                          placeholder="粘贴浏览器里复制的整行 Cookie"
                          className="w-full h-[72px] resize-none rounded-[8px] border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-mono outline-none focus:border-[#2563EB]"
                        />
                        <button
                          type="button"
                          onClick={handleManualCookie}
                          className="w-full py-2 text-[12px] font-semibold rounded-[8px] bg-[#0D9488] hover:bg-[#0F766E] text-white cursor-pointer"
                        >
                          用这段 Cookie 同步课程
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowQrModal(false)}
                        className={`px-3.5 py-2 text-[12px] font-medium rounded-[8px] border cursor-pointer ${
                          darkMica
                            ? 'border-white/15 text-slate-300 hover:bg-white/5'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={qrState !== 'waiting'}
                        onClick={() => {
                          if (isTauriRuntime()) {
                            void loadQrCode();
                          } else {
                            handleSimulateQrLogin();
                          }
                        }}
                        className="px-4 py-2 text-[12px] font-semibold rounded-[8px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white cursor-pointer disabled:opacity-60"
                      >
                        {isTauriRuntime() ? '刷新二维码' : '演示扫码自动同步'}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 弹窗 2：外部课程链接快速导入 */}
            <AnimatePresence>
              {showUrlModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 bg-slate-950/35 backdrop-blur-md flex items-center justify-center"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 10 }}
                    className={`w-[440px] rounded-[14px] border p-5 shadow-2xl ${
                      darkMica
                        ? 'bg-slate-900 border-white/15 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
                        <Link2 className="h-4 w-4 text-[#2563EB]" />
                        粘贴外部课程链接
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowUrlModal(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className={`text-[12px] mb-3 ${theme.textMuted}`}>
                      自动复用当前登录会话，无需重复提供 Cookie。
                    </p>
                    <input
                      type="text"
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      placeholder="https://mooc1.chaoxing.com/mycourse/studentcourse?courseId=..."
                      className={`w-full h-[36px] px-3 rounded-[8px] border font-mono text-[11.5px] focus:outline-none focus:border-[#2563EB] ${theme.inputBg}`}
                    />
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowUrlModal(false)}
                        className={`px-3 py-1.5 text-[12px] rounded-[7px] border cursor-pointer ${
                          darkMica ? 'border-white/15 text-slate-300' : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleImportExternalUrl}
                        className="px-3.5 py-1.5 text-[12px] font-semibold rounded-[7px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white cursor-pointer"
                      >
                        解析并加入书架
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 毛玻璃系统通知（弹簧淡入+缩放） */}
            <AnimatePresence>
              {floatingNotice && (
                <motion.div
                  key={floatingNotice.id}
                  initial={{ opacity: 0, y: -14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className={`absolute top-12 right-5 z-40 max-w-[340px] rounded-[11px] border backdrop-blur-2xl px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.18)] flex items-start gap-2.5 ${theme.dockBg}`}
                >
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      floatingNotice.tone === 'success' ? 'text-emerald-500' : 'text-[#2563EB]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12.5px] font-semibold ${theme.textPrimary}`}>
                      {floatingNotice.title}
                    </div>
                    <div className={`text-[11.5px] mt-0.5 leading-snug ${theme.textMuted}`}>
                      {floatingNotice.detail}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
