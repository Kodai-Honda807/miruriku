import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, cache } from "react";

import { EventDetail } from "@/components/events/event-detail";
import { EventDetailSkeleton } from "@/components/events/event-skeletons";
import { SiteShell } from "@/components/site/site-shell";
import { getNow } from "@/server/clock";
import { getPublicEventDetail } from "@/server/queries/public-events";

type Params = PageProps<"/events/[slug]">["params"];

/** generateMetadata とページ本体で同じリクエスト内の DB 読み取りを共有する */
const loadEvent = cache((slug: string) => getPublicEventDetail(slug));

/**
 * 大会名をタイトルにする。ページ本体が params に依存して Suspense 内でリクエスト時に描画されるため、
 * メタデータもリクエスト時に解決される（"use cache" は付けない）。
 */
export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) return { title: "大会が見つかりません" };
  return {
    title: event.name,
    description: `${event.name}の開催日程と、日本から視聴できるテレビ放送・ネット配信の情報。`,
  };
}

/**
 * 大会詳細。params は <Suspense> の内側の子コンポーネントで await する（Cache Components）。
 * 下書き・存在しない slug は notFound()。
 */
export default function EventPage({ params }: PageProps<"/events/[slug]">) {
  return (
    <SiteShell>
      <Suspense fallback={<EventDetailSkeleton />}>
        <EventDetailContent params={params} />
      </Suspense>
    </SiteShell>
  );
}

async function EventDetailContent({ params }: { params: Params }) {
  const { slug } = await params;
  await connection();
  const now = getNow();
  const event = await loadEvent(slug);
  if (!event) notFound();
  return <EventDetail event={event} now={now} />;
}
