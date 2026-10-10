/**
 * 死活監視用のエンドポイント（コンテナの HEALTHCHECK、ロードバランサー、E2E の起動待ちに使う）。
 * プロセスが応答できることだけを返し、DB には接続しない（DB 障害で Web コンテナが再起動され続けないように）。
 */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
