import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FILTERS, type EventFilters } from "@/domain/filters";

import { EventFilterForm, type PeriodOption } from "./event-filter-form";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "today", label: "今日", rangeLabel: "10月10日（土）" },
  { value: "week", label: "今週（7日間）", rangeLabel: "10月10日（土）〜10月16日（金）" },
  { value: "upcoming", label: "この先", rangeLabel: "10月10日（土）以降" },
];

function renderForm(filters: Partial<EventFilters> = {}) {
  return render(<EventFilterForm filters={{ ...DEFAULT_FILTERS, ...filters }} periodOptions={PERIOD_OPTIONS} />);
}

beforeEach(() => {
  replace.mockClear();
});

describe("EventFilterForm: E2E 用の契約とプログレッシブエンハンスメント", () => {
  it("GET で / に送信できる検索フォーム（JavaScript なしでも動く）", () => {
    renderForm();
    const form = screen.getByRole("search", { name: "大会の絞り込み" });
    expect(form.tagName).toBe("FORM");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/");
    expect(screen.getByLabelText("大会名で検索")).toHaveAttribute("name", "q");
    expect(screen.getByRole("button", { name: "検索" })).toHaveAttribute("type", "submit");
  });

  it("期間・競技・視聴方法の fieldset と、各ラベルのネイティブな入力を持つ", () => {
    renderForm();
    const period = screen.getByRole("group", { name: "期間" });
    expect(within(period).getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["today", "week", "upcoming"]);
    for (const label of ["今日", "今週（7日間）", "この先"]) {
      expect(within(period).getByLabelText(label)).toHaveAttribute("name", "period");
    }

    const category = screen.getByRole("group", { name: "競技" });
    expect(within(category).getAllByRole("checkbox")).toHaveLength(3);
    for (const label of ["駅伝", "マラソン", "トラック"]) {
      expect(within(category).getByLabelText(label)).toHaveAttribute("name", "category");
    }

    const medium = screen.getByRole("group", { name: "視聴方法" });
    expect(within(medium).getAllByRole("checkbox")).toHaveLength(5);
    for (const label of ["地上波", "BS", "CS", "ネット配信", "ラジオ"]) {
      expect(within(medium).getByLabelText(label)).toHaveAttribute("name", "medium");
    }

    const free = screen.getByRole("checkbox", { name: "無料ネット配信あり" });
    expect(free).toHaveAttribute("name", "free");
    expect(free).toHaveAttribute("value", "1");
  });

  it("期間の選択肢に実際の日付範囲を説明として関連付ける", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "今週（7日間）" })).toHaveAccessibleDescription(
      "10月10日（土）〜10月16日（金）",
    );
    expect(screen.getByRole("radio", { name: "今日" })).toHaveAccessibleDescription("10月10日（土）");
    expect(screen.getByText("10月10日（土）〜10月16日（金）")).toBeVisible();
  });

  it("URL から読み取った条件を選択状態に反映する", () => {
    renderForm({ period: "week", categories: ["EKIDEN"], media: ["BS", "INTERNET"], freeInternet: true, q: "湾岸" });
    expect(screen.getByRole("radio", { name: "今週（7日間）" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "この先" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "駅伝" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "マラソン" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "BS" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "ネット配信" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "無料ネット配信あり" })).toBeChecked();
    expect(screen.getByLabelText("大会名で検索")).toHaveValue("湾岸");
  });

  it("既定の条件では「条件をクリア」を出さない", () => {
    renderForm();
    expect(screen.queryByRole("link", { name: "条件をクリア" })).not.toBeInTheDocument();
  });
});

describe("EventFilterForm: JavaScript 有効時の自動更新", () => {
  it("チェックボックスの変更で URL クエリを router.replace で更新する", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("checkbox", { name: "駅伝" }));
    expect(replace).toHaveBeenLastCalledWith("/?category=ekiden", { scroll: false });
  });

  it("期間・視聴方法・無料ネット配信の変更も既存の条件を保ったまま反映する", async () => {
    const user = userEvent.setup();
    renderForm({ categories: ["TRACK"] });
    await user.click(screen.getByRole("radio", { name: "今日" }));
    expect(replace).toHaveBeenLastCalledWith("/?period=today&category=track", { scroll: false });

    replace.mockClear();
    await user.click(screen.getByRole("checkbox", { name: "無料ネット配信あり" }));
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining("free=1"), { scroll: false });
    expect(replace.mock.calls[0]![0]).toContain("category=track");
  });

  it("チェックを外すとその条件をクエリから除く", async () => {
    const user = userEvent.setup();
    renderForm({ media: ["TERRESTRIAL", "BS"] });
    await user.click(screen.getByRole("checkbox", { name: "地上波" }));
    expect(replace).toHaveBeenLastCalledWith("/?medium=bs", { scroll: false });
  });

  it("検索語は Enter / 検索ボタンで反映し、入力中には更新しない", async () => {
    const user = userEvent.setup();
    renderForm();
    const input = screen.getByLabelText("大会名で検索");
    await user.type(input, " 湾岸 ");
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "検索" }));
    expect(replace).toHaveBeenLastCalledWith(`/?q=${encodeURIComponent("湾岸")}`, { scroll: false });

    replace.mockClear();
    await user.type(input, "{Enter}");
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("「条件をクリア」で既定の条件に戻す", async () => {
    const user = userEvent.setup();
    renderForm({ period: "today", categories: ["EKIDEN"], q: "テスト" });
    const clear = screen.getByRole("link", { name: "条件をクリア" });
    expect(clear).toHaveAttribute("href", "/");
    await user.click(clear);
    expect(replace).toHaveBeenLastCalledWith("/", { scroll: false });
    expect(screen.getByLabelText("大会名で検索")).toHaveValue("");
  });
});
