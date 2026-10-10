/**
 * ローカル管理機能の有効判定。
 *
 * 管理画面・Server Actions・Route Handlers のすべての管理用経路で必ず呼び出すこと。
 * 画面を隠すだけでは不十分（Server Action はどのページからでも POST できる）。
 *
 * 有効になる条件（両方を満たす場合のみ）:
 *   1. NODE_ENV が "production" ではない（next build / next start / 本番コンテナでは常に無効）
 *   2. MIRURIKU_ADMIN_ENABLED が文字列 "true" と明示されている
 *
 * 本番公開前には、これとは別に管理者認証・認可を実装する必要がある（README 参照）。
 */
export type AdminGuardEnv = {
  NODE_ENV?: string;
  MIRURIKU_ADMIN_ENABLED?: string;
};

export function isAdminEnabled(env: AdminGuardEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.MIRURIKU_ADMIN_ENABLED === "true";
}

export class AdminDisabledError extends Error {
  constructor() {
    super("管理機能はこの環境では無効です");
    this.name = "AdminDisabledError";
  }
}

/** 管理機能が無効なら AdminDisabledError を投げる。書き込み処理の先頭で呼ぶ。 */
export function assertAdminEnabled(env: AdminGuardEnv = process.env): void {
  if (!isAdminEnabled(env)) {
    throw new AdminDisabledError();
  }
}
