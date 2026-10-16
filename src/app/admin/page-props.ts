/**
 * 管理画面のページの props の型。
 *
 * 管理画面は開発サーバー専用のため page.dynamic.tsx という名前にしている（next.config.ts）。
 * next typegen は page.tsx / page.ts という名前のファイルにしかルート型（PageProps<"/admin/...">）を作らないため、
 * 管理画面では同じ形の型をここで明示する。
 */
export type AdminSearchParams = Record<string, string | string[] | undefined>;

export type AdminPageProps<Params extends Record<string, string> = Record<string, never>> = {
  params: Promise<Params>;
  searchParams: Promise<AdminSearchParams>;
};
