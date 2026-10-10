"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BROADCAST_INFO_STATUSES, CATEGORIES } from "@/domain/enums";
import { BROADCAST_INFO_STATUS_LABELS, CATEGORY_LABELS } from "@/domain/labels";
import { initialFormState, type FormState } from "@/server/admin/form-state";

import { CheckboxField, Field, FormMessage, SelectControl, formValues, optionsFromLabels } from "./form-controls";
import { TIME_ZONE_SUGGESTIONS } from "./options";

export type SeriesOption = { id: string; name: string; slug: string };

type EventFormProps = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** 各項目の初期値（name → 文字列。チェックボックスは "on" で選択） */
  defaults: Record<string, string>;
  seriesOptions: SeriesOption[];
  submitLabel: string;
  /** 人が放送情報を最後に確認した日時の表示（編集時） */
  lastCheckedLabel?: string | null;
};

export function EventForm({ action, defaults, seriesOptions, submitLabel, lastCheckedLabel }: EventFormProps) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} noValidate className="grid gap-6" aria-label="大会情報">
      <FormMessage state={state} />
      {/* 送信ごとに作り直し、エラー時は送信した値を初期値として復元する */}
      <EventFormFields
        key={state.attempt}
        state={state}
        defaults={defaults}
        seriesOptions={seriesOptions}
        lastCheckedLabel={lastCheckedLabel}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {submitLabel}
        </Button>
        {pending ? (
          <span role="status" className="text-sm text-muted-foreground">
            保存しています…
          </span>
        ) : null}
      </div>
    </form>
  );
}

function EventFormFields({
  state,
  defaults,
  seriesOptions,
  lastCheckedLabel,
}: {
  state: FormState;
  defaults: Record<string, string>;
  seriesOptions: SeriesOption[];
  lastCheckedLabel?: string | null;
}) {
  const v = formValues(state, defaults);
  const e = state.fieldErrors;
  const initialMode = v("seriesMode") === "new" || seriesOptions.length === 0 ? "new" : "existing";
  const [seriesMode, setSeriesMode] = useState<"existing" | "new">(initialMode);

  return (
    <>
      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">大会シリーズ</legend>
        <div role="radiogroup" aria-label="シリーズの指定方法" className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="seriesMode"
              value="existing"
              checked={seriesMode === "existing"}
              onChange={() => setSeriesMode("existing")}
              disabled={seriesOptions.length === 0}
              className="size-4 accent-primary"
            />
            既存のシリーズから選ぶ
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="seriesMode"
              value="new"
              checked={seriesMode === "new"}
              onChange={() => setSeriesMode("new")}
              className="size-4 accent-primary"
            />
            新しいシリーズを作る
          </label>
        </div>
        {seriesMode === "existing" ? (
          <Field name="seriesId" label="シリーズ" required errors={e.seriesId}>
            {(p) => (
              <SelectControl
                {...p}
                defaultValue={v("seriesId")}
                placeholder="選択してください"
                options={seriesOptions.map((s) => ({ value: s.id, label: `${s.name}（${s.slug}）` }))}
              />
            )}
          </Field>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="newSeriesName" label="新しいシリーズ名" required errors={e.newSeriesName} hint="例: みる陸デモ市民マラソン">
              {(p) => <Input {...p} defaultValue={v("newSeriesName")} autoComplete="off" />}
            </Field>
            <Field
              name="newSeriesSlug"
              label="新しいシリーズの slug"
              required
              errors={e.newSeriesSlug}
              hint="半角英小文字・数字・ハイフン（例: city-marathon）"
            >
              {(p) => <Input {...p} defaultValue={v("newSeriesSlug")} autoComplete="off" spellCheck={false} />}
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium">基本情報</legend>
        <Field name="name" label="大会名" required errors={e.name} className="md:col-span-2">
          {(p) => <Input {...p} defaultValue={v("name")} autoComplete="off" />}
        </Field>
        <Field
          name="slug"
          label="slug"
          required
          errors={e.slug}
          hint="公開ページの URL に使う識別子。半角英小文字・数字・ハイフン（例: city-marathon-2026）"
        >
          {(p) => <Input {...p} defaultValue={v("slug")} autoComplete="off" spellCheck={false} />}
        </Field>
        <Field name="editionLabel" label="回" errors={e.editionLabel} hint="例: 第103回（任意）">
          {(p) => <Input {...p} defaultValue={v("editionLabel")} autoComplete="off" />}
        </Field>
        <Field name="seasonYear" label="開催年" required errors={e.seasonYear} hint="西暦 4 桁">
          {(p) => <Input {...p} defaultValue={v("seasonYear")} inputMode="numeric" autoComplete="off" />}
        </Field>
        <Field name="category" label="カテゴリ" required errors={e.category}>
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("category")}
              placeholder="選択してください"
              options={optionsFromLabels(CATEGORIES, CATEGORY_LABELS)}
            />
          )}
        </Field>
        <Field name="description" label="説明" errors={e.description} className="md:col-span-2">
          {(p) => <Textarea {...p} defaultValue={v("description")} rows={3} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium">開催日時・会場（開催地の現地時刻）</legend>
        <Field name="startDate" label="開始日（現地日付）" required errors={e.startDate}>
          {(p) => <Input {...p} type="date" defaultValue={v("startDate")} />}
        </Field>
        <Field name="endDate" label="終了日（現地日付）" required errors={e.endDate} hint="単日開催なら開始日と同じ日付">
          {(p) => <Input {...p} type="date" defaultValue={v("endDate")} />}
        </Field>
        <Field
          name="startTime"
          label="競技開始時刻（現地時刻・任意）"
          errors={e.startTime}
          hint="開催地のタイムゾーンでの時刻。空欄は「開始時刻不明」として保存します（0:00 などの仮の時刻は入れないでください）"
        >
          {(p) => <Input {...p} type="time" defaultValue={v("startTime")} />}
        </Field>
        <Field
          name="timezone"
          label="タイムゾーン（IANA）"
          required
          errors={e.timezone}
          hint="開催地のタイムゾーン。候補から選ぶか、IANA の名前（例: Europe/Berlin）を入力"
        >
          {(p) => (
            <>
              <Input {...p} defaultValue={v("timezone")} list="admin-timezone-options" autoComplete="off" spellCheck={false} />
              <datalist id="admin-timezone-options">
                {TIME_ZONE_SUGGESTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field name="venueName" label="会場" errors={e.venueName}>
          {(p) => <Input {...p} defaultValue={v("venueName")} autoComplete="off" />}
        </Field>
        <Field name="venueRegion" label="地域" errors={e.venueRegion} hint="都市・地域名（例: 東京都）">
          {(p) => <Input {...p} defaultValue={v("venueRegion")} autoComplete="off" />}
        </Field>
        <Field name="countryCode" label="国コード" required errors={e.countryCode} hint="ISO 3166-1 の 2 文字（例: JP、US）">
          {(p) => (
            <Input {...p} defaultValue={v("countryCode")} maxLength={2} autoComplete="off" spellCheck={false} className="w-24" />
          )}
        </Field>
        <Field name="officialUrl" label="大会公式 URL" errors={e.officialUrl} hint="http:// または https:// の URL（任意）">
          {(p) => <Input {...p} defaultValue={v("officialUrl")} inputMode="url" autoComplete="off" spellCheck={false} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">放送・配信情報（大会全体）</legend>
        <Field
          name="broadcastInfoStatus"
          label="放送情報の状態"
          required
          errors={e.broadcastInfoStatus}
          hint="「未確認」は「放送・配信なし」ではありません。公式に放送・配信なしと案内されている場合だけ「放送・配信なし」を選んでください。"
        >
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("broadcastInfoStatus")}
              options={optionsFromLabels(BROADCAST_INFO_STATUSES, BROADCAST_INFO_STATUS_LABELS)}
            />
          )}
        </Field>
        <Field name="broadcastNote" label="放送情報の補足（公開）" errors={e.broadcastNote}>
          {(p) => <Textarea {...p} defaultValue={v("broadcastNote")} rows={2} />}
        </Field>
        <CheckboxField
          name="markBroadcastChecked"
          label="放送情報を今確認した（人が確認した日時を現在時刻に更新する）"
          hint={lastCheckedLabel ? `前回の確認: ${lastCheckedLabel}` : "まだ確認日時は記録されていません"}
          errors={e.markBroadcastChecked}
          defaultChecked={v("markBroadcastChecked") === "on"}
        />
      </fieldset>
    </>
  );
}
