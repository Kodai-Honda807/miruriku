/**
 * 同一ホストへのリクエスト間隔の調整（逐次処理を前提とする）。
 * 前回のリクエストの完了（または開始）から intervalMs 経つまで待つ。
 * "www." の有無は同じホストとして扱う。
 */
import { normalizeHostname } from "./url-policy";

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HostRateLimiter {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly nowMs: () => number = () => Date.now(),
    private readonly sleep: Sleep = realSleep,
  ) {}

  private key(host: string): string {
    return normalizeHostname(host).replace(/^www\./, "");
  }

  /** 前回から intervalMs 経つまで待ち、今回の開始時刻を記録する */
  async wait(host: string, intervalMs: number): Promise<void> {
    const key = this.key(host);
    const last = this.last.get(key);
    if (last !== undefined) {
      const waitMs = last + intervalMs - this.nowMs();
      if (waitMs > 0) await this.sleep(waitMs);
    }
    this.last.set(key, this.nowMs());
  }

  /** リクエストの完了時刻を記録する（次の間隔は完了時刻から数える） */
  markDone(host: string): void {
    this.last.set(this.key(host), this.nowMs());
  }
}
