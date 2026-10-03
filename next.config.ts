import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack's persistent cache can retain raw .env.local contents.
  // This project requires credentials to exist only in .env.local.
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
