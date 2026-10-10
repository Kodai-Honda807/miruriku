import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, type EventFilters } from "@/domain/filters";

import { EventResults } from "./event-results";
import { FIXED_NOW, makeEvent } from "./test-fixtures";

function renderResults(events: ReturnType<typeof makeEvent>[], filters: Partial<EventFilters> = {}) {
  return render(
    <EventResults
      events={events}
      filters={{ ...DEFAULT_FILTERS, ...filters }}
      now={FIXED_NOW}
      periodRangeLabel="10月10日（土）以降"
    />,
  );
}

describe("EventResults", () => {
  it("件数と、大会カードを時系列の順序付きリストで表示する", () => {
    renderResults([makeEvent({ id: "a", slug: "a", name: "大会A" }), makeEvent({ id: "b", slug: "b", name: "大会B" })]);
    expect(screen.getByTestId("event-count")).toHaveTextContent("2件");
    const list = screen.getByRole("list", { name: "大会一覧" });
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByTestId("event-card").map((c) => c.getAttribute("data-event-slug"))).toEqual(["a", "b"]);
    expect(screen.getByTestId("event-result-summary")).toHaveTextContent("期間: この先 10月10日（土）以降");
  });

  it("表示中にデモ大会があれば、架空のデモデータであることを明示する", () => {
    renderResults([makeEvent({ isDemo: true })]);
    expect(screen.getByRole("note")).toHaveTextContent("表示中の大会は動作確認用の架空のデモデータです");
  });

  it("デモ大会が表示されていなければお知らせを出さない", () => {
    renderResults([makeEvent({ isDemo: false })]);
    expect(screen.queryByTestId("demo-notice")).not.toBeInTheDocument();
  });

  it("該当なしのときは「条件に合う大会はありません」と条件を変える提案を表示する", () => {
    renderResults([], { period: "today", categories: ["EKIDEN"], q: "湾岸" });
    expect(screen.getByTestId("event-count")).toHaveTextContent("0件");
    expect(screen.getByText("条件に合う大会はありません")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "期間を「この先」に広げる" })).toHaveAttribute(
      "href",
      `/?category=ekiden&q=${encodeURIComponent("湾岸")}`,
    );
    expect(screen.getByRole("link", { name: "競技の絞り込みを外す" })).toHaveAttribute(
      "href",
      `/?period=today&q=${encodeURIComponent("湾岸")}`,
    );
    expect(screen.getByRole("link", { name: "検索語「湾岸」を外す" })).toHaveAttribute("href", "/?period=today&category=ekiden");
    expect(screen.getByRole("link", { name: "条件をすべてクリア" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("event-result-summary")).toHaveTextContent("絞り込み: 駅伝、「湾岸」");
  });

  it("条件なしで該当なしのときは、掲載がない旨を表示する", () => {
    renderResults([]);
    expect(screen.getByText("条件に合う大会はありません")).toBeInTheDocument();
    expect(screen.getByText("現在、今日以降に開催予定の大会は掲載されていません。")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "条件をすべてクリア" })).not.toBeInTheDocument();
  });
});
