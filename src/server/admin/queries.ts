/**
 * 管理画面用の読み取りクエリ（下書きを含む）。公開ページからは使わないこと。
 * 呼び出し側（Server Component）は <Suspense> 内で connection() の後に呼ぶ。
 */
import "server-only";

import type { ReviewStatus } from "@/domain/enums";
import { loadCurrentEventState } from "@/lib/event-state";
import { getPrisma } from "@/server/db";

import type { CandidateListFilter } from "./schemas";

export async function getDashboardSummary() {
  const db = getPrisma();
  const [published, draft, pending, latestRun, failedRuns] = await Promise.all([
    db.event.count({ where: { status: "PUBLISHED" } }),
    db.event.count({ where: { status: "DRAFT" } }),
    db.extractionCandidate.count({ where: { reviewStatus: "PENDING" } }),
    db.collectionRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { status: true, startedAt: true, source: { select: { event: { select: { name: true } } } } },
    }),
    db.collectionRun.count({ where: { status: "FAILED" } }),
  ]);
  return { published, draft, pending, latestRun, failedRuns };
}

export async function listAdminEvents() {
  return getPrisma().event.findMany({
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      editionLabel: true,
      status: true,
      isDemo: true,
      category: true,
      timezone: true,
      startDate: true,
      endDate: true,
      broadcastInfoStatus: true,
      series: { select: { name: true } },
      broadcasts: { select: { status: true } },
      _count: { select: { candidates: { where: { reviewStatus: "PENDING" } } } },
    },
  });
}

export async function listSeriesOptions() {
  return getPrisma().eventSeries.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

export async function getAdminEvent(id: string) {
  return getPrisma().event.findUnique({
    where: { id },
    include: {
      series: { select: { id: true, name: true, slug: true } },
      sessions: { orderBy: [{ sortOrder: "asc" }, { date: "asc" }, { createdAt: "asc" }] },
      broadcasts: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { source: { select: { id: true, kind: true, url: true, title: true } } },
      },
      sources: { orderBy: { createdAt: "asc" } },
      candidates: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, reviewStatus: true, createdAt: true, providerKind: true },
      },
    },
  });
}

export type AdminEvent = NonNullable<Awaited<ReturnType<typeof getAdminEvent>>>;

/** 放送枠・情報源の編集画面用（大会のタイムゾーン・情報源の一覧も返す） */
export async function getEventForSlotForm(eventId: string) {
  return getPrisma().event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      timezone: true,
      sources: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, url: true, title: true } },
    },
  });
}

export async function getSlot(eventId: string, slotId: string) {
  return getPrisma().broadcastSlot.findFirst({ where: { id: slotId, eventId } });
}

export async function getSource(eventId: string, sourceId: string) {
  return getPrisma().source.findFirst({ where: { id: sourceId, eventId } });
}

const REVIEW_STATUS_BY_FILTER: Record<Exclude<CandidateListFilter, "all">, ReviewStatus> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

export async function listCandidates(filter: CandidateListFilter) {
  return getPrisma().extractionCandidate.findMany({
    where: filter === "all" ? {} : { reviewStatus: REVIEW_STATUS_BY_FILTER[filter] },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      reviewStatus: true,
      reviewedAt: true,
      createdAt: true,
      fetchMode: true,
      providerKind: true,
      providerId: true,
      diff: true,
      event: { select: { id: true, name: true, status: true, isDemo: true } },
      source: { select: { url: true } },
    },
  });
}

export async function countCandidatesByStatus() {
  const rows = await getPrisma().extractionCandidate.groupBy({ by: ["reviewStatus"], _count: { _all: true } });
  const counts: Record<ReviewStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const row of rows) counts[row.reviewStatus] = row._count._all;
  return counts;
}

export async function getCandidateDetail(id: string) {
  return getPrisma().extractionCandidate.findUnique({
    where: { id },
    include: {
      event: { select: { id: true, name: true, slug: true, status: true, timezone: true, isDemo: true } },
      source: { select: { id: true, kind: true, url: true, title: true, lastFetchedAt: true } },
      run: {
        select: {
          id: true,
          status: true,
          fetchMode: true,
          providerId: true,
          providerKind: true,
          startedAt: true,
          finishedAt: true,
          httpStatus: true,
          finalUrl: true,
          contentType: true,
          errorCode: true,
        },
      },
    },
  });
}

/** 差分の再計算に使う、大会の現在の状態（下書きの枠を含む） */
export async function getCurrentEventState(eventId: string) {
  return loadCurrentEventState(getPrisma(), eventId);
}

export async function listCollectionRuns() {
  return getPrisma().collectionRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      source: { select: { url: true, event: { select: { id: true, name: true } } } },
      _count: { select: { candidates: true } },
    },
  });
}
