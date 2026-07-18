import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/sdk/:path*',
        destination: 'http://localhost:3001/sdk/:path*',
      },
    ];
  },
};

export default nextConfig;
