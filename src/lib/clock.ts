/**
 * 現在時刻の取得（サーバー・ブラウザ共通）。
 *
 * テスト用に時刻を固定できる:
 * - MIRURIKU_FIXED_NOW（ISO 8601）: 開発サーバー（NODE_ENV が production 以外）のサーバー側だけで有効
 * - NEXT_PUBLIC_MIRURIKU_FIXED_NOW: ビルド時にブラウザ用のコードへ埋め込まれ、ビルド時の描画とブラウザの両方で有効。
 *   E2E の静的ビルド専用。本番のデプロイスクリプト（deploy/static/deploy.sh）は手元の環境変数を引き継がずにビルドするため、
 *   本番に入ることはない
 *
 * NEXT_PUBLIC_ の値をブラウザ用のコードに埋め込ませるため、process.env.NEXT_PUBLIC_... を直接参照する。
 */
export type ClockEnv = {
  NODE_ENV?: string;
  MIRURIKU_FIXED_NOW?: string;
  NEXT_PUBLIC_MIRURIKU_FIXED_NOW?: string;
};

function defaultEnv(): ClockEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    MIRURIKU_FIXED_NOW: process.env.MIRURIKU_FIXED_NOW,
    NEXT_PUBLIC_MIRURIKU_FIXED_NOW: process.env.NEXT_PUBLIC_MIRURIKU_FIXED_NOW,
  };
}

function parseInstant(value: string | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 時刻が固定されていればその時刻（テスト用）。固定されていなければ null */
export function getFixedNow(env: ClockEnv = defaultEnv()): Date | null {
  const publicFixed = parseInstant(env.NEXT_PUBLIC_MIRURIKU_FIXED_NOW);
  if (publicFixed) return publicFixed;
  if (env.NODE_ENV !== "production") return parseInstant(env.MIRURIKU_FIXED_NOW);
  return null;
}

export function getNow(env: ClockEnv = defaultEnv()): Date {
  return getFixedNow(env) ?? new Date();
}
