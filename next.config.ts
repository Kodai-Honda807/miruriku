import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * 2 つの動かし方:
 *
 * - next build（公開サイト）: 静的書き出し（output: "export"）。HTML・JS・CSS を distDir（既定 out/）に出力し、
 *   S3 + CloudFront で配信する（deploy/static/）。DB には接続しない。
 * - next dev（ローカル開発・管理画面）: 通常のサーバー。管理画面（/admin）・Server Actions・Proxy・/api/health を使う。
 *
 * 管理画面などサーバーが必要なファイルは *.dynamic.tsx / *.dynamic.ts という名前にし、
 * next dev のときだけ pageExtensions に含める（静的ビルドには含まれない＝本番に管理画面は存在しない）。
 * 型生成（pnpm typecheck の next typegen）でも管理画面の型が必要なため、MIRURIKU_INCLUDE_DEV_ROUTES=1 で含められる。
 */
export default function nextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;
  const includeDevRoutes = isDevServer || process.env.MIRURIKU_INCLUDE_DEV_ROUTES === "1";
  const pageExtensions = includeDevRoutes ? ["dynamic.tsx", "dynamic.ts", "tsx", "ts"] : ["tsx", "ts"];

  return {
    output: isDevServer ? undefined : "export",
    pageExtensions,
    // /events/<slug>/ → /events/<slug>/index.html として書き出す（S3 のキーと URL を一致させる）
    trailingSlash: true,
    // 複数の開発サーバー・ビルドを同時に扱う場合（E2E など）に出力先を分ける。
    // 静的書き出しでは distDir がそのまま公開物の出力先になる
    distDir: process.env.NEXT_DIST_DIR || (isDevServer ? ".next" : "out"),
    poweredByHeader: false,
    typescript: {
      // 静的ビルドでは管理画面を除外するため、管理画面のルート型が生成されず型検査が通らない。
      // 型検査は pnpm typecheck（管理画面を含めて型生成）で行う
      ignoreBuildErrors: !includeDevRoutes,
    },
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
