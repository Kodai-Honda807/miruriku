/**
 * 接続を禁止する IP アドレス範囲（SSRF 対策）。
 *
 * ループバック・プライベート・リンクローカル（クラウドのメタデータ 169.254.169.254 / fd00:ec2::254 を含む）・
 * CGNAT・ドキュメント用・マルチキャスト・予約済みなど、公開 Web サーバーではありえない範囲をすべて拒否する。
 * IPv4 射影 IPv6（::ffff:a.b.c.d）は埋め込まれた IPv4 で判定する。
 * 解釈できないアドレスは安全側に倒して禁止扱いにする。
 */
import { BlockList, isIP } from "node:net";

const BLOCKED_IPV4_SUBNETS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // 「このネットワーク」
  ["10.0.0.0", 8], // プライベート
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // ループバック
  ["169.254.0.0", 16], // リンクローカル（169.254.169.254 等のメタデータを含む）
  ["172.16.0.0", 12], // プライベート
  ["192.0.0.0", 24], // IETF プロトコル割り当て
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 リレー（廃止）
  ["192.168.0.0", 16], // プライベート
  ["198.18.0.0", 15], // ベンチマーク
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // マルチキャスト
  ["240.0.0.0", 4], // 予約（255.255.255.255 を含む）
  ["255.255.255.255", 32], // ブロードキャスト（明示）
];

const BLOCKED_IPV6_SUBNETS: ReadonlyArray<readonly [string, number]> = [
  ["::", 128], // 未指定
  ["::1", 128], // ループバック
  ["::", 96], // IPv4 互換アドレス（廃止。::a.b.c.d）
  ["64:ff9b::", 96], // NAT64
  ["100::", 64], // 破棄専用
  ["2001:db8::", 32], // ドキュメント用
  ["2002::", 16], // 6to4
  ["fc00::", 7], // ユニークローカル（fd00:ec2::254 等を含む）
  ["fe80::", 10], // リンクローカル
  ["fec0::", 10], // サイトローカル（廃止）
  ["ff00::", 8], // マルチキャスト
];

const ipv4BlockList = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) ipv4BlockList.addSubnet(network, prefix, "ipv4");

const ipv6BlockList = new BlockList();
for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) ipv6BlockList.addSubnet(network, prefix, "ipv6");

/** "[::1]" の角括弧と "%eth0" のようなゾーン ID を取り除く */
export function stripAddressDecorations(address: string): string {
  let s = address.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  return s;
}

function parseIPv4Bytes(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255) ? bytes : null;
}

/** IPv6 アドレスを 16 バイトに展開する。解釈できなければ null */
export function parseIPv6Bytes(input: string): Uint8Array | null {
  let s = stripAddressDecorations(input);
  if (isIP(s) !== 6) return null;

  // 末尾の埋め込み IPv4（::ffff:1.2.3.4）を 16 進 2 グループに置き換える
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4Bytes(tail);
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  let groups: string[];
  const doubleColon = s.indexOf("::");
  if (doubleColon >= 0) {
    const head = s.slice(0, doubleColon);
    const rest = s.slice(doubleColon + 2);
    const headGroups = head ? head.split(":") : [];
    const restGroups = rest ? rest.split(":") : [];
    const missing = 8 - headGroups.length - restGroups.length;
    if (missing < 0) return null;
    groups = [...headGroups, ...Array<string>(missing).fill("0"), ...restGroups];
  } else {
    groups = s.split(":");
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) return null;
    const value = parseInt(groups[i], 16);
    bytes[i * 2] = value >> 8;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

/** IPv4 射影 IPv6（::ffff:0:0/96）なら埋め込まれた IPv4 を返す */
export function embeddedIPv4FromMapped(address: string): string | null {
  const bytes = parseIPv6Bytes(address);
  if (!bytes) return null;
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return null;
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null;
  return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
}

/** 接続してはいけないアドレスか（解釈できないものも true） */
export function isBlockedAddress(address: string): boolean {
  const s = stripAddressDecorations(address);
  const family = isIP(s);
  if (family === 4) return ipv4BlockList.check(s, "ipv4");
  if (family === 6) {
    const mapped = embeddedIPv4FromMapped(s);
    if (mapped !== null) return ipv4BlockList.check(mapped, "ipv4");
    if (!parseIPv6Bytes(s)) return true;
    return ipv6BlockList.check(s, "ipv6");
  }
  return true;
}
