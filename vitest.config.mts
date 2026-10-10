import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // "server-only" は React Server 環境以外で読み込むと例外を投げるため、テストでは空モジュールにする
      "server-only": path.resolve(root, "test/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "prisma/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
          // 実行環境のタイムゾーンに依存しないことを確かめるため、日本時間以外にする
          env: { TZ: "America/Los_Angeles" },
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./test/setup-ui.ts"],
          env: { TZ: "America/Los_Angeles" },
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts", "prisma/**/*.db.test.ts"],
          globalSetup: ["./test/db-global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: { TZ: "America/Los_Angeles" },
        },
      },
    ],
  },
});
