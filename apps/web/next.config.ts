import { API_URL } from '@/shared/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* браузер ходит в API через фронт, чтобы был один адрес и cookie работали без CORS */
  rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
