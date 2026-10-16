/**
 * Next.js 16 の Proxy（旧 Middleware）。開発サーバー（next dev）でだけ使う（*.dynamic.ts は静的ビルドに含めない）。
 *
 * 管理画面（/admin）と管理用 API（/api/admin）を、管理機能が無効な環境では 404 にする。
 * これは多層防御の 1 層目にすぎない。Server Action は action ID を知っていれば
 * /admin 以外のパスにも POST できるため、各 Server Action・各ページでも isAdminEnabled() を確認している。
 *
 * 公開サイトは静的配信のため、管理画面は本番に存在しない（静的ビルドから除外。next.config.ts）。
 * 大会詳細の 404 は、ビルド時に生成したページ以外を返さないことで扱う（generateStaticParams / dynamicParams = false）。
 */
import { NextResponse } from "next/server";

import { isAdminEnabled } from "@/server/admin-guard";

export function proxy() {
  if (!isAdminEnabled()) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
};
