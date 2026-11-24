export type AssetType = 'slide' | 'pdf' | 'docx' | 'pptx';

export type ItemStatus = 'pending' | 'downloading' | 'synthesizing' | 'done' | 'error';

export interface CourseAsset {
  id: string;
  chapterId: string;
  title: string;
  type: AssetType;
  sizeMB: number;
  slidePages?: number;
  checked: boolean;
  status: ItemStatus;
  progress: number; // 0 to 100
  errorMessage?: string;
}

export interface CourseChapter {
  id: string;
  index: string;
  title: string;
  expanded: boolean;
  synthesizedFile?: string;
  synthesizing?: boolean;
  synthProgress?: number;
  assets: CourseAsset[];
}

export interface CoursePreset {
  id: string;
  name: string;
  instructor: string;
  term: string;
  url: string;
  sampleCookie: string;
  defaultFolder: string;
  chapters: CourseChapter[];
}

export const COURSE_PRESETS: CoursePreset[] = [
  {
    id: 'dsp-2026',
    name: '数字信号处理（核心专业课）',
    instructor: '张明远 教授',
    term: '2026 秋',
    url: 'https://mooc1.chaoxing.com/mycourse/studentcourse?courseId=239481052&clazzid=94820113&enc=7f9a3e21b04c',
    sampleCookie: 'UID=184920311; _uid=184920311; uf=4a8b91e0c2d57f82...; fid=1428; vc3=9e71b4c2d08f4a...; xxtenc=1',
    defaultFolder: 'D:\\CourseBackup\\数字信号处理_2026秋',
    chapters: [
      {
        id: 'ch-1',
        index: '第 1 章',
        title: '离散时间信号与线性时不变系统',
        expanded: true,
        assets: [
          {
            id: 'a-101',
            chapterId: 'ch-1',
            title: '1.1 采样定理与离散序列表示（学习通图文页）',
            type: 'slide',
            sizeMB: 6.4,
            slidePages: 18,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-102',
            chapterId: 'ch-1',
            title: '1.2 LTI 系统卷积和与因果稳定性讲义.pdf',
            type: 'pdf',
            sizeMB: 4.8,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-103',
            chapterId: 'ch-1',
            title: '第1章 课后习题精解与 MATLAB 验算模板.docx',
            type: 'docx',
            sizeMB: 1.9,
            checked: true,
            status: 'pending',
            progress: 0,
          },
        ],
      },
      {
        id: 'ch-2',
        index: '第 2 章',
        title: 'Z 变换与离散傅里叶分析（DFT）',
        expanded: true,
        assets: [
          {
            id: 'a-201',
            chapterId: 'ch-2',
            title: '2.1 Z 变换收敛域与逆变换留数法（图文幻灯片）',
            type: 'slide',
            sizeMB: 8.2,
            slidePages: 24,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-202',
            chapterId: 'ch-2',
            title: '2.2 DTFT 到 DFT 的频域采样推导.pptx',
            type: 'pptx',
            sizeMB: 11.5,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-203',
            chapterId: 'ch-2',
            title: '2.3 周期卷积与频谱泄漏实验指导书.pdf',
            type: 'pdf',
            sizeMB: 3.6,
            checked: true,
            status: 'pending',
            progress: 0,
          },
        ],
      },
      {
        id: 'ch-3',
        index: '第 3 章',
        title: '快速傅里叶变换（FFT）算法结构',
        expanded: true,
        assets: [
          {
            id: 'a-301',
            chapterId: 'ch-3',
            title: '3.1 基-2 按时间抽取蝶形流图详解（图文幻灯片）',
            type: 'slide',
            sizeMB: 7.1,
            slidePages: 20,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-302',
            chapterId: 'ch-3',
            title: '3.2 实序列 FFT 与原位运算索引对照表.pdf',
            type: 'pdf',
            sizeMB: 2.7,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-303',
            chapterId: 'ch-3',
            title: '实验二：语音信号短时频谱分析报告要求.docx',
            type: 'docx',
            sizeMB: 1.4,
            checked: false,
            status: 'pending',
            progress: 0,
          },
        ],
      },
      {
        id: 'ch-4',
        index: '第 4 章',
        title: 'IIR 与 FIR 数字滤波器设计',
        expanded: false,
        assets: [
          {
            id: 'a-401',
            chapterId: 'ch-4',
            title: '4.1 巴特沃斯与切比雪夫双线性变换法（图文页）',
            type: 'slide',
            sizeMB: 9.4,
            slidePages: 26,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-402',
            chapterId: 'ch-4',
            title: '4.2 线性相位 FIR 窗函数与等波纹设计.pptx',
            type: 'pptx',
            sizeMB: 13.2,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'a-403',
            chapterId: 'ch-4',
            title: '期末总复习重点公式速查手册（2026版）.pdf',
            type: 'pdf',
            sizeMB: 5.1,
            checked: true,
            status: 'pending',
            progress: 0,
          },
        ],
      },
    ],
  },
  {
    id: 'ml-grad-2026',
    name: '统计机器学习理论（研究生学位课）',
    instructor: '林致远 教授',
    term: '2026 秋',
    url: 'https://mooc1.chaoxing.com/mycourse/studentcourse?courseId=241098221&clazzid=99012451&enc=2c8d10e9a71b',
    sampleCookie: 'UID=184920311; _uid=184920311; uf=9c2e41a8f0b12...; fid=1428; vc3=4b19d2f7a0e3...; xxtenc=1',
    defaultFolder: 'D:\\CourseBackup\\统计机器学习_2026秋',
    chapters: [
      {
        id: 'ml-1',
        index: '第 1 讲',
        title: 'PAC 学习框架与 VC 维泛化界',
        expanded: true,
        assets: [
          {
            id: 'm-101',
            chapterId: 'ml-1',
            title: 'L01 经验风险最小化与 Hoeffding 不等式（图文页）',
            type: 'slide',
            sizeMB: 5.8,
            slidePages: 16,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'm-102',
            chapterId: 'ml-1',
            title: 'L01 Sauer-Shelah 引理证明讲义.pdf',
            type: 'pdf',
            sizeMB: 3.4,
            checked: true,
            status: 'pending',
            progress: 0,
          },
        ],
      },
      {
        id: 'ml-2',
        index: '第 2 讲',
        title: '核方法、对偶优化与支持向量机',
        expanded: true,
        assets: [
          {
            id: 'm-201',
            chapterId: 'ml-2',
            title: 'L02 KKT 条件与 Mercer 核空间推导（图文页）',
            type: 'slide',
            sizeMB: 7.9,
            slidePages: 22,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'm-202',
            chapterId: 'ml-2',
            title: 'L02 SMO 算法迭代伪代码与作业说明.pptx',
            type: 'pptx',
            sizeMB: 9.6,
            checked: true,
            status: 'pending',
            progress: 0,
          },
          {
            id: 'm-203',
            chapterId: 'ml-2',
            title: 'Seminar 论文精读清单（2026秋）.docx',
            type: 'docx',
            sizeMB: 0.9,
            checked: true,
            status: 'pending',
            progress: 0,
          },
        ],
      },
    ],
  },
];

export function cloneChapters(chapters: CourseChapter[]): CourseChapter[] {
  return chapters.map((ch) => ({
    ...ch,
    assets: ch.assets.map((a) => ({ ...a })),
  }));
}
