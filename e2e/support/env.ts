/** E2E の固定値。テスト結果が実行日に依存しないよう、基準日と現在時刻を固定する。 */

/** デモデータの基準日（日本時間）。2026-10-10 は土曜日 */
export const E2E_BASE_DATE = "2026-10-10";

/** アプリ側の現在時刻（MIRURIKU_FIXED_NOW） */
export const E2E_FIXED_NOW = "2026-10-10T12:00:00+09:00";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);

export function getE2eDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error("E2E_DATABASE_URL が設定されていません（.env.example を参照）");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_e2e")) {
    throw new Error(`安全のため、E2E はデータベース名が _e2e で終わる場合のみ実行します: ${dbName}`);
  }
  return url;
}
