import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { zonedToUtc } from "@/domain/datetime";

import { EventCard } from "./event-card";
import { FIXED_NOW, makeBroadcast, makeEvent } from "./test-fixtures";

/** "10:00" の一部としての "0:00" ではなく、単独の "0:00" / "00:00" を検出する */
const STANDALONE_MIDNIGHT = /(^|[^0-9])0?0:00/;

function renderCard(...args: Parameters<typeof makeEvent>) {
  const event = makeEvent(...args);
  const { unmount } = render(<EventCard event={event} now={FIXED_NOW} />);
  return { event, card: screen.getByTestId("event-card"), unmount };
}

describe("EventCard: E2E 用の契約", () => {
  it("article に data-testid と data-event-slug を持ち、見出しに大会名を表示する", () => {
    const { card } = renderCard();
    expect(card.tagName).toBe("ARTICLE");
    expect(card).toHaveAttribute("data-event-slug", "test-marathon");
    expect(within(card).getByRole("heading", { level: 3, name: "テストマラソン" })).toBeInTheDocument();
    expect(card).toHaveAccessibleName("テストマラソン");
  });

  it("「大会詳細」リンクのアクセシブルネームは「大会名の大会詳細」", () => {
    const { card } = renderCard();
    const link = within(card).getByRole("link", { name: "テストマラソンの大会詳細" });
    expect(link).toHaveTextContent("大会詳細");
    expect(link).toHaveAttribute("href", "/events/test-marathon");
  });

  it("外部リンクは新しいタブで開き、外部サイトであることをアクセシブルネームで伝える", () => {
    const { card } = renderCard({
      broadcasts: [makeBroadcast({ watchUrl: "https://example.com/watch", infoUrl: "https://example.com/info" })],
    });
    const official = within(card).getByRole("link", { name: /大会公式サイト/ });
    expect(official).toHaveTextContent("大会公式サイト");
    expect(official).toHaveAccessibleName("テストマラソンの大会公式サイト（外部サイト・新しいタブで開きます）");
    for (const link of [
      official,
      within(card).getByRole("link", { name: /視聴ページ/ }),
      within(card).getByRole("link", { name: /放送案内/ }),
    ]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(within(card).getByRole("link", { name: /視聴ページ/ })).toHaveAccessibleName(
      "テスト放送（架空）の視聴ページ（外部サイト・新しいタブで開きます）",
    );
  });

  it("デモ大会には「デモ」バッジを表示する", () => {
    const { card } = renderCard({ isDemo: true });
    expect(within(card).getByText("デモ")).toBeInTheDocument();
  });
});

describe("EventCard: 放送情報の状態", () => {
  it("UNVERIFIED（未確認）と NO_BROADCAST（配信なし）で表示文言が異なる", () => {
    const { card: unverified, unmount } = renderCard({ broadcastInfoStatus: "UNVERIFIED", broadcastCheckedAt: null });
    const unverifiedText = unverified.textContent ?? "";
    expect(unverifiedText).toContain("放送・配信情報は未確認");
    expect(unverifiedText).toContain("放送・配信がないという意味ではありません");
    expect(unverifiedText).not.toContain("放送・配信なし（公式案内）");
    unmount();

    const { card: none } = renderCard({ broadcastInfoStatus: "NO_BROADCAST" });
    const noneText = none.textContent ?? "";
    expect(noneText).toContain("放送・配信なし（公式案内）");
    expect(noneText).toContain("テレビ放送・ネット配信は行わないと案内されています");
    expect(noneText).not.toContain("未確認");
    expect(noneText).not.toBe(unverifiedText);
  });

  it("状態ラベルは確認済みでも常に表示し、確認日時があれば「情報確認」を表示する", () => {
    const { card } = renderCard();
    expect(within(card).getByText("公式発表を確認済み")).toBeInTheDocument();
    expect(within(card).getByText("情報確認: 10月8日（木）11:30")).toBeInTheDocument();
  });

  it("確認日時がなければ「情報確認」を表示しない", () => {
    const { card } = renderCard({ broadcastCheckedAt: null });
    expect(card.textContent).not.toContain("情報確認");
  });
});

describe("EventCard: 日時", () => {
  it("開始時刻が不明なら「開始時刻未確認」を表示し、0:00 などの仮時刻を出さない", () => {
    const { card } = renderCard({ startAt: null, broadcastCheckedAt: null });
    const schedule = within(card).getByTestId("event-schedule");
    expect(schedule).toHaveTextContent("開始時刻未確認");
    expect(schedule).toHaveTextContent("10月12日（月）");
    expect(schedule.textContent).not.toMatch(STANDALONE_MIDNIGHT);
    expect(card.textContent).not.toMatch(STANDALONE_MIDNIGHT);
  });

  it("海外大会は日本時間の日付・時刻と、現地日時を併記する", () => {
    const { card } = renderCard({
      timezone: "Europe/Zurich",
      countryCode: "CH",
      startDate: "2026-10-17",
      endDate: "2026-10-17",
      startAt: zonedToUtc("2026-10-17", "20:00", "Europe/Zurich"),
    });
    const schedule = within(card).getByTestId("event-schedule");
    // 日本時間では翌日の未明
    expect(schedule).toHaveTextContent("10月18日（日）");
    expect(schedule).toHaveTextContent("日本時間");
    expect(schedule).toHaveTextContent("3:00");
    expect(schedule).toHaveTextContent("現地 10月17日（土）20:00");
    expect(schedule).toHaveTextContent("日本時間では現地と日付が異なります");
    expect(card).toHaveTextContent("スイス");
  });

  it("海外大会で開始時刻が不明なら、現地日付であることと日付が変わり得ることを示す", () => {
    const { card } = renderCard({
      timezone: "America/New_York",
      countryCode: "US",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      startAt: null,
      broadcastCheckedAt: null,
    });
    const schedule = within(card).getByTestId("event-schedule");
    expect(schedule).toHaveTextContent("11月1日（日）");
    expect(schedule).toHaveTextContent("現地日付");
    expect(schedule).toHaveTextContent("開始時刻未確認（日本時間の日付は変わる場合があります）");
    expect(schedule.textContent).not.toMatch(STANDALONE_MIDNIGHT);
  });

  it("基準日と年が異なる大会は年を表示する", () => {
    const { card } = renderCard({
      startDate: "2027-01-02",
      endDate: "2027-01-03",
      startAt: zonedToUtc("2027-01-02", "08:00", "Asia/Tokyo"),
    });
    expect(within(card).getByTestId("event-schedule")).toHaveTextContent("2027年1月2日（土）〜2027年1月3日（日）");
  });
});

describe("EventCard: 放送・配信枠", () => {
  it("放送枠の媒体・局名・日時・料金・形態・地域を表示する", () => {
    const { card } = renderCard({ broadcasts: [makeBroadcast()] });
    const slot = within(card).getByTestId("broadcast-slot");
    expect(slot).toHaveTextContent("地上波");
    expect(slot).toHaveTextContent("テスト放送（架空）");
    expect(slot).toHaveTextContent("10月12日（月）9:00〜12:00");
    expect(slot).toHaveTextContent("無料");
    expect(slot).toHaveTextContent("ライブ");
    expect(slot).toHaveTextContent("全国");
    // 確認済みの枠には「未確認」を出さない
    expect(slot).not.toHaveTextContent("未確認");
  });

  it("視聴ページの URL がない枠には視聴リンクを出さず、大会公式サイトを視聴リンクとして出さない", () => {
    const { card } = renderCard({
      officialUrl: "https://example.org/official",
      broadcasts: [makeBroadcast({ watchUrl: null, infoUrl: "https://example.com/info" })],
    });
    expect(within(card).queryByRole("link", { name: /視聴/ })).not.toBeInTheDocument();
    expect(within(card).queryByText("視聴ページ")).not.toBeInTheDocument();

    const official = within(card).getByRole("link", { name: /大会公式サイト/ });
    expect(official).toHaveAttribute("href", "https://example.org/official");
    expect(official.textContent).not.toMatch(/視聴|見る/);

    // 公式サイトの URL を指すリンクは「大会公式サイト」だけ
    const linksToOfficial = within(card)
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "https://example.org/official");
    expect(linksToOfficial).toEqual([official]);
    expect(within(card).getByRole("link", { name: /放送案内/ })).toHaveAttribute("href", "https://example.com/info");
  });

  it("http(s) 以外の URL はリンクにしない", () => {
    const { card } = renderCard({
      officialUrl: "javascript:alert(1)",
      broadcasts: [makeBroadcast({ watchUrl: "javascript:alert(1)", infoUrl: "data:text/html,x" })],
    });
    expect(within(card).queryByRole("link", { name: /大会公式サイト|視聴ページ|放送案内/ })).not.toBeInTheDocument();
    for (const a of within(card).getAllByRole("link")) {
      expect(a.getAttribute("href")).not.toMatch(/^(javascript|data):/);
    }
  });

  it("PAST_REFERENCE の枠は「過去大会の参考情報」として今年の枠と区別して表示する", () => {
    const { card } = renderCard({
      broadcastInfoStatus: "PAST_REFERENCE",
      broadcasts: [
        makeBroadcast({
          id: "past",
          airDate: null,
          startAt: null,
          endAt: null,
          viewingType: "DELAYED",
          verificationStatus: "PAST_REFERENCE",
          verifiedAt: null,
        }),
      ],
    });
    const slot = within(card).getByTestId("broadcast-slot");
    expect(slot).toHaveAttribute("data-verification", "PAST_REFERENCE");
    expect(slot).toHaveTextContent("過去大会の参考情報");
    expect(within(card).getByRole("heading", { name: "過去大会の参考情報" })).toBeInTheDocument();
    expect(card).toHaveTextContent("今年の放送・配信予定ではありません");
    // 今年の予定のような「日時未確認」表示はしない
    expect(slot).not.toHaveTextContent("日時未確認");
  });

  it("未確認の枠は「未確認」と表示する", () => {
    const { card } = renderCard({
      broadcasts: [makeBroadcast({ verificationStatus: "UNVERIFIED", verifiedAt: null })],
    });
    expect(within(card).getByTestId("broadcast-slot")).toHaveTextContent("未確認");
  });

  it("地域限定は詳細を、日本での視聴可否不明はその旨を表示する", () => {
    const { card } = renderCard({
      broadcasts: [
        makeBroadcast({ id: "a", region: "REGIONAL", regionNote: "テスト県内のみ" }),
        makeBroadcast({ id: "b", medium: "INTERNET", region: "JAPAN_UNKNOWN", cost: "UNKNOWN" }),
      ],
    });
    const [regional, unknown] = within(card).getAllByTestId("broadcast-slot");
    expect(regional).toHaveTextContent("地域限定（テスト県内のみ）");
    expect(unknown).toHaveTextContent("日本での視聴可否不明");
    expect(unknown).toHaveTextContent("料金不明");
  });
});

describe("EventCard: 放送枠の出典と確認日時", () => {
  it("一覧でも放送枠ごとに出典リンクと確認日時を表示する", () => {
    const event = makeEvent({
      broadcasts: [
        makeBroadcast({
          source: { url: "https://example.com/program", title: "番組公式ページ（テスト）" },
        }),
      ],
    });
    render(<EventCard event={event} now={FIXED_NOW} />);
    const provenance = screen.getByTestId("slot-provenance");
    expect(provenance).toHaveTextContent("出典: 番組公式ページ（テスト）");
    expect(provenance).toHaveTextContent("確認日時: 10月8日（木）11:30");
    const link = within(provenance).getByRole("link", { name: /出典: 番組公式ページ（テスト）/ });
    expect(link).toHaveAttribute("href", "https://example.com/program");
  });

  it("出典も確認日時もない枠では、一覧に出典欄を出さない", () => {
    const event = makeEvent({ broadcasts: [makeBroadcast({ verifiedAt: null, source: null })] });
    render(<EventCard event={event} now={FIXED_NOW} />);
    expect(screen.queryByTestId("slot-provenance")).not.toBeInTheDocument();
  });

  it("安全でない出典 URL はリンクにしない", () => {
    const event = makeEvent({
      broadcasts: [makeBroadcast({ verifiedAt: null, source: { url: "javascript:alert(1)", title: "不正" } })],
    });
    render(<EventCard event={event} now={FIXED_NOW} />);
    expect(screen.queryByRole("link", { name: /出典/ })).not.toBeInTheDocument();
  });
});
