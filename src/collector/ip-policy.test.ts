import { describe, expect, it } from "vitest";

import { embeddedIPv4FromMapped, isBlockedAddress, parseIPv6Bytes } from "./ip-policy";

describe("isBlockedAddress: IPv4", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "127.255.0.1",
    "169.254.169.254", // クラウドのメタデータ
    "169.254.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.10",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.7",
    "203.0.113.5",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
  ])("%s は禁止", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.215.14", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "198.20.0.1", "192.169.0.1"])(
    "%s は許可",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe("isBlockedAddress: IPv6", () => {
  it.each([
    "::",
    "::1",
    "[::1]",
    "::7f00:1", // IPv4 互換（廃止）
    "64:ff9b::808:808", // NAT64
    "100::1",
    "2001:db8::1",
    "2002:c000:0204::1", // 6to4
    "fc00::1",
    "fd00:ec2::254", // AWS のメタデータ（IPv6）
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "fec0::1",
    "ff02::1",
  ])("%s は禁止", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "2400:cb00::1"])("%s は許可", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it("IPv4 射影アドレスは埋め込まれた IPv4 で判定する", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedAddress("::ffff:a9fe:a9fe")).toBe(true);
    expect(isBlockedAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedAddress("[::ffff:192.168.0.1]")).toBe(true);
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
    expect(embeddedIPv4FromMapped("::ffff:7f00:1")).toBe("127.0.0.1");
    expect(embeddedIPv4FromMapped("2001:4860::1")).toBeNull();
  });

  it("解釈できないアドレスは禁止扱い", () => {
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("localhost")).toBe(true);
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
    expect(isBlockedAddress("::gggg")).toBe(true);
  });

  it("IPv6 を 16 バイトに展開できる", () => {
    expect(Array.from(parseIPv6Bytes("::1")!)).toEqual([...Array(15).fill(0), 1]);
    expect(Array.from(parseIPv6Bytes("::ffff:1.2.3.4")!.slice(10))).toEqual([0xff, 0xff, 1, 2, 3, 4]);
    expect(parseIPv6Bytes("1.2.3.4")).toBeNull();
  });
});
