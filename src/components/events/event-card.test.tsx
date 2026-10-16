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
    expect(link).toHaveAttribute("href", "/events/test-marathon/");
  });

  it("外部リンクは新しいタブで開き、外部サイトであることをアクセシブルネームで伝える", () => {
    const { card } = renderCard({
      broadcasts: [makeBroadcast({ watchUrl: "https://example.com/watch", infoUrl: "https://example.com/info" })],
    });
    const official = within(card).getByRole("link", { name: /大会公式サイト/ });
    expect(official).toHaveTextContent("大会公式サイト");
    expect(official).toHaveAccessibleName("テストマラソンの大会公式サイト（外部サイト・新しいタブで開きます）");
    const slotLink = within(card).getByRole("link", { name: /視聴ページへ/ });
    for (const link of [official, slotLink]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(slotLink).toHaveAccessibleName("テスト放送（架空） 視聴ページへ（外部サイト・新しいタブで開きます）");
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
    // 「未確認」は配信なしと誤解されないよう、一覧でも短い説明を添える
    expect(unverifiedText).toContain("放送・配信がないという意味ではありません");
    expect(unverifiedText).not.toContain("放送・配信なし（公式案内）");
    unmount();

    const { card: none } = renderCard({ broadcastInfoStatus: "NO_BROADCAST" });
    const noneText = none.textContent ?? "";
    expect(noneText).toContain("放送・配信なし（公式案内）");
    expect(noneText).not.toContain("未確認");
    expect(noneText).not.toBe(unverifiedText);
  });

  it("状態ラベルは確認済みでも 1 回だけ表示し、確認日時・補足・定型の説明は一覧に出さない", () => {
    const { card } = renderCard({
      broadcastNote: "関東以外の放送局・放送地域は、お住まいの地域の番組表で確認してください。",
      broadcasts: [makeBroadcast()],
    });
    expect(within(card).getAllByText("公式発表を確認済み")).toHaveLength(1);
    expect(card.textContent).not.toContain("情報確認");
    expect(card.textContent).not.toContain("関東以外の放送局");
    expect(card.textContent).not.toContain("主催者・放送局などの公式発表で");
    // 確認済みの枠には枠ごとの「確認済み」を重ねて出さない
    expect(within(card).getByTestId("broadcast-slot")).not.toHaveTextContent("確認済み");
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
    expect(within(card).getByRole("link", { name: /放送案内へ/ })).toHaveAttribute("href", "https://example.com/info");
  });

  it("http(s) 以外の URL はリンクにしない", () => {
    const { card } = renderCard({
      officialUrl: "javascript:alert(1)",
      broadcasts: [makeBroadcast({ watchUrl: "javascript:alert(1)", infoUrl: "data:text/html,x" })],
    });
    expect(within(card).queryByRole("link", { name: /大会公式サイト|視聴ページ|放送案内|告知/ })).not.toBeInTheDocument();
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

describe("EventCard: 一覧では補足・出典・確認日時を出さない", () => {
  it("枠の補足（note）・出典・確認日時は一覧に出さない（詳細ページで表示する）", () => {
    const { card } = renderCard({
      broadcasts: [
        makeBroadcast({
          note: "関東以外の放送局・放送地域は、お住まいの地域の番組表で確認してください。",
          source: { url: "https://example.com/program", title: "番組公式ページ（テスト）" },
        }),
      ],
    });
    expect(card.textContent).not.toContain("関東以外の放送局");
    expect(card.textContent).not.toContain("出典");
    expect(card.textContent).not.toContain("確認日時");
    expect(within(card).queryByTestId("slot-provenance")).not.toBeInTheDocument();
  });

  it("未確認・地域限定・過去大会の短い表示は一覧でも残す", () => {
    const { card } = renderCard({
      broadcasts: [
        makeBroadcast({ id: "a", verificationStatus: "UNVERIFIED", verifiedAt: null }),
        makeBroadcast({ id: "b", region: "REGIONAL", regionNote: "関東エリアほか" }),
        makeBroadcast({ id: "c", verificationStatus: "PAST_REFERENCE", airDate: null, startAt: null, endAt: null }),
      ],
    });
    const [unverified, regional, past] = within(card).getAllByTestId("broadcast-slot");
    expect(unverified).toHaveTextContent("未確認");
    expect(regional).toHaveTextContent("地域限定（関東エリアほか）");
    expect(past).toHaveTextContent("過去大会の参考情報");
  });
});

describe("EventCard: 放送・配信カード全体のリンク", () => {
  function slotLinkOf(card: HTMLElement) {
    return within(within(card).getByTestId("broadcast-slot")).queryByTestId("broadcast-slot-link");
  }

  it("遷移先は 視聴 URL → 放送案内 URL → 出典 URL の順に選び、表示を変える", () => {
    const source = { url: "https://example.com/announce", title: "告知（テスト）" };
    const cases = [
      { slot: { watchUrl: "https://example.com/watch", infoUrl: "https://example.com/info", source }, href: "https://example.com/watch", label: "視聴ページへ", kind: "watch" },
      { slot: { watchUrl: null, infoUrl: "https://example.com/info", source }, href: "https://example.com/info", label: "放送案内へ", kind: "info" },
      { slot: { watchUrl: null, infoUrl: null, source }, href: "https://example.com/announce", label: "告知を確認", kind: "source" },
    ] as const;
    for (const c of cases) {
      const { card, unmount } = renderCard({ broadcasts: [makeBroadcast(c.slot)] });
      const link = slotLinkOf(card)!;
      expect(link).toHaveAttribute("href", c.href);
      expect(link).toHaveTextContent(c.label);
      expect(link).toHaveAccessibleName(`テスト放送（架空） ${c.label}（外部サイト・新しいタブで開きます）`);
      expect(within(card).getByTestId("broadcast-slot")).toHaveAttribute("data-link-kind", c.kind);
      unmount();
    }
  });

  it("カード全体が 1 つの <a> で、中にリンクやボタンを入れ子にしない", () => {
    const { card } = renderCard({
      broadcasts: [makeBroadcast({ watchUrl: "https://example.com/watch", infoUrl: "https://example.com/info" })],
    });
    const link = slotLinkOf(card)!;
    expect(link.tagName).toBe("A");
    expect(link.querySelectorAll("a, button")).toHaveLength(0);
    // 局名・日時・条件をカードの内容として含み、説明としても伝える
    expect(link).toHaveTextContent("テスト放送（架空）");
    expect(link).toHaveTextContent("10月12日（月）9:00〜12:00");
    expect(link).toHaveAccessibleDescription(/地上波.*10月12日（月）9:00〜12:00.*無料.*ライブ.*全国/);
    // 一覧の枠に「放送案内」などの個別リンクは出さない
    expect(within(card).queryByRole("link", { name: /^テスト放送（架空）の放送案内/ })).not.toBeInTheDocument();
  });

  it("有効な URL がない枠はリンクにしない", () => {
    const { card } = renderCard({ broadcasts: [makeBroadcast({ watchUrl: null, infoUrl: null, source: null })] });
    expect(slotLinkOf(card)).not.toBeInTheDocument();
    expect(within(card.querySelector('[data-testid="broadcast-slot"]') as HTMLElement).queryAllByRole("link")).toHaveLength(0);
    expect(within(card).getByTestId("broadcast-slot")).toHaveAttribute("data-link-kind", "none");
  });

  it("安全でない URL は飛ばして次の候補を使い、すべて不正ならリンクにしない", () => {
    const { card, unmount } = renderCard({
      broadcasts: [makeBroadcast({ watchUrl: "javascript:alert(1)", infoUrl: "https://example.com/info" })],
    });
    expect(slotLinkOf(card)).toHaveAttribute("href", "https://example.com/info");
    unmount();

    const { card: bad } = renderCard({
      broadcasts: [
        makeBroadcast({
          watchUrl: "javascript:alert(1)",
          infoUrl: "data:text/html,x",
          source: { url: "https://user:pass@example.com/x", title: "不正" },
        }),
      ],
    });
    expect(slotLinkOf(bad)).not.toBeInTheDocument();
  });

  it("未確認の枠では状態もリンクの説明に含める", () => {
    const { card } = renderCard({
      broadcasts: [makeBroadcast({ verificationStatus: "UNVERIFIED", infoUrl: "https://example.com/info" })],
    });
    expect(slotLinkOf(card)).toHaveAccessibleDescription(/未確認/);
  });
});
