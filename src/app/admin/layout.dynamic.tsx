import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminHeader } from "@/components/admin/admin-header";
import { isAdminEnabled } from "@/server/admin-guard";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "管理画面", template: "%s | 管理画面 | みる陸" },
  robots: { index: false, follow: false },
};

/**
 * 管理画面のレイアウト。
 * 管理機能が無効（本番モード、または MIRURIKU_ADMIN_ENABLED が "true" でない）なら 404。
 * src/proxy.ts・各ページ・各 Server Action でも同じ判定を行う（多層防御）。
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  if (!isAdminEnabled()) notFound();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AdminHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
