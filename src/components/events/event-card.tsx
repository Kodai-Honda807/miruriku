import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { PublicEventSummary } from "@/domain/types";

import { BroadcastInfoSummary } from "./broadcast-info";
import { BroadcastSlotList } from "./broadcast-slots";
import { buildEventScheduleView } from "./event-format";
import { EventScheduleSummary, EventVenueLine } from "./event-schedule";
import { ExternalLink } from "./external-link";
import { CategoryBadge, DemoBadge } from "./status-badges";

type EventCardProps = {
  event: PublicEventSummary;
  /** 基準時刻（年の表示判定に使う） */
  now: Date;
  /** 大会名の見出しレベル（一覧の見出し h2 の下に置くので既定は h3） */
  headingLevel?: "h2" | "h3";
};

/**
 * 一覧の大会カード。「いつ・どこで見られるか」をカードだけで判断できるよう、
 * 大会名・開催日・開始時刻と、放送・配信枠（媒体・局名・日時・条件）を表示する。
 * 出典・確認日時・補足などの長い説明は詳細ページに任せる（データは削除しない）。
 */
export function EventCard({ event, now, headingLevel = "h3" }: EventCardProps) {
  const Heading = headingLevel;
  const SubHeading = headingLevel === "h2" ? "h3" : "h4";
  const headingId = `event-${event.id}-name`;
  const broadcastHeadingId = `event-${event.id}-broadcast`;
  const schedule = buildEventScheduleView(event, now);

  return (
    <article
      data-testid="event-card"
      data-event-slug={event.slug}
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs sm:p-5"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={event.category} />
          {event.editionLabel ? (
            <span className="text-xs text-muted-foreground">{event.editionLabel}</span>
          ) : null}
          {event.isDemo ? <DemoBadge /> : null}
        </div>
        <Heading id={headingId} className="text-lg leading-snug font-bold text-pretty break-words [word-break:normal] sm:text-xl">
          {event.name}
        </Heading>
        <EventVenueLine event={event} />
      </header>

      <EventScheduleSummary view={schedule} />

      <section aria-labelledby={broadcastHeadingId} className="flex flex-col gap-2.5 border-t border-border pt-3">
        <SubHeading id={broadcastHeadingId} className="text-sm font-semibold">
          放送・配信
        </SubHeading>
        <BroadcastInfoSummary event={event} now={now} variant="compact" />
        <BroadcastSlotList
          slots={event.broadcasts}
          fallbackDate={event.startDate}
          now={now}
          variant="compact"
          headingLevel={SubHeading === "h3" ? "h4" : "h5"}
        />
      </section>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-sm">
        <Link
          href={`/events/${encodeURIComponent(event.slug)}`}
          aria-label={`${event.name}の大会詳細`}
          className="inline-flex items-center gap-0.5 rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          大会詳細
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
        <ExternalLink href={event.officialUrl} accessibleName={`${event.name}の大会公式サイト`}>
          大会公式サイト
        </ExternalLink>
      </footer>
    </article>
  );
}
