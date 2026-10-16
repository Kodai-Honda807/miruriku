/**
 * 公開サイトの絶対 URL（canonical・OGP・サイトマップ・robots.txt で使う）。
 *
 * - MIRURIKU_SITE_URL（例: https://13-115-193-47.sslip.io）で指定する。本番ではデプロイ時に
 *   DOMAIN から自動で設定する（deploy/compose.prod.yml → Dockerfile の build arg と実行時の環境変数）。
 * - メタデータはビルド時に、サイトマップはリクエスト時に読むため、両方で同じ値を渡す。
 * - 未設定・不正な値のときは null を返し、呼び出し側は絶対 URL を出さない
 *   （localhost などの誤った canonical を検索エンジンに伝えないため）。
 */
export function getSiteUrl(env: Readonly<Record<string, string | undefined>> = process.env): URL | null {
  const raw = env.MIRURIKU_SITE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  // パス付きの指定は受け付けず、オリジンに揃える（サブパス配信はしていない）
  return new URL(url.origin);
}

/** サイト内パスを絶対 URL にする（サイト URL が未設定なら null） */
export function absoluteUrl(path: string, siteUrl: URL | null = getSiteUrl()): string | null {
  if (!siteUrl) return null;
  return new URL(path, siteUrl).toString();
}
