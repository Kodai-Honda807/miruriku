"use client";

/**
 * 絞り込みフォームの更新（router.replace）を 1 つの Transition で扱い、
 * フォーム側の「更新中」表示と、一覧側の aria-busy / 半透明表示で共有する。
 */
import { createContext, use, useTransition, type ReactNode, type TransitionStartFunction } from "react";

import { cn } from "@/lib/utils";

type FilterTransition = {
  isPending: boolean;
  startTransition: TransitionStartFunction;
};

const FilterTransitionContext = createContext<FilterTransition | null>(null);

export function FilterTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return <FilterTransitionContext value={{ isPending, startTransition }}>{children}</FilterTransitionContext>;
}

/** Provider の外（単体テストなど）では、その場の Transition を使う */
export function useFilterTransition(): FilterTransition {
  const shared = use(FilterTransitionContext);
  const [isPending, startTransition] = useTransition();
  return shared ?? { isPending, startTransition };
}

/** 更新中は一覧を aria-busy にし、控えめに薄く表示する */
export function FilterPendingRegion({ children, className }: { children: ReactNode; className?: string }) {
  const { isPending } = useFilterTransition();
  return (
    <div
      aria-busy={isPending || undefined}
      data-pending={isPending || undefined}
      className={cn("transition-opacity duration-150 data-pending:opacity-60 motion-reduce:transition-none", className)}
    >
      {children}
    </div>
  );
}
