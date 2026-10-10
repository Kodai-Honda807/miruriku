"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BROADCAST_MEDIA,
  COST_TYPES,
  PUBLICATION_STATUSES,
  REGION_AVAILABILITIES,
  SLOT_VERIFICATION_STATUSES,
  VIEWING_TYPES,
} from "@/domain/enums";
import {
  BROADCAST_MEDIUM_LABELS,
  COST_TYPE_LABELS,
  PUBLICATION_STATUS_LABELS,
  REGION_AVAILABILITY_LABELS,
  SLOT_VERIFICATION_STATUS_LABELS,
  VIEWING_TYPE_LABELS,
} from "@/domain/labels";
import { initialFormState, type FormState } from "@/server/admin/form-state";

import { CheckboxField, Field, FormMessage, SelectControl, formValues, optionsFromLabels } from "./form-controls";

export type SourceOption = { id: string; label: string };

type SlotFormProps = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: Record<string, string>;
  sourceOptions: SourceOption[];
  submitLabel: string;
  lastVerifiedLabel?: string | null;
};

export function SlotForm({ action, defaults, sourceOptions, submitLabel, lastVerifiedLabel }: SlotFormProps) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} noValidate className="grid gap-6" aria-label="放送・配信枠">
      <FormMessage state={state} />
      <SlotFormFields
        key={state.attempt}
        state={state}
        defaults={defaults}
        sourceOptions={sourceOptions}
        lastVerifiedLabel={lastVerifiedLabel}
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

function SlotFormFields({
  state,
  defaults,
  sourceOptions,
  lastVerifiedLabel,
}: {
  state: FormState;
  defaults: Record<string, string>;
  sourceOptions: SourceOption[];
  lastVerifiedLabel?: string | null;
}) {
  const v = formValues(state, defaults);
  const e = state.fieldErrors;
  return (
    <>
      <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium">媒体・局</legend>
        <Field name="medium" label="媒体" required errors={e.medium}>
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("medium")}
              placeholder="選択してください"
              options={optionsFromLabels(BROADCAST_MEDIA, BROADCAST_MEDIUM_LABELS)}
            />
          )}
        </Field>
        <Field name="providerName" label="局・サービス名" required errors={e.providerName}>
          {(p) => <Input {...p} defaultValue={v("providerName")} autoComplete="off" />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-medium">放送・配信の日時（日本時間）</legend>
        <Field name="airDate" label="放送日（日本時間）" errors={e.airDate} hint="時刻を入れる場合は必須">
          {(p) => <Input {...p} type="date" defaultValue={v("airDate")} />}
        </Field>
        <Field name="startTime" label="開始時刻（日本時間）" errors={e.startTime}>
          {(p) => <Input {...p} type="time" defaultValue={v("startTime")} />}
        </Field>
        <Field
          name="endTime"
          label="終了時刻（日本時間）"
          errors={e.endTime}
          hint="開始時刻以前の時刻は翌日として扱います（深夜をまたぐ放送）"
        >
          {(p) => <Input {...p} type="time" defaultValue={v("endTime")} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-medium">視聴条件</legend>
        <Field name="cost" label="料金" required errors={e.cost}>
          {(p) => <SelectControl {...p} defaultValue={v("cost")} options={optionsFromLabels(COST_TYPES, COST_TYPE_LABELS)} />}
        </Field>
        <Field name="viewingType" label="視聴形態" required errors={e.viewingType}>
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("viewingType")}
              options={optionsFromLabels(VIEWING_TYPES, VIEWING_TYPE_LABELS)}
            />
          )}
        </Field>
        <Field name="region" label="視聴地域" required errors={e.region}>
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("region")}
              options={optionsFromLabels(REGION_AVAILABILITIES, REGION_AVAILABILITY_LABELS)}
            />
          )}
        </Field>
        <Field
          name="regionNote"
          label="視聴地域の補足"
          errors={e.regionNote}
          hint="地域限定の場合の放送エリアなど"
          className="md:col-span-3"
        >
          {(p) => <Input {...p} defaultValue={v("regionNote")} autoComplete="off" />}
        </Field>
        <Field name="note" label="補足説明（公開）" errors={e.note} className="md:col-span-3">
          {(p) => <Textarea {...p} defaultValue={v("note")} rows={2} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium">リンク</legend>
        <Field name="watchUrl" label="視聴 URL" errors={e.watchUrl} hint="実際に視聴するページ（http/https のみ）">
          {(p) => <Input {...p} defaultValue={v("watchUrl")} inputMode="url" autoComplete="off" spellCheck={false} />}
        </Field>
        <Field name="infoUrl" label="案内 URL" errors={e.infoUrl} hint="放送・配信の案内ページ（http/https のみ）">
          {(p) => <Input {...p} defaultValue={v("infoUrl")} inputMode="url" autoComplete="off" spellCheck={false} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-medium">確認・公開</legend>
        <Field
          name="verificationStatus"
          label="検証状態"
          required
          errors={e.verificationStatus}
          hint="公開状態とは別です。過去大会の情報は「過去大会の参考情報」にしてください"
        >
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("verificationStatus")}
              options={optionsFromLabels(SLOT_VERIFICATION_STATUSES, SLOT_VERIFICATION_STATUS_LABELS)}
            />
          )}
        </Field>
        <Field name="status" label="公開状態" required errors={e.status} hint="下書きの枠は公開ページに表示されません">
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("status")}
              options={optionsFromLabels(PUBLICATION_STATUSES, PUBLICATION_STATUS_LABELS)}
            />
          )}
        </Field>
        <Field
          name="sourceId"
          label="根拠の情報源"
          errors={e.sourceId}
          hint={sourceOptions.length === 0 ? "この大会には情報源が登録されていません" : "この大会に登録された情報源から選択"}
        >
          {(p) => (
            <SelectControl
              {...p}
              defaultValue={v("sourceId")}
              placeholder="（なし）"
              options={sourceOptions.map((s) => ({ value: s.id, label: s.label }))}
            />
          )}
        </Field>
        <div className="md:col-span-3">
          <CheckboxField
            name="markVerified"
            label="確認日時を今に更新（人がこの枠の内容を確認した）"
            hint={lastVerifiedLabel ? `前回の確認: ${lastVerifiedLabel}` : "まだ確認日時は記録されていません"}
            errors={e.markVerified}
            defaultChecked={v("markVerified") === "on"}
          />
        </div>
      </fieldset>
    </>
  );
}
