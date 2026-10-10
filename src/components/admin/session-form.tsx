"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState, type FormState } from "@/server/admin/form-state";

import { Field, FormMessage, formValues } from "./form-controls";

type SessionFormProps = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** 新規入力時の日付の初期値（大会の開始日） */
  defaultDate: string;
  timezone: string;
};

const ID_PREFIX = "session";

export function SessionForm({ action, defaultDate, timezone }: SessionFormProps) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const defaults = { date: defaultDate };
  return (
    <form action={formAction} noValidate className="grid gap-4" aria-label="セッションの追加">
      <FormMessage state={state} />
      <SessionFields key={state.attempt} state={state} defaults={defaults} timezone={timezone} />
      <div>
        <Button type="submit" variant="outline" disabled={pending} aria-busy={pending || undefined}>
          セッションを追加
        </Button>
      </div>
    </form>
  );
}

function SessionFields({
  state,
  defaults,
  timezone,
}: {
  state: FormState;
  defaults: Record<string, string>;
  timezone: string;
}) {
  const v = formValues(state, defaults);
  const e = state.fieldErrors;
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Field idPrefix={ID_PREFIX} name="name" label="セッション名" required errors={e.name} className="md:col-span-2">
        {(p) => <Input {...p} defaultValue={v("name")} autoComplete="off" placeholder="例: 1日目（予選）" />}
      </Field>
      <Field idPrefix={ID_PREFIX} name="date" label="日付（現地）" required errors={e.date}>
        {(p) => <Input {...p} type="date" defaultValue={v("date")} />}
      </Field>
      <Field
        idPrefix={ID_PREFIX}
        name="startTime"
        label="開始時刻（現地・任意）"
        errors={e.startTime}
        hint={`${timezone} の時刻。空欄は不明`}
      >
        {(p) => <Input {...p} type="time" defaultValue={v("startTime")} />}
      </Field>
      <Field idPrefix={ID_PREFIX} name="note" label="補足" errors={e.note} className="md:col-span-4">
        {(p) => <Input {...p} defaultValue={v("note")} autoComplete="off" />}
      </Field>
    </div>
  );
}
