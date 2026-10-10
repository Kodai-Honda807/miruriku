import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // NEXT_DIST_DIR で分けた開発・E2E 用の出力先
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma が生成するクライアント
    "src/generated/**",
    // テスト成果物
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
