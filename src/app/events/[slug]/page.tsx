import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, cache } from "react";

import { EventDetail } from "@/components/events/event-detail";
import { buildEventDescription, buildEventJsonLd, eventPath, serializeJsonLd } from "@/components/events/event-seo";
import { EventDetailSkeleton } from "@/components/events/event-skeletons";
import { BASE_OPEN_GRAPH, BASE_TWITTER, canonical } from "@/components/site/seo";
import { SiteShell } from "@/components/site/site-shell";
import { absoluteUrl } from "@/lib/site-url";
import { getNow } from "@/server/clock";
import { getPublicEventDetail } from "@/server/queries/public-events";

type Params = PageProps<"/events/[slug]">["params"];

/** generateMetadata とページ本体で同じリクエスト内の DB 読み取りを共有する */
const loadEvent = cache((slug: string) => getPublicEventDetail(slug));

/**
 * 大会名をタイトルにし、開催日と放送・配信先を入れた説明文・canonical・OGP を付ける。
 * ページ本体が params に依存して Suspense 内でリクエスト時に描画されるため、
 * メタデータもリクエスト時に解決される（"use cache" は付けない）。
 * デモ（架空）の大会は検索エンジンに載せない。
 */
export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) return { title: "大会が見つかりません", robots: { index: false } };
  const description = buildEventDescription(event);
  const path = eventPath(event.slug);
  return {
    title: event.name,
    description,
    ...canonical(path),
    openGraph: { ...BASE_OPEN_GRAPH, title: event.name, description, url: path },
    twitter: { ...BASE_TWITTER, title: event.name, description },
    ...(event.isDemo ? { robots: { index: false, follow: false } } : {}),
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
  return (
    <>
      {event.isDemo ? null : (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(buildEventJsonLd(event, absoluteUrl(eventPath(event.slug)))),
          }}
        />
      )}
      <EventDetail event={event} now={now} />
    </>
  );
}
