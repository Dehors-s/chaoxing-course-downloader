import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '学习通课程文件下载器 · Tk8.6 设计工作台',
  description:
    '面向 Python tkinter 8.6 Canvas 手绘约束的 1140×884 Windows 桌面端「学习通课程文件下载器」高保真交互原型、降级实现规范与可执行代码体系。',
  openGraph: {
    title: '学习通课程文件下载器 · Tk8.6 设计工作台',
    description:
      '面向 Python tkinter 8.6 Canvas 手绘约束的 1140×884 Windows 桌面端交互原型与降级实现规范。',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '学习通课程文件下载器 · Tk8.6 设计工作台',
    description:
      '面向 Python tkinter 8.6 Canvas 手绘约束的 1140×884 Windows 桌面端交互原型与降级实现规范。',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        suppressHydrationWarning
        className="bg-[#EEF1F6] text-[#0F172A] selection:bg-[#DBEAFE] selection:text-[#1E3A8A]"
      >
        {children}
      </body>
    </html>
  );
}
