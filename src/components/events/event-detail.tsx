/**
 * 大会詳細ページの本文。
 *
 * 「大会公式」「実際に見るページ（視聴ページ）」「放送案内」「情報源・根拠」を見た目と文言で区別する。
 * 視聴ページの URL がない枠に、大会公式サイトなどを「見る」リンクとして出さない。
 */
import { ArrowLeft, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  JST,
  formatInstantJst,
  formatLocalDateJa,
  formatTimeJa,
  shouldShowYear,
  toZonedParts,
} from "@/domain/datetime";
import type { EventTiming } from "@/domain/event-timing";
import { CATEGORY_LABELS, SOURCE_KIND_LABELS } from "@/domain/labels";
import type { PublicEventDetail, PublicSession } from "@/domain/types";
import { safeExternalHref } from "@/domain/url";

import { BroadcastInfoSummary } from "./broadcast-info";
import { BroadcastSlotList } from "./broadcast-slots";
import { DemoNotice } from "./demo-notice";
import { buildEventScheduleView, countryNameJa, isOverseas } from "./event-format";
import { ExternalLink } from "./external-link";
import { CategoryBadge, DemoBadge } from "./status-badges";

type Props = {
  event: PublicEventDetail;
  now: Date;
};

/** 状況に応じた注意書き */
export function buildEventNotes(event: PublicEventDetail, timing: EventTiming): string[] {
  const notes: string[] = [];
  switch (event.broadcastInfoStatus) {
    case "UNVERIFIED":
      notes.push("放送・配信情報は未確認です。放送・配信がないという意味ではありません。");
      break;
    case "NOT_ANNOUNCED":
      notes.push("放送・配信の予定はまだ発表されていません（未発表であることを確認済み）。");
      break;
    case "NO_BROADCAST":
      notes.push("主催者などから、テレビ放送・ネット配信は行わないと案内されています。");
      break;
    case "PAST_REFERENCE":
      notes.push("今年の放送・配信情報は確認できていません。掲載している放送・配信は過去大会の参考情報で、今年も同じとは限りません。");
      break;
    case "CONFIRMED":
      break;
  }

  const slots = event.broadcasts;
  if (slots.some((s) => s.verificationStatus === "UNVERIFIED")) {
    notes.push("「未確認」と表示している放送・配信は、公式情報で確認できていません。");
  }
  if (event.broadcastInfoStatus !== "PAST_REFERENCE" && slots.some((s) => s.verificationStatus === "PAST_REFERENCE")) {
    notes.push("「過去大会の参考情報」と表示している放送・配信は、今年の予定ではありません。");
  }

  if (!timing.startTimeKnown) {
    notes.push(
      timing.isJapanTime
        ? "競技の開始時刻は未定です。"
        : "競技の開始時刻は未定です。開始時刻によっては、日本時間の日付が現地の日付と変わる場合があります。",
    );
  } else if (event.sessions.some((s) => s.startAt === null)) {
    notes.push("開始時刻が未定の日程があります。");
  }
  if (timing.jstDateDiffersFromLocal) {
    notes.push("この大会は、日本時間の日付が現地の日付と異なります。");
  }
  if (!timing.isJapanTime) {
    notes.push("日付・時刻は日本時間で表示し、「現地」と明記したものだけ開催地の時刻です。");
  }

  if (slots.some((s) => s.region === "REGIONAL")) {
    notes.push("地域限定の放送があります。お住まいの地域で視聴できるかご確認ください。");
  }
  if (slots.some((s) => s.region === "JAPAN_UNKNOWN")) {
    notes.push("日本からの視聴可否が確認できていない配信があります。");
  }
  notes.push("放送・配信の予定は変更される場合があります。視聴前に必ず公式情報をご確認ください。");
  return notes;
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-bold sm:text-xl">
      {children}
    </h2>
  );
}

const sectionClass = "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5";
const dlClass = "grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm";
const dtClass = "text-muted-foreground";

function sessionJstLabel(session: PublicSession, isJapanTime: boolean, now: Date): string {
  if (!session.startAt) return "未定";
  if (isJapanTime) return formatTimeJa(toZonedParts(session.startAt, JST).time);
  const jstDate = toZonedParts(session.startAt, JST).date;
  return formatInstantJst(session.startAt, { withYear: shouldShowYear(jstDate, now) });
}

function sessionLocalLabel(session: PublicSession, timezone: string, now: Date): string {
  if (!session.startAt) return "未定";
  const local = toZonedParts(session.startAt, timezone);
  return `${formatLocalDateJa(local.date, { withYear: shouldShowYear(local.date, now) })}${formatTimeJa(local.time)}`;
}

function SessionsTable({ event, isJapanTime, now }: { event: PublicEventDetail; isJapanTime: boolean; now: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="mb-2 text-left text-sm font-semibold">
          日程別の開始時刻{isJapanTime ? "" : "（日本時間と現地時刻）"}
        </caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2 pr-3 font-medium">
              日程
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {isJapanTime ? "日付" : "現地日付"}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {isJapanTime ? "開始時刻" : "開始（日本時間）"}
            </th>
            {isJapanTime ? null : (
              <th scope="col" className="py-2 pr-3 font-medium">
                開始（現地時刻）
              </th>
            )}
            <th scope="col" className="py-2 font-medium">
              備考
            </th>
          </tr>
        </thead>
        <tbody>
          {event.sessions.map((session) => (
            <tr key={session.id} className="border-b border-border align-top last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                {session.name}
              </th>
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                {formatLocalDateJa(session.date, { withYear: shouldShowYear(session.date, now) })}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                {sessionJstLabel(session, isJapanTime, now)}
              </td>
              {isJapanTime ? null : (
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                  {sessionLocalLabel(session, event.timezone, now)}
                </td>
              )}
              <td className="py-2 text-muted-foreground">{session.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sourceDisplayText(url: string, title: string | null): string {
  if (title?.trim()) return title.trim();
  const href = safeExternalHref(url);
  if (!href) return url;
  const parsed = new URL(href);
  return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

export function EventDetail({ event, now }: Props) {
  const schedule = buildEventScheduleView(event, now, { forceYear: true });
  const { labels, timing } = schedule;
  const notes = buildEventNotes(event, timing);
  const overseas = isOverseas(event);
  const officialHref = safeExternalHref(event.officialUrl);
  const hasAnySlot = event.broadcasts.length > 0;

  return (
    <article data-testid="event-detail" data-event-slug={event.slug} className="flex flex-col gap-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          大会一覧へ戻る
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={event.category} />
          {event.editionLabel ? <span className="text-sm text-muted-foreground">{event.editionLabel}</span> : null}
          {event.isDemo ? <DemoBadge /> : null}
        </div>
        <h1 className="text-2xl leading-snug font-bold text-balance sm:text-3xl">{event.name}</h1>
        {event.description ? <p className="text-sm text-foreground sm:text-base">{event.description}</p> : null}
      </header>

      {event.isDemo ? (
        <DemoNotice>
          <strong className="font-semibold">この大会は動作確認用の架空のデモデータです。</strong>
          実在の大会・放送局・配信サービスとは関係ありません。
        </DemoNotice>
      ) : null}

      <section aria-labelledby="event-schedule-heading" className={sectionClass}>
        <SectionHeading id="event-schedule-heading">開催日時</SectionHeading>
        <dl className={dlClass}>
          <dt className={dtClass}>開催日（{labels.dateBasisLabel}）</dt>
          <dd className="font-semibold tabular-nums">{labels.dateLabel}</dd>
          <dt className={dtClass}>{timing.isMultiDay ? "初日の競技開始" : "競技開始"}</dt>
          <dd>
            {labels.startTimeLabel ? (
              <>
                <span className="font-semibold tabular-nums">{labels.startTimeLabel}</span>
                <span className="text-muted-foreground">（日本時間）</span>
              </>
            ) : (
              <span className="font-medium text-amber-900">{labels.startTimeUnknownLabel}</span>
            )}
          </dd>
          {labels.localLabel ? (
            <>
              <dt className={dtClass}>現地日時</dt>
              <dd>{labels.localLabel}</dd>
            </>
          ) : null}
        </dl>
        {timing.jstDateDiffersFromLocal ? (
          <p className="text-sm font-medium text-amber-900">※ 日本時間では現地と日付が異なります。</p>
        ) : null}
        {event.sessions.length > 0 ? (
          <SessionsTable event={event} isJapanTime={timing.isJapanTime} now={now} />
        ) : null}
      </section>

      <section aria-labelledby="event-broadcast-heading" className={sectionClass}>
        <SectionHeading id="event-broadcast-heading">放送・配信</SectionHeading>
        <BroadcastInfoSummary event={event} now={now} variant="full" />
        {hasAnySlot ? (
          <BroadcastSlotList
            slots={event.broadcasts}
            fallbackDate={event.startDate}
            now={now}
            variant="full"
            headingLevel="h3"
          />
        ) : event.broadcastInfoStatus !== "NO_BROADCAST" ? (
          <p className="text-sm text-muted-foreground">掲載できる放送・配信の情報はまだありません。</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          「視聴ページ」は実際に放送・配信を見るページ、「放送案内」は放送局・配信サービスによる番組・配信の案内ページです。
        </p>
      </section>

      <section aria-labelledby="event-notes-heading" className={sectionClass}>
        <SectionHeading id="event-notes-heading">ご注意</SectionHeading>
        <ul className="flex flex-col gap-1.5 text-sm" data-testid="event-notes">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="event-venue-heading" className={sectionClass}>
        <SectionHeading id="event-venue-heading">開催場所</SectionHeading>
        <dl className={dlClass}>
          <dt className={dtClass}>会場</dt>
          <dd>{event.venueName ?? "未登録"}</dd>
          {event.venueRegion ? (
            <>
              <dt className={dtClass}>地域</dt>
              <dd>{event.venueRegion}</dd>
            </>
          ) : null}
          <dt className={dtClass}>国・地域</dt>
          <dd>
            {countryNameJa(event.countryCode)}
            {overseas ? <span className="text-muted-foreground">（海外開催）</span> : null}
          </dd>
          {!timing.isJapanTime ? (
            <>
              <dt className={dtClass}>開催地の時間帯</dt>
              <dd>
                {event.timezone}
                <span className="text-muted-foreground">（日本時間とは異なります）</span>
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="event-about-heading" className={sectionClass}>
        <SectionHeading id="event-about-heading">大会情報</SectionHeading>
        <dl className={dlClass}>
          <dt className={dtClass}>大会シリーズ</dt>
          <dd>{event.seriesName}</dd>
          {event.editionLabel ? (
            <>
              <dt className={dtClass}>開催回</dt>
              <dd>{event.editionLabel}</dd>
            </>
          ) : null}
          <dt className={dtClass}>競技</dt>
          <dd>{CATEGORY_LABELS[event.category]}</dd>
          <dt className={dtClass}>大会公式</dt>
          <dd>
            {officialHref ? (
              <ExternalLink href={officialHref} accessibleName={`${event.name}の大会公式サイト`}>
                大会公式サイト
              </ExternalLink>
            ) : (
              <span className="text-muted-foreground">大会公式サイトは未登録です</span>
            )}
          </dd>
        </dl>
        {officialHref ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            大会公式サイトは要項・結果などの公式情報のページです。放送・配信を見るページではありません。
          </p>
        ) : null}
      </section>

      <section aria-labelledby="event-sources-heading" className={sectionClass}>
        <SectionHeading id="event-sources-heading">情報源・根拠</SectionHeading>
        {event.sources.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {event.sources.map((source) => {
              const kindLabel = SOURCE_KIND_LABELS[source.kind];
              const text = sourceDisplayText(source.url, source.title);
              return (
                <li key={source.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium">
                    {kindLabel}
                  </span>
                  {safeExternalHref(source.url) ? (
                    <ExternalLink href={source.url} accessibleName={`${kindLabel}: ${text}`} className="font-normal">
                      {text}
                    </ExternalLink>
                  ) : (
                    <span className="break-all text-muted-foreground">{text}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">登録されている情報源はありません。</p>
        )}
        <p className="text-xs text-muted-foreground">
          掲載内容の根拠として確認した主な情報源です。最新の情報は各公式サイトでご確認ください。
        </p>
      </section>

      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          大会一覧へ戻る
        </Link>
      </div>
    </article>
  );
}
