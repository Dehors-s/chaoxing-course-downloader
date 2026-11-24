import type {NextConfig} from 'next';

// Tauri 桌面打包：需要 next export 的纯静态产物（out/）
const isDesktopBuild = process.env.TAURI_BUILD === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // 桌面打包时禁用图片优化（静态导出不支持）
  images: isDesktopBuild
    ? { unoptimized: true }
    : {
        remotePatterns: [
          {
            protocol: 'https',
            hostname: 'picsum.photos',
            port: '',
            pathname: '/**',
          },
        ],
      },
  output: isDesktopBuild ? 'export' : 'standalone',
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
