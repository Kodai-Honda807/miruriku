"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_KINDS } from "@/domain/enums";
import { SOURCE_KIND_LABELS } from "@/domain/labels";
import { initialFormState, type FormState } from "@/server/admin/form-state";

import { CheckboxField, Field, FormMessage, SelectControl, formValues, optionsFromLabels } from "./form-controls";

type SourceFormProps = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: Record<string, string>;
  submitLabel: string;
};

export function SourceForm({ action, defaults, submitLabel }: SourceFormProps) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} noValidate className="grid gap-6" aria-label="出典・情報源">
      <FormMessage state={state} />
      <SourceFormFields key={state.attempt} state={state} defaults={defaults} />
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

function SourceFormFields({ state, defaults }: { state: FormState; defaults: Record<string, string> }) {
  const v = formValues(state, defaults);
  const e = state.fieldErrors;
  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
      <Field name="kind" label="種類" required errors={e.kind}>
        {(p) => (
          <SelectControl {...p} defaultValue={v("kind")} options={optionsFromLabels(SOURCE_KINDS, SOURCE_KIND_LABELS)} />
        )}
      </Field>
      <Field name="title" label="タイトル" errors={e.title} hint="ページの見出しなど（任意）">
        {(p) => <Input {...p} defaultValue={v("title")} autoComplete="off" />}
      </Field>
      <Field
        name="url"
        label="URL"
        required
        errors={e.url}
        hint="http:// または https:// の URL。同じ大会に同じ URL は登録できません"
        className="md:col-span-2"
      >
        {(p) => <Input {...p} defaultValue={v("url")} inputMode="url" autoComplete="off" spellCheck={false} />}
      </Field>
      <Field name="note" label="メモ（管理用）" errors={e.note} className="md:col-span-2">
        {(p) => <Textarea {...p} defaultValue={v("note")} rows={2} />}
      </Field>
      <div className="md:col-span-2">
        <CheckboxField
          name="collectEnabled"
          label="収集 CLI の取得を許可する"
          hint="チェックした情報源だけが収集 CLI の取得対象になります。robots.txt や利用規約で自動取得が認められているか確認してください。"
          errors={e.collectEnabled}
          defaultChecked={v("collectEnabled") === "on"}
        />
      </div>
    </div>
  );
}
