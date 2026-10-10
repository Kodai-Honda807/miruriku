import Link from "next/link";

/** 管理画面内で対象のデータが見つからない場合（管理機能が無効な場合はこの画面ではなく通常の 404） */
export default function AdminNotFound() {
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">見つかりません</h1>
      <p className="text-sm">指定されたデータは存在しないか、削除されています。</p>
      <p className="text-sm">
        <Link href="/admin" className="underline underline-offset-4">
          管理画面のトップへ戻る
        </Link>
      </p>
    </div>
  );
}
