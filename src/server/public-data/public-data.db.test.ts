/**
 * 公開データ（ファイル版）が、DB に反映して公開用クエリで読んだ結果（DB 版）と一致することの確認。
 * 静的配信へ移行する前は DB 版が本番の表示だったため、移行で表示が変わらないことをここで保証する。
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { REAL_EVENTS } from "../../../data/real-events";
import { loadRealEvents } from "../../../prisma/real-events";
import { createTestPrisma, resetDatabase } from "../../../test/db";
import type { PublicEventDetail } from "@/domain/types";

import { listPublicEventDetailsFrom } from "../queries/public-events";
import { publicEventsFromRealEvents } from "./from-real-events";
import { parsePublicData, serializePublicData } from "./json";

const prisma = createTestPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

/** ID は DB では自動採番のため比較から外す */
function withoutIds(events: readonly PublicEventDetail[]) {
  return events.map(({ id: _id, broadcasts, sessions, sources, ...rest }) => ({
    ...rest,
    broadcasts: broadcasts.map(({ id: _b, ...b }) => b),
    sessions: sessions.map(({ id: _s, ...s }) => s),
    sources: sources.map(({ id: _r, ...r }) => r),
  }));
}

describe("公開データ（ファイル版）と DB 版の一致", () => {
  it("data/real-events.ts の全大会で、項目・値・並び順が DB 版と一致する", async () => {
    await loadRealEvents(prisma, REAL_EVENTS);
    const fromDb = await listPublicEventDetailsFrom(prisma);
    const fromFile = publicEventsFromRealEvents(REAL_EVENTS);
    expect(fromFile.map((e) => e.slug)).toEqual(fromDb.map((e) => e.slug));
    expect(withoutIds(fromFile)).toEqual(withoutIds(fromDb));
  });

  it("DB 版を JSON に書き出して読み込んでも変わらない（E2E の静的ビルドで使う経路）", async () => {
    await loadRealEvents(prisma, REAL_EVENTS);
    const fromDb = await listPublicEventDetailsFrom(prisma);
    expect(parsePublicData(serializePublicData(fromDb))).toEqual(fromDb);
  });
});
