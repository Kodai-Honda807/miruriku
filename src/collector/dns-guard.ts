/**
 * 名前解決結果の検査（SSRF・DNS リバインディング対策）。
 *
 * - resolveAndAssertHost: 取得前に名前解決し、得られたすべてのアドレスを検査する
 * - createGuardedLookup: 実際の接続時（net.connect / tls.connect の lookup）にも同じ検査を行う。
 *   取得前の検査と接続時の名前解決の結果が変わっても（DNS リバインディング）、禁止範囲には接続しない。
 */
import dns from "node:dns";
import { isIP, type LookupFunction } from "node:net";

import { CollectorError } from "./errors";
import { isBlockedAddress, stripAddressDecorations } from "./ip-policy";

export type ResolvedAddress = { address: string; family: number };

/** ホスト名 → すべてのアドレス（テストでは差し替える） */
export type ResolveAll = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolveAll: ResolveAll = async (hostname) => {
  const result = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return result.map((r) => ({ address: r.address, family: r.family }));
};

/** 名前解決し、1 つでも禁止範囲のアドレスがあれば拒否する */
export async function resolveAndAssertHost(hostname: string, resolveAll: ResolveAll): Promise<ResolvedAddress[]> {
  const host = stripAddressDecorations(hostname);
  const literalFamily = isIP(host);
  if (literalFamily !== 0) {
    if (isBlockedAddress(host)) {
      throw new CollectorError("BLOCKED_ADDRESS", `禁止範囲の IP アドレスです: ${host}`);
    }
    return [{ address: host, family: literalFamily }];
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolveAll(host);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? "unknown";
    throw new CollectorError("DNS_FAILED", `名前解決に失敗しました: ${host}（${code}）`, {}, { cause: error });
  }
  if (addresses.length === 0) {
    throw new CollectorError("DNS_FAILED", `名前解決の結果が空です: ${host}`);
  }
  const blocked = addresses.filter((a) => isBlockedAddress(a.address));
  if (blocked.length > 0) {
    throw new CollectorError(
      "BLOCKED_ADDRESS",
      `禁止範囲の IP アドレスに解決されました: ${host} → ${blocked.map((a) => a.address).join(", ")}`,
    );
  }
  return addresses;
}

function requestedFamily(options: unknown): 0 | 4 | 6 {
  const family = typeof options === "number" ? options : (options as { family?: unknown } | undefined)?.family;
  if (family === 4 || family === "IPv4") return 4;
  if (family === 6 || family === "IPv6") return 6;
  return 0;
}

/**
 * net.connect / tls.connect の `lookup` オプションに渡す、検査付きの名前解決。
 * undici の Agent では `connect: { lookup }` として渡す。
 */
export function createGuardedLookup(resolveAll: ResolveAll = systemResolveAll): LookupFunction {
  return (hostname, options, callback) => {
    resolveAndAssertHost(hostname, resolveAll).then(
      (addresses) => {
        const family = requestedFamily(options);
        const usable = family === 0 ? addresses : addresses.filter((a) => a.family === family);
        if (usable.length === 0) {
          callback(new CollectorError("DNS_FAILED", `要求されたアドレスファミリーの結果がありません: ${hostname}`), "");
          return;
        }
        if ((options as { all?: boolean } | undefined)?.all) {
          callback(null, usable);
        } else {
          callback(null, usable[0].address, usable[0].family);
        }
      },
      (error: unknown) => callback(error as NodeJS.ErrnoException, ""),
    );
  };
}
