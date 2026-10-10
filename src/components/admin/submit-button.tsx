"use client";

import type { ComponentProps, MouseEvent } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, "type"> & {
  /** 送信前に確認ダイアログを出す（削除など取り消せない操作） */
  confirmMessage?: string;
  /** 送信中に読み上げ・表示する補足 */
  pendingLabel?: string;
};

/**
 * フォームの送信ボタン。送信中は二重送信を防ぐため無効にする（ボタンの名前は変えない）。
 * Server Component のフォームからも使える。
 */
export function SubmitButton({ confirmMessage, pendingLabel, children, disabled, onClick, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <>
      <Button type="submit" disabled={disabled || pending} aria-busy={pending || undefined} onClick={handleClick} {...props}>
        {children}
      </Button>
      {pending && pendingLabel ? (
        <span role="status" className="text-xs text-muted-foreground">
          {pendingLabel}
        </span>
      ) : null}
    </>
  );
}
