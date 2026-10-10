/**
 * 管理画面フォームの部品。ラベル・補足・エラーを入力欄と関連づける（aria-invalid / aria-describedby）。
 * ブラウザの required 属性による検証は使わず（サーバー側の検証結果を常に同じ形で表示するため）、
 * 必須項目は aria-required と「必須」の表示で示す。
 */
import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { FormState } from "@/server/admin/form-state";

export type FieldControlProps = {
  id: string;
  name: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
};

type FieldProps = {
  name: string;
  label: string;
  /** 同じ画面に複数のフォームがある場合の id の接頭辞 */
  idPrefix?: string;
  hint?: ReactNode;
  errors?: string[];
  required?: boolean;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
};

export function fieldId(idPrefix: string | undefined, name: string): string {
  return `${idPrefix ?? "field"}-${name}`;
}

function RequiredMark() {
  return (
    <span className="text-xs font-normal text-destructive">
      <span aria-hidden="true">*</span>
      <span className="sr-only">（必須）</span>
    </span>
  );
}

export function Field({ name, label, idPrefix, hint, errors, required, className, children }: FieldProps) {
  const id = fieldId(idPrefix, name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors && errors.length > 0 ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {children({
        id,
        name,
        "aria-invalid": errorId ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required ? true : undefined,
      })}
      {errorId ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {errors!.join(" ")}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type CheckboxFieldProps = {
  name: string;
  label: ReactNode;
  idPrefix?: string;
  hint?: ReactNode;
  errors?: string[];
  defaultChecked?: boolean;
};

/** ネイティブのチェックボックス（FormData にそのまま載り、キーボードで操作できる） */
export function CheckboxField({ name, label, idPrefix, hint, errors, defaultChecked }: CheckboxFieldProps) {
  const id = fieldId(idPrefix, name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors && errors.length > 0 ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id={id}
          name={name}
          value="on"
          defaultChecked={defaultChecked}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={describedBy}
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
        <label htmlFor={id} className="text-sm leading-snug">
          {label}
        </label>
      </div>
      {errorId ? (
        <p id={errorId} className="pl-6 text-xs font-medium text-destructive">
          {errors!.join(" ")}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="pl-6 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type SelectOption = { value: string; label: string };

export function SelectControl({
  options,
  defaultValue,
  placeholder,
  ...props
}: FieldControlProps & { options: readonly SelectOption[]; defaultValue: string; placeholder?: string }) {
  return (
    <NativeSelect {...props} defaultValue={defaultValue} className="w-full">
      {placeholder !== undefined ? <NativeSelectOption value="">{placeholder}</NativeSelectOption> : null}
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export function optionsFromLabels<T extends string>(values: readonly T[], labels: Record<T, string>): SelectOption[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

/** フォーム上部のメッセージ。エラーは role="alert"、成功は role="status" で読み上げる */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {state.message}
      </div>
    );
  }
  return (
    <div role="status" className="rounded-lg border px-3 py-2 text-sm">
      {state.message}
    </div>
  );
}

/** エラー時は送信した値、それ以外は初期値を返す */
export function formValues(state: FormState, defaults: Record<string, string>): (name: string) => string {
  if (state.status === "error") return (name) => state.values[name] ?? "";
  return (name) => defaults[name] ?? "";
}
