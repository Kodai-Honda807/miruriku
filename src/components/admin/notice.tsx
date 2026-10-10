/**
 * 操作結果の通知。URL の ?notice= は決められたコードだけを受け付け、文言はここで決める
 * （クエリの文字列をそのまま画面に出さない）。
 */
const NOTICE_MESSAGES: Record<string, string> = {
  "event-created": "大会を作成しました（下書き）。公開するには「公開する」を押してください。",
  "event-saved": "大会情報を保存しました。",
  "event-published": "大会を公開しました。",
  "event-unpublished": "大会を下書きに戻しました。",
  "event-missing": "大会が見つかりませんでした（削除された可能性があります）。",
  "slot-created": "放送・配信枠を追加しました。",
  "slot-saved": "放送・配信枠を保存しました。",
  "slot-deleted": "放送・配信枠を削除しました。",
  "slot-published": "放送・配信枠を公開しました。",
  "slot-unpublished": "放送・配信枠を下書きに戻しました。",
  "source-created": "情報源を登録しました。",
  "source-saved": "情報源を保存しました。",
  "source-deleted": "情報源を削除しました。",
  "session-created": "セッションを追加しました。",
  "session-deleted": "セッションを削除しました。",
  rejected: "候補を却下しました。公開データは変更していません。",
  "already-reviewed": "この候補は既にレビューされていたため、操作は行いませんでした。現在の状態を表示しています。",
};

export function noticeMessage(code: string | string[] | undefined): string | null {
  const value = Array.isArray(code) ? code[0] : code;
  return value !== undefined && Object.hasOwn(NOTICE_MESSAGES, value) ? NOTICE_MESSAGES[value] : null;
}

export function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      {message}
    </p>
  );
}
