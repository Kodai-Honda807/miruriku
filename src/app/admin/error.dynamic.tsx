"use client";

/** 管理画面の想定外のエラー。内部エラーの詳細は表示しない（サーバーのログを参照） */
export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="grid gap-4">
      <h1 className="text-xl font-semibold">処理に失敗しました</h1>
      <p className="text-sm">時間をおいて再度お試しください。詳細はサーバーのログを確認してください。</p>
      <div>
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          もう一度読み込む
        </button>
      </div>
    </div>
  );
}
