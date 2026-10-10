"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState, type FormState } from "@/server/admin/form-state";

import { FormMessage } from "./form-controls";

type ReviewAction = (prev: FormState, formData: FormData) => Promise<FormState>;

type ReviewActionsProps = {
  approveAction: ReviewAction;
  rejectAction: ReviewAction;
  /** 保存された候補データが読めない場合など、承認できないときは false */
  canApprove: boolean;
};

/** 未レビューの候補の「承認して公開データに反映」「却下する」ボタン */
export function ReviewActions({ approveAction, rejectAction, canApprove }: ReviewActionsProps) {
  const [approveState, approveFormAction, approvePending] = useActionState(approveAction, initialFormState);
  const [rejectState, rejectFormAction, rejectPending] = useActionState(rejectAction, initialFormState);
  const busy = approvePending || rejectPending;
  const rejectNoteError = rejectState.fieldErrors.note;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form action={approveFormAction} className="grid content-start gap-3 rounded-lg border p-4" aria-label="承認">
        <p className="text-sm text-muted-foreground">
          承認すると、上の差分（現在のデータに対して承認時にもう一度計算します）が公開データに反映されます。
          追加・更新する放送枠は「公開」「確認済み」になり、確認日時が現在時刻になります。
          大会の公開状態（下書き／公開）は変わりません。
        </p>
        <FormMessage state={approveState} />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !canApprove} aria-busy={approvePending || undefined}>
            承認して公開データに反映
          </Button>
          {approvePending ? (
            <span role="status" className="text-sm text-muted-foreground">
              反映しています…
            </span>
          ) : null}
        </div>
        {!canApprove ? (
          <p className="text-sm text-destructive">この候補は承認できません（上の注意を参照してください）。</p>
        ) : null}
      </form>

      <form action={rejectFormAction} className="grid content-start gap-3 rounded-lg border p-4" aria-label="却下">
        <FormMessage state={rejectState} />
        <div className="grid gap-1.5">
          <Label htmlFor="review-reject-note">却下理由メモ（任意）</Label>
          <Textarea
            key={rejectState.attempt}
            id="review-reject-note"
            name="note"
            rows={3}
            defaultValue={rejectState.status === "error" ? (rejectState.values.note ?? "") : ""}
            aria-invalid={rejectNoteError ? true : undefined}
            aria-describedby={rejectNoteError ? "review-reject-note-error review-reject-note-hint" : "review-reject-note-hint"}
          />
          {rejectNoteError ? (
            <p id="review-reject-note-error" className="text-xs font-medium text-destructive">
              {rejectNoteError.join(" ")}
            </p>
          ) : null}
          <p id="review-reject-note-hint" className="text-xs text-muted-foreground">
            却下しても公開データは変更されません。メモは管理画面にだけ表示されます。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="destructive" disabled={busy} aria-busy={rejectPending || undefined}>
            却下する
          </Button>
          {rejectPending ? (
            <span role="status" className="text-sm text-muted-foreground">
              処理しています…
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
