import { describe, expect, it } from "vitest";

import { buildEventDescription, buildEventJsonLd, eventPath, serializeJsonLd } from "./event-seo";
import { makeBroadcast, makeEventDetail } from "./test-fixtures";

describe("buildEventDescription", () => {
  it("年付きの開催日・大会名・開催地と、今年の放送・配信先を入れる", () => {
    const event = makeEventDetail({
      venueRegion: "東京都立川市",
      broadcasts: [
        makeBroadcast({ id: "a", providerName: "日本テレビ" }),
        makeBroadcast({ id: "b", providerName: "TVer" }),
        makeBroadcast({ id: "c", providerName: "日本テレビ" }),
      ],
    });
    const d = buildEventDescription(event);
    expect(d).toMatch(/^2026年10月12日（月）開催のテストマラソン（東京都立川市）。/);
    expect(d).toContain("日本テレビ・TVerのテレビ放送・ネット配信の予定");
  });

  it("放送・配信先が 4 件以上なら 3 件と「ほか」", () => {
    const event = makeEventDetail({
      broadcasts: ["A", "B", "C", "D"].map((name, i) => makeBroadcast({ id: `s${i}`, providerName: name })),
    });
    expect(buildEventDescription(event)).toContain("A・B・Cほかの");
  });

  it("過去大会の参考情報の枠は今年の放送先として書かない", () => {
    const event = makeEventDetail({
      broadcastInfoStatus: "PAST_REFERENCE",
      broadcasts: [makeBroadcast({ providerName: "昨年の局", verificationStatus: "PAST_REFERENCE" })],
    });
    const d = buildEventDescription(event);
    expect(d).not.toContain("昨年の局");
    expect(d).toContain("過去大会の参考情報のみ");
  });

  it("放送枠がなければ確認状況を書く（未確認を「なし」と書かない）", () => {
    const d = buildEventDescription(makeEventDetail({ broadcastInfoStatus: "UNVERIFIED", broadcasts: [] }));
    expect(d).toContain("放送・配信情報は未確認");
    expect(d).not.toContain("放送・配信なし");
  });

  it("海外大会は現地日付であることを書く", () => {
    const d = buildEventDescription(
      makeEventDetail({ countryCode: "US", timezone: "America/New_York", venueRegion: null }),
    );
    expect(d).toContain("（現地日付）開催の");
    expect(d).toContain("（アメリカ合衆国）");
  });
});

describe("buildEventJsonLd", () => {
  it("SportsEvent として名前・開始・終了・場所・URL・公式サイトを出す", () => {
    const event = makeEventDetail({
      venueName: "テスト競技場",
      venueRegion: "東京都",
      officialUrl: "https://example.org/official",
    });
    const ld = buildEventJsonLd(event, "https://miruriku.example/events/test");
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: "テストマラソン",
      sport: "マラソン",
      endDate: "2026-10-12",
      url: "https://miruriku.example/events/test",
      sameAs: "https://example.org/official",
      location: {
        "@type": "Place",
        name: "テスト競技場",
        address: { "@type": "PostalAddress", addressLocality: "東京都", addressCountry: "JP" },
      },
    });
    expect(ld.startDate).toBe(event.startAt!.toISOString());
  });

  it("開始時刻が不明なら日付だけ。場所・URL・安全でない公式 URL は推測で補わない", () => {
    const ld = buildEventJsonLd(
      makeEventDetail({ startAt: null, venueName: null, venueRegion: null, officialUrl: "javascript:alert(1)" }),
      null,
    );
    expect(ld.startDate).toBe("2026-10-12");
    expect(ld).not.toHaveProperty("location");
    expect(ld).not.toHaveProperty("url");
    expect(ld).not.toHaveProperty("sameAs");
  });

  it("トラックは「陸上競技」", () => {
    expect(buildEventJsonLd(makeEventDetail({ category: "TRACK" }), null).sport).toBe("陸上競技");
  });
});

describe("serializeJsonLd / eventPath", () => {
  it("</script> で HTML を壊せないよう「<」をエスケープする", () => {
    const s = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>");
  });

  it("詳細ページのパス", () => {
    expect(eventPath("hakone-qualifier-2026")).toBe("/events/hakone-qualifier-2026");
  });
});
