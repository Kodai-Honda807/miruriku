import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番コンテナ用に最小構成のサーバーを出力する（Dockerfile 参照）
  output: "standalone",
  // 複数の開発サーバーを同時に動かす場合（E2E と通常開発など）に出力先を分ける。通常は未設定。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
