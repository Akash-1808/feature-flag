import type { NextConfig } from "next";

const internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  // 'standalone' is only needed for Docker deployments, not Vercel
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`,
      },
      {
        source: '/sdk/:path*',
        destination: `${internalApiUrl}/sdk/:path*`,
      },
    ];
  },
};

export default nextConfig;
