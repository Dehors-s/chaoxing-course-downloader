/**
 * 前端 <-> Tauri 2 Rust 内核桥接层
 * - 在浏览器预览模式中自动降级为模拟态，不报错
 * - 在本机 `npm run tauri dev` / 打包后的 `.exe` 中自动调用真实 Rust 命令
 */

export interface TauriCourseSummary {
  courseId: string;
  clazzId: string;
  cpi: string;
  name: string;
  instructor: string;
  courseUrl: string;
}

export interface TauriAssetItem {
  id: string;
  chapterId: string;
  title: string;
  assetType: 'slide' | 'pdf' | 'docx' | 'pptx';
  objectId: string;
  downloadUrl: string;
  slideImageUrls: string[];
  estimatedSizeMb: number;
}

export interface TauriParsedChapter {
  id: string;
  index: string;
  title: string;
  assets: TauriAssetItem[];
}

export interface TauriParsedCourseDetail {
  name: string;
  instructor: string;
  chapters: TauriParsedChapter[];
}

export type TauriDownloadEvent =
  | { event: 'assetProgress'; data: { assetId: string; progress: number; status: string } }
  | { event: 'chapterSynthesizing'; data: { chapterId: string; progress: number } }
  | { event: 'chapterDone'; data: { chapterId: string; outputFile: string } }
  | { event: 'allDone'; data: { totalFiles: number; outputDir: string } }
  | { event: 'error'; data: { assetId?: string; message: string } };

interface TauriInternals {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  transformCallback: (cb: (payload: unknown) => void, once?: boolean) => number;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime() || !window.__TAURI_INTERNALS__) {
    throw new Error('当前处于浏览器预览模式，请在 Tauri 2 桌面环境中运行此原生命令');
  }
  return window.__TAURI_INTERNALS__.invoke<T>(cmd, args);
}

/** 开始扫码登录：返回二维码 PNG 的字节数组 */
export async function startQrLogin(): Promise<number[]> {
  return tauriInvoke<number[]>('start_qr_login');
}

export interface TauriQrPoll {
  state: 'waiting' | 'success' | 'expired';
  cookie?: string | null;
  note?: string | null;
  scanned?: boolean;
}

/** 轮询扫码状态；成功后带回 Cookie */
export async function pollQrLogin(): Promise<TauriQrPoll> {
  return tauriInvoke<TauriQrPoll>('poll_qr_login');
}

/** 取单页幻灯片原图（data URL），用于缩略图与放大预览 */
export async function fetchSlideThumb(url: string): Promise<string> {
  return tauriInvoke<string>('fetch_slide_thumb', { url });
}

/** 打开内置学习通扫码登录窗（自动捕获 HttpOnly Cookie） */
export async function openChaoxingLoginWindow(): Promise<void> {
  await tauriInvoke('open_chaoxing_login');
}

/** 兜底：手动写入 Cookie 到 Rust 内存态 */
export async function setManualCookie(cookie: string): Promise<void> {
  await tauriInvoke('set_manual_cookie', { cookie });
}

/** 获取当前账号已选课程列表 */
export async function getEnrolledCourses(): Promise<TauriCourseSummary[]> {
  return tauriInvoke<TauriCourseSummary[]>('get_enrolled_courses');
}

/** 解析单门课程目录与课件附件 */
export async function parseCourseChapters(courseUrl: string): Promise<TauriParsedCourseDetail> {
  return tauriInvoke<TauriParsedCourseDetail>('parse_course_chapters', { courseUrl });
}

/**
 * 启动 Rust Tokio 并发下载与免 Office 章节合成
 * 本机打包安装 `@tauri-apps/api` 后可直接替换为 `new Channel<TauriDownloadEvent>()`
 */
export async function startBatchDownload(
  request: {
    cookie: string;
    outputDir: string;
    exportFormat: 'pdf' | 'pptx' | 'raw';
    quality: 'high' | 'balanced' | 'lite';
    chapters: { id: string; index: string; title: string; assets: TauriAssetItem[] }[];
    excludedPages: Record<string, number[]>;
  },
  onEvent: (ev: TauriDownloadEvent) => void
): Promise<void> {
  if (!isTauriRuntime() || !window.__TAURI_INTERNALS__) {
    throw new Error('当前处于浏览器预览模式');
  }
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<TauriDownloadEvent>();
  channel.onmessage = (payload) => onEvent(payload as TauriDownloadEvent);
  await tauriInvoke('start_batch_download', {
    request,
    onEvent: channel,
  });
}
