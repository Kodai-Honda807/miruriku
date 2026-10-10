/**
 * Next.js 16 の Proxy（旧 Middleware）。Node.js ランタイムで動く。
 *
 * 1. 管理画面（/admin）と管理用 API（/api/admin）を、管理機能が無効な環境では 404 にする。
 *    これは多層防御の 1 層目にすぎない。Server Action は action ID を知っていれば
 *    /admin 以外のパスにも POST できるため、各 Server Action・各ページでも isAdminEnabled() を確認している。
 *
 * 2. 大会詳細（/events/[slug]）で、公開中の大会がない slug（下書き・存在しない）を HTTP 404 にする。
 *    ページ本体は Suspense 内で notFound() するが、その時点では 200 でストリーミングが始まっているため
 *    （Next.js の仕様。docs: file-conventions/loading の Status codes）、ここで先に確認する。
 *    DB に接続できない場合は判定せず素通しし、ページ側のエラー表示に任せる。
 */
import { NextResponse, type NextRequest } from "next/server";

import { getSharedPrismaClient } from "@/lib/prisma";
import { isPublishedEventSlug } from "@/lib/public-event-lookup";
import { isAdminEnabled } from "@/server/admin-guard";

/** どのルートにも一致しないパス。ここへ rewrite すると、アプリの not-found 画面が 404 で返る */
export const NOT_FOUND_REWRITE_PATH = "/__miruriku_not_found";

export type ProxyDeps = {
  /** 公開中の大会の slug か（テストで差し替える） */
  isPublished: (slug: string) => Promise<boolean>;
};

const defaultDeps: ProxyDeps = {
  isPublished: (slug) => isPublishedEventSlug(getSharedPrismaClient(), slug),
};

export function proxy(request: NextRequest) {
  return handleProxy(request, defaultDeps);
}

export async function handleProxy(request: NextRequest, deps: ProxyDeps) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/events/")) {
    const rawSlug = pathname.slice("/events/".length).replace(/\/$/, "");
    let slug: string;
    try {
      slug = decodeURIComponent(rawSlug);
    } catch {
      return notFoundPage(request);
    }
    try {
      if (!(await deps.isPublished(slug))) return notFoundPage(request);
    } catch (error) {
      console.error("[proxy] 大会の公開状態を確認できませんでした", error);
    }
    return NextResponse.next();
  }

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

function notFoundPage(request: NextRequest) {
  return NextResponse.rewrite(new URL(NOT_FOUND_REWRITE_PATH, request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*", "/events/:slug"],
};
