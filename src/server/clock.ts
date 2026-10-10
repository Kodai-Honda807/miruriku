/**
 * 現在時刻の取得。
 *
 * 開発・テスト時のみ MIRURIKU_FIXED_NOW（ISO 8601）で時刻を固定できる。
 * NODE_ENV=production では常に実時刻を返す。
 */
export type ClockEnv = {
  NODE_ENV?: string;
  MIRURIKU_FIXED_NOW?: string;
};

export function getNow(env: ClockEnv = process.env): Date {
  const fixed = env.MIRURIKU_FIXED_NOW?.trim();
  if (env.NODE_ENV !== "production" && fixed) {
    const parsed = new Date(fixed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}
