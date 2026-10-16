import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JST, zonedToUtc } from "@/domain/datetime";
import { describeEventTiming } from "@/domain/event-timing";

import { EventDetail, buildEventNotes } from "./event-detail";
import { FIXED_NOW, makeBroadcast, makeEventDetail } from "./test-fixtures";

function renderDetail(...args: Parameters<typeof makeEventDetail>) {
  const event = makeEventDetail(...args);
  render(<EventDetail event={event} now={FIXED_NOW} />);
  return event;
}

function section(name: string) {
  return screen.getByRole("heading", { level: 2, name }).closest("section")!;
}

describe("EventDetail", () => {
  it("大会名を h1 にし、年付きの開催日と一覧へ戻るリンクを表示する", () => {
    renderDetail();
    expect(screen.getByRole("heading", { level: 1, name: "テストマラソン" })).toBeInTheDocument();
    expect(section("開催日時")).toHaveTextContent("2026年10月12日（月）");
    expect(section("開催日時")).toHaveTextContent("9:10（日本時間）");
    expect(screen.getAllByRole("link", { name: "大会一覧へ戻る" })[0]).toHaveAttribute("href", "/");
  });

  it("視聴ページの URL がない枠は「未登録」と表示し、大会公式サイトを視聴リンクにしない", () => {
    renderDetail({
      officialUrl: "https://example.org/official",
      broadcasts: [makeBroadcast({ watchUrl: null, infoUrl: "https://example.com/info" })],
    });
    const broadcast = section("放送・配信");
    expect(broadcast).toHaveTextContent("視聴ページのリンクは未登録です");
    expect(within(broadcast).queryByRole("link", { name: /視聴/ })).not.toBeInTheDocument();
    expect(within(broadcast).queryByRole("link", { name: /大会公式/ })).not.toBeInTheDocument();
    expect(within(broadcast).getByRole("link", { name: /放送案内/ })).toHaveAttribute("href", "https://example.com/info");

    const official = screen.getByRole("link", { name: /大会公式サイト/ });
    expect(official.closest("section")).toBe(section("大会情報"));
    expect(official.textContent).not.toMatch(/視聴|見る/);
  });

  it("各枠の検証状態と確認日時を表示する", () => {
    renderDetail({
      broadcasts: [
        makeBroadcast({ id: "a" }),
        makeBroadcast({ id: "b", verificationStatus: "UNVERIFIED", verifiedAt: null }),
      ],
    });
    const [confirmed, unverified] = screen.getAllByTestId("broadcast-slot");
    expect(confirmed).toHaveTextContent("確認済み");
    expect(confirmed).toHaveTextContent("確認日時: 2026年10月8日（木）11:30");
    expect(unverified).toHaveTextContent("未確認");
    expect(unverified).toHaveTextContent("確認日時: 記録なし");
  });

  it("一覧で省いた補足・出典・確認日時・大会全体の注記は、詳細ページで表示する", () => {
    renderDetail({
      broadcastNote: "スタートは大会要項で「8時30分スタート（予定）」。",
      broadcasts: [
        makeBroadcast({
          note: "関東以外の放送局・放送地域は、お住まいの地域の番組表で確認してください。",
          source: { url: "https://example.com/program", title: "番組公式ページ（テスト）" },
          infoUrl: "https://example.com/info",
        }),
      ],
    });
    const broadcast = section("放送・配信");
    expect(broadcast).toHaveTextContent("スタートは大会要項で「8時30分スタート（予定）」。");
    expect(broadcast).toHaveTextContent("情報確認: 2026年10月8日（木）11:30");
    const slot = within(broadcast).getByTestId("broadcast-slot");
    expect(slot).toHaveTextContent("関東以外の放送局・放送地域は");
    expect(within(slot).getByRole("link", { name: /^出典: 番組公式ページ（テスト）/ })).toHaveAttribute(
      "href",
      "https://example.com/program",
    );
    expect(within(slot).getByRole("link", { name: /放送案内/ })).toHaveAttribute("href", "https://example.com/info");
    // 詳細では個別のリンクを出すので、枠全体を 1 つのリンクにはしない
    expect(within(slot).queryByTestId("broadcast-slot-link")).not.toBeInTheDocument();
  });

  it("海外の複数日開催は、日程別に日本時間と現地時刻を表示し、開始時刻不明は「未確認」", () => {
    renderDetail({
      timezone: "Europe/Zurich",
      countryCode: "CH",
      startDate: "2026-10-17",
      endDate: "2026-10-18",
      startAt: zonedToUtc("2026-10-17", "20:00", "Europe/Zurich"),
      sessions: [
        {
          id: "s1",
          name: "1日目",
          date: "2026-10-17",
          startAt: zonedToUtc("2026-10-17", "20:00", "Europe/Zurich"),
          note: null,
        },
        { id: "s2", name: "2日目", date: "2026-10-18", startAt: null, note: "時刻未発表" },
      ],
    });
    const table = screen.getByRole("table");
    const [day1, day2] = within(table).getAllByRole("row").slice(1);
    expect(day1).toHaveTextContent("10月17日（土）");
    expect(day1).toHaveTextContent("10月18日（日）3:00");
    expect(day1).toHaveTextContent("10月17日（土）20:00");
    expect(day2).toHaveTextContent("未確認");
    expect(day2.textContent).not.toMatch(/(^|[^0-9])0?0:00/);
    expect(section("開催場所")).toHaveTextContent("Europe/Zurich");
    expect(section("開催場所")).toHaveTextContent("スイス");
  });

  it("情報源を種類（大会公式・放送・配信案内）付きで一覧表示する", () => {
    renderDetail({
      sources: [
        { id: "1", kind: "OFFICIAL_SITE", url: "https://example.org/official", title: "大会公式（テスト）" },
        { id: "2", kind: "BROADCAST_INFO", url: "https://example.com/info", title: null },
      ],
    });
    const sources = section("情報源・根拠");
    const items = within(sources).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("大会公式");
    expect(items[0]).toHaveTextContent("大会公式（テスト）");
    expect(items[1]).toHaveTextContent("放送・配信案内");
    expect(within(items[1]!).getByRole("link")).toHaveAttribute("href", "https://example.com/info");
  });
});

describe("buildEventNotes", () => {
  it("状況に応じた注意書きを作る", () => {
    const event = makeEventDetail({
      broadcastInfoStatus: "UNVERIFIED",
      startAt: null,
      broadcasts: [makeBroadcast({ region: "REGIONAL", verificationStatus: "PAST_REFERENCE" })],
    });
    const notes = buildEventNotes(event, describeEventTiming(event)).join("\n");
    expect(notes).toContain("放送・配信がないという意味ではありません");
    expect(notes).toContain("今年の予定ではありません");
    expect(notes).toContain("開始時刻は確認できていません");
    expect(notes).toContain("地域限定の放送があります");
    expect(notes).toContain("視聴前に必ず公式情報をご確認ください");
  });

  it("未発表・配信なし・過去大会の参考情報で異なる注意書きにする", () => {
    const texts = (["NOT_ANNOUNCED", "NO_BROADCAST", "PAST_REFERENCE"] as const).map((status) => {
      const event = makeEventDetail({ broadcastInfoStatus: status });
      return buildEventNotes(event, describeEventTiming(event))[0];
    });
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toContain("発表されていません");
    expect(texts[1]).toContain("行わないと案内");
    expect(texts[2]).toContain("過去大会の参考情報");
  });

  it("日本時間の日付が現地と異なる海外大会ではその旨を書く", () => {
    const event = makeEventDetail({
      timezone: "America/Los_Angeles",
      countryCode: "US",
      startDate: "2026-10-17",
      endDate: "2026-10-17",
      startAt: zonedToUtc("2026-10-17", "10:00", "America/Los_Angeles"),
    });
    expect(event.startAt).toEqual(zonedToUtc("2026-10-18", "02:00", JST));
    const notes = buildEventNotes(event, describeEventTiming(event)).join("\n");
    expect(notes).toContain("日本時間の日付が現地の日付と異なります");
  });
});
