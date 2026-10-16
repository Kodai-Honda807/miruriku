# みる陸 本番用コンテナイメージ（マルチステージ）
#
# ターゲット:
#   runner    … Web アプリ（Next.js standalone）。既定のターゲット（最後のステージ）
#   migrate   … DB マイグレーション（prisma migrate deploy）を 1 回だけ実行するタスク
#   collector … 収集 CLI（pnpm collect 相当）を 1 回だけ実行するタスク
#
#   docker build --target runner    -t miruriku-web:local .
#   docker build --target migrate   -t miruriku-migrate:local .
#   docker build --target collector -t miruriku-collector:local .
#
# 方針:
# - ビルド中に DB へ接続しない・マイグレーションを実行しない。DATABASE_URL などの秘密情報は
#   イメージに焼き込まず、実行時に環境変数で渡す（AWS では Secrets Manager / SSM から注入）。
# - Web サーバー内で定期処理を動かさない。収集・マイグレーションは別タスクとして起動する。
# - コンテナ内のファイルへの永続保存を前提にしない（.next 配下の書き込みは使い捨てのキャッシュのみ）。
# - すべてのターゲットは非 root ユーザー（公式イメージの node, uid 1000）で実行する。

ARG NODE_IMAGE=node:24.21.0-bookworm-slim

# ---------------------------------------------------------------------------
# base: ビルド・ツール用の共通ステージ
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1
# Prisma の schema engine（migrate deploy で使用）は libssl が必要。slim イメージには含まれないため追加する。
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# pnpm は package.json の packageManager（pnpm@12.10.1）に従って corepack が取得する
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: 依存関係のインストール（postinstall で prisma generate を実行）
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# postinstall の prisma generate に必要なファイルを先にコピーする（接続文字列は不要）
COPY prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,id=miruriku-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# ---------------------------------------------------------------------------
# builder: next build（DB 接続なし。DATABASE_URL は設定しない）
# ---------------------------------------------------------------------------
FROM base AS builder
# 公開サイトの URL（canonical・OGP の絶対 URL に使う。ビルド時に埋め込まれる）。未指定なら絶対 URL を出さない
ARG MIRURIKU_SITE_URL=""
ENV MIRURIKU_SITE_URL=${MIRURIKU_SITE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
# standalone 出力を「アプリ本体（root 所有にする）」と「.next（実行ユーザーが書き込む）」に分けて用意する
RUN pnpm build \
    && mkdir -p /dist \
    && mv .next/standalone /dist/app \
    && mv /dist/app/.next /dist/next \
    && mv .next/static /dist/next/static \
    && cp -R public /dist/app/public

# ---------------------------------------------------------------------------
# migrate: マイグレーション専用タスク（デプロイ前に 1 回実行）
#   docker run --rm -e DATABASE_URL=... miruriku-migrate:local
# ---------------------------------------------------------------------------
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# collector: 収集 CLI 専用タスク（将来は EventBridge Scheduler + ECS タスクなどで起動）
#   docker run --rm -e DATABASE_URL=... miruriku-collector:local --event <slug> --fetch http --provider rule-based
# ---------------------------------------------------------------------------
FROM base AS collector
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
USER node
ENTRYPOINT ["./node_modules/.bin/tsx", "scripts/collect.ts"]
CMD ["--help"]

# ---------------------------------------------------------------------------
# runner: Web アプリ（既定のターゲット）
#   docker run --rm -p 3000:3000 -e DATABASE_URL=... miruriku-web:local
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# アプリのコード・依存は root 所有（実行ユーザーからは読み取り専用）。
# .next 配下のみ、プリレンダー結果・キャッシュの書き込みのため実行ユーザーに所有させる。
COPY --from=builder /dist/app ./
COPY --from=builder --chown=node:node /dist/next ./.next
USER node
EXPOSE 3000
# DB に依存しない死活監視（src/app/api/health/route.ts）。slim イメージには curl がないため node で確認する
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# 秘密情報（DATABASE_URL など）は docker run -e / ECS タスク定義で実行時に渡す
CMD ["node", "server.js"]
