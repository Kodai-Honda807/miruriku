import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EventDetailLive } from "@/components/events/event-detail-live";
import { buildEventDescription, buildEventJsonLd, eventPath, serializeJsonLd } from "@/components/events/event-seo";
import { BASE_OPEN_GRAPH, BASE_TWITTER, canonical } from "@/components/site/seo";
import { SiteShell } from "@/components/site/site-shell";
import { getNow } from "@/lib/clock";
import { absoluteUrl } from "@/lib/site-url";
import { getPublicEvent, listPublicEventDetails } from "@/server/public-data";

/**
 * 大会詳細。ビルド時に公開中の大会の数だけ /events/<slug>/index.html を書き出す。
 * それ以外の slug（下書き・存在しない）はページ自体がなく、配信側で 404 になる（dynamicParams = false）。
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return listPublicEventDetails().map((event) => ({ slug: event.slug }));
}

/**
 * 大会名をタイトルにし、開催日と放送・配信先を入れた説明文・canonical・OGP を付ける。
 * デモ（架空）の大会は検索エンジンに載せない。
 */
export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = getPublicEvent(slug);
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

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const event = getPublicEvent(slug);
  if (!event) notFound();
  return (
    <SiteShell>
      {event.isDemo ? null : (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(buildEventJsonLd(event, absoluteUrl(eventPath(event.slug)))),
          }}
        />
      )}
      <EventDetailLive event={event} initialNow={getNow().toISOString()} />
    </SiteShell>
  );
}
