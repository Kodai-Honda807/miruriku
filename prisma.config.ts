import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 は .env を自動で読み込まないため dotenv で読み込みます。
// `prisma generate` は接続文字列なしでも実行できるよう env() ではなく process.env を参照します。
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
