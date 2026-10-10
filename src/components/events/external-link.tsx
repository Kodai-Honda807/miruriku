import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";

import { safeExternalHref } from "@/domain/url";
import { cn } from "@/lib/utils";

import { EXTERNAL_LINK_SUFFIX } from "./event-format";

type ExternalLinkProps = {
  href: string | null | undefined;
  /** 表示テキスト */
  children: ReactNode;
  /**
   * スクリーンリーダー向けの名前（表示テキストを含めること）。
   * 末尾に「外部サイト・新しいタブで開きます」を自動で付ける。
   */
  accessibleName: string;
  className?: string;
};

/**
 * 外部サイトへのリンク。http(s) 以外・認証情報付きの URL はリンクにしない（null を返す）。
 * 新しいタブで開き、opener と referrer を渡さない。
 */
export function ExternalLink({ href, children, accessibleName, className }: ExternalLinkProps) {
  const safeHref = safeExternalHref(href);
  if (!safeHref) return null;
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${accessibleName}${EXTERNAL_LINK_SUFFIX}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-medium text-primary underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
      <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
    </a>
  );
}
