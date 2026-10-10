/**
 * 管理画面フォームの状態（useActionState の state）と FormData の読み取り。
 *
 * "use server" ファイルからは async 関数以外を export できないため、型と補助関数はここに置く。
 * Client Component からも読み込むので、サーバー専用のモジュールを import しないこと。
 */
import { z } from "zod";

export type FieldErrors = Partial<Record<string, string[]>>;

export type FormState = {
  status: "idle" | "error" | "success";
  /** フォーム全体へのメッセージ（エラーの概要・成功通知） */
  message: string | null;
  /** 項目ごとのエラー（キーはフォームの name） */
  fieldErrors: FieldErrors;
  /** エラー時に入力内容を復元するための送信値 */
  values: Record<string, string>;
  /** 送信ごとに増える番号。フォームの key にして入力値の復元・リセットに使う */
  attempt: number;
};

export const initialFormState: FormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: {},
  attempt: 0,
};

/** 1 項目あたりの最大文字数（異常に大きな入力をエラー時にそのまま返さないため） */
const MAX_ECHO_LENGTH = 5000;

/**
 * FormData を「name → 文字列」に変換する。
 * ファイルと React が付与する内部用のキー（$ACTION_...）は無視し、同名の項目は最初の値を使う。
 */
export function formDataToRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string") continue;
    if (key in out) continue;
    out[key] = value;
  }
  return out;
}

function echoValues(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = value.length > MAX_ECHO_LENGTH ? value.slice(0, MAX_ECHO_LENGTH) : value;
  }
  return out;
}

export function validationErrorState(
  error: z.ZodError,
  raw: Record<string, string>,
  prev: FormState,
): FormState {
  const flattened = z.flattenError(error);
  const fieldErrors: FieldErrors = { ...flattened.fieldErrors };
  const count = Object.keys(fieldErrors).length + flattened.formErrors.length;
  return {
    status: "error",
    message:
      flattened.formErrors.length > 0
        ? flattened.formErrors.join(" ")
        : `入力内容を確認してください（${count} 件のエラー）`,
    fieldErrors,
    values: echoValues(raw),
    attempt: prev.attempt + 1,
  };
}

export function errorState(
  raw: Record<string, string>,
  prev: FormState,
  message: string,
  fieldErrors: FieldErrors = {},
): FormState {
  return { status: "error", message, fieldErrors, values: echoValues(raw), attempt: prev.attempt + 1 };
}

export function successState(prev: FormState, message: string): FormState {
  return { status: "success", message, fieldErrors: {}, values: {}, attempt: prev.attempt + 1 };
}
