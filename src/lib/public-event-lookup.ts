/**
 * 公開中の大会の slug かどうかを軽量に確認する（Proxy で HTTP 404 を返すために使う）。
 * 本文の取得は行わない。
 */
import type { DbClient } from "./event-state";

/** 管理画面の slug 検証と同じ形式。これに合わない slug は DB を引かずに存在しないとみなす */
export const EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function isPublishedEventSlug(db: DbClient, slug: string): Promise<boolean> {
  if (!EVENT_SLUG_PATTERN.test(slug) || slug.length > 200) return false;
  const event = await db.event.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true },
  });
  return event !== null;
}
