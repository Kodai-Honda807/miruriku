/**
 * 収集候補の差分表示（Server Component でも Client Component でも使える純粋な表示部品）。
 * 抽出結果（外部ページ由来）の文字列はすべてプレーンテキストとして描画する。HTML として解釈しない。
 */
import type { ReactNode } from "react";

import type { NormalizedBroadcast, NormalizedExtraction } from "@/domain/candidate";
import type { CandidateDiff, SlotDiffItem } from "@/domain/diff";
import { formatBroadcastTiming } from "@/domain/event-timing";
import {
  BROADCAST_MEDIUM_LABELS,
  COST_TYPE_LABELS,
  REGION_AVAILABILITY_LABELS,
  VIEWING_TYPE_LABELS,
} from "@/domain/labels";
import { safeExternalHref } from "@/domain/url";
import { Badge } from "@/components/ui/badge";

import {
  EVENT_FIELD_LABELS,
  EXTRACTED_BROADCAST_STATUS_LABELS,
  SLOT_FIELD_LABELS,
  formatEventDiffValue,
  formatSlotDiffValue,
} from "./format";

type CandidateDiffViewProps = {
  diff: CandidateDiff;
  payload: NormalizedExtraction;
  eventTimezone: string;
};

const KIND_LABELS: Record<SlotDiffItem["kind"], string> = {
  add: "追加",
  update: "更新",
  unchanged: "変更なし",
};

function ExternalText({ url }: { url: string }) {
  const href = safeExternalHref(url);
  if (!href) return <span className="break-all">{url}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">
      {url}
    </a>
  );
}

function proposedTiming(p: NormalizedBroadcast): string {
  return formatBroadcastTiming(
    {
      airDate: p.airDate,
      startAt: p.startAt ? new Date(p.startAt) : null,
      endAt: p.endAt ? new Date(p.endAt) : null,
    },
    { withYear: true },
  );
}

function ProposedDetails({ p }: { p: NormalizedBroadcast }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: "日時（日本時間）", value: proposedTiming(p) },
    { label: "料金", value: COST_TYPE_LABELS[p.cost] },
    { label: "視聴形態", value: VIEWING_TYPE_LABELS[p.viewingType] },
    { label: "視聴地域", value: REGION_AVAILABILITY_LABELS[p.region] },
  ];
  if (p.regionNote) rows.push({ label: "視聴地域の補足", value: p.regionNote });
  if (p.note) rows.push({ label: "補足", value: p.note });
  if (p.watchUrl) rows.push({ label: "視聴 URL", value: <ExternalText url={p.watchUrl} /> });
  if (p.infoUrl) rows.push({ label: "案内 URL", value: <ExternalText url={p.infoUrl} /> });
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="whitespace-pre-wrap">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ChangeTable({
  caption,
  rows,
}: {
  caption: string;
  rows: { key: string; label: string; before: string; after: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="py-1.5 pr-4 font-medium">
              項目
            </th>
            <th scope="col" className="py-1.5 pr-4 font-medium">
              変更前
            </th>
            <th scope="col" className="py-1.5 font-medium">
              変更後
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b align-top last:border-0">
              <th scope="row" className="py-1.5 pr-4 font-normal text-muted-foreground">
                {row.label}
              </th>
              <td className="py-1.5 pr-4 break-all whitespace-pre-wrap">
                <span className="sr-only">変更前: </span>
                <del className="text-muted-foreground">{row.before}</del>
              </td>
              <td className="py-1.5 break-all whitespace-pre-wrap">
                <span className="sr-only">変更後: </span>
                <ins className="font-medium no-underline">{row.after}</ins>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlotItem({ item }: { item: SlotDiffItem }) {
  const p = item.proposed;
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.kind === "add" ? "default" : item.kind === "update" ? "secondary" : "outline"}>
          {KIND_LABELS[item.kind]}
        </Badge>
        <span className="font-medium">
          {BROADCAST_MEDIUM_LABELS[p.medium]} / {p.providerName}
        </span>
        <span className="text-sm text-muted-foreground">{proposedTiming(p)}</span>
      </div>
      {item.kind === "add" ? <ProposedDetails p={p} /> : null}
      {item.kind === "update" ? (
        <ChangeTable
          caption={`${p.providerName} の変更`}
          rows={item.changes.map((c) => ({
            key: c.field,
            label: SLOT_FIELD_LABELS[c.field],
            before: formatSlotDiffValue(c.field, c.before),
            after: formatSlotDiffValue(c.field, c.after),
          }))}
        />
      ) : null}
      {item.kind === "unchanged" ? (
        <p className="text-sm text-muted-foreground">
          既存の枠と同じ内容です。承認すると確認日時を更新し、公開・確認済みにします。
        </p>
      ) : null}
      {p.evidence ? (
        <figure className="grid gap-1">
          <figcaption className="text-xs text-muted-foreground">根拠の引用（抽出結果。そのまま表示しています）</figcaption>
          <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap break-words">{p.evidence}</blockquote>
        </figure>
      ) : null}
    </li>
  );
}

export function CandidateDiffView({ diff, payload, eventTimezone }: CandidateDiffViewProps) {
  return (
    <div className="grid gap-6">
      <p className="text-sm">
        差分は現在の公開データに対して再計算しています（下書きの放送枠を含む）。承認時にも、その時点のデータに対してもう一度計算して反映します。
        候補で不明な値は既存の値を上書きしません。
      </p>
      {!diff.hasChanges ? (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          公開データに変更はありません。承認すると確認日時だけが更新されます。
        </p>
      ) : null}

      <section aria-labelledby="diff-page-status" className="grid gap-2">
        <h3 id="diff-page-status" className="font-medium">
          ページ上の放送・配信の記載
        </h3>
        <p className="text-sm">{EXTRACTED_BROADCAST_STATUS_LABELS[payload.broadcastStatus] ?? payload.broadcastStatus}</p>
      </section>

      <section aria-labelledby="diff-event" className="grid gap-2">
        <h3 id="diff-event" className="font-medium">
          大会の項目
        </h3>
        {diff.eventChanges.length > 0 ? (
          <ChangeTable
            caption="大会の項目の変更"
            rows={diff.eventChanges.map((c) => ({
              key: c.field,
              label: EVENT_FIELD_LABELS[c.field],
              before: formatEventDiffValue(c.field, c.before, eventTimezone),
              after: formatEventDiffValue(c.field, c.after, eventTimezone),
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">変更はありません。</p>
        )}
      </section>

      <section aria-labelledby="diff-slots" className="grid gap-2">
        <h3 id="diff-slots" className="font-medium">
          放送・配信枠（候補に含まれる {diff.slots.length} 件）
        </h3>
        {diff.slots.length > 0 ? (
          <ul className="grid gap-3">
            {diff.slots.map((item) => (
              <SlotItem key={item.itemKey} item={item} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">候補に放送・配信枠は含まれていません。</p>
        )}
      </section>

      <section aria-labelledby="diff-untouched" className="grid gap-2">
        <h3 id="diff-untouched" className="font-medium">
          候補に含まれない既存の放送枠（自動では削除しません）
        </h3>
        {diff.untouchedSlots.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {diff.untouchedSlots.map((s) => (
              <li key={s.slotId}>
                {BROADCAST_MEDIUM_LABELS[s.medium]} / {s.providerName}（
                {formatBroadcastTiming(
                  { airDate: s.airDate, startAt: s.startAt ? new Date(s.startAt) : null, endAt: null },
                  { withYear: true },
                )}
                ）
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ありません。</p>
        )}
      </section>

      {payload.notes ? (
        <section aria-labelledby="diff-notes" className="grid gap-2">
          <h3 id="diff-notes" className="font-medium">
            抽出時のメモ（そのまま表示しています）
          </h3>
          <p className="text-sm whitespace-pre-wrap break-words">{payload.notes}</p>
        </section>
      ) : null}

      {payload.event.startDate || payload.event.startAt || payload.event.venueName ? (
        <section aria-labelledby="diff-extracted-event" className="grid gap-2">
          <h3 id="diff-extracted-event" className="font-medium">
            抽出された大会情報
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">開始日（現地）</dt>
            <dd>{formatEventDiffValue("startDate", payload.event.startDate, eventTimezone)}</dd>
            <dt className="text-muted-foreground">終了日（現地）</dt>
            <dd>{formatEventDiffValue("endDate", payload.event.endDate, eventTimezone)}</dd>
            <dt className="text-muted-foreground">競技開始日時</dt>
            <dd>{formatEventDiffValue("startAt", payload.event.startAt, eventTimezone)}</dd>
            <dt className="text-muted-foreground">会場</dt>
            <dd>{formatEventDiffValue("venueName", payload.event.venueName, eventTimezone)}</dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
