import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FILTERS, type EventFilters } from "@/domain/filters";

import { EventFilterForm, FILTER_DIALOG_ID, type PeriodOption } from "./event-filter-form";

const navigate = vi.fn();

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "today", label: "今日", rangeLabel: "10月10日（土）" },
  { value: "week", label: "今週（7日間）", rangeLabel: "10月10日（土）〜10月16日（金）" },
  { value: "upcoming", label: "この先", rangeLabel: "10月10日（土）以降" },
];

function renderForm(filters: Partial<EventFilters> = {}) {
  return render(<EventFilterForm filters={{ ...DEFAULT_FILTERS, ...filters }} periodOptions={PERIOD_OPTIONS} onNavigate={navigate} />);
}

function dialog() {
  return screen.getByTestId("filter-dialog") as HTMLDialogElement;
}

function trigger() {
  return screen.getByRole("button", { name: /^絞り込み/ });
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(trigger());
  expect(dialog().open).toBe(true);
  return within(dialog());
}

beforeEach(() => {
  navigate.mockClear();
});

describe("EventFilterForm: E2E 用の契約とプログレッシブエンハンスメント", () => {
  it("GET で / に送信できる検索フォーム（JavaScript の読み込み前に送信されても、URL の条件で絞り込まれる）", () => {
    renderForm();
    const form = screen.getByRole("search", { name: "大会の絞り込み" });
    expect(form.tagName).toBe("FORM");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/");
    expect(screen.getByLabelText("大会名で検索")).toHaveAttribute("name", "q");
    expect(screen.getByRole("button", { name: "検索" })).toHaveAttribute("type", "submit");
  });

  it("ダイアログもフォームの内側にあり、競技・視聴方法・無料ネット配信の入力が GET で送信される", () => {
    renderForm();
    const form = screen.getByRole("search", { name: "大会の絞り込み" });
    const d = dialog();
    expect(d.tagName).toBe("DIALOG");
    expect(form).toContainElement(d);
    // 閉じていてもフォームの入力として送信される（JavaScript なしでも条件が保たれる）
    expect(d.querySelectorAll('input[name="category"]')).toHaveLength(3);
    expect(d.querySelectorAll('input[name="medium"]')).toHaveLength(5);
    expect(d.querySelector('input[name="free"]')).toHaveAttribute("value", "1");
    // 対応ブラウザでは JavaScript なしでも開閉できる（Invoker Commands）
    expect(trigger()).toHaveAttribute("commandfor", FILTER_DIALOG_ID);
    expect(trigger()).toHaveAttribute("command", "show-modal");
    expect(within(d).getByRole("button", { name: "適用", hidden: true })).toHaveAttribute("type", "submit");
  });

  it("通常画面には検索・期間・絞り込みボタンだけを置き、ダイアログは閉じている", () => {
    renderForm();
    const period = screen.getByRole("group", { name: "期間" });
    expect(within(period).getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["today", "week", "upcoming"]);
    for (const label of ["今日", "今週（7日間）", "この先"]) {
      expect(within(period).getByLabelText(label)).toHaveAttribute("name", "period");
    }
    expect(trigger()).toHaveAttribute("aria-haspopup", "dialog");
    expect(dialog().open).toBe(false);
  });

  it("ダイアログに競技・視聴方法の fieldset と無料ネット配信ありを置く", async () => {
    const user = userEvent.setup();
    renderForm();
    const d = await openDialog(user);
    expect(dialog()).toHaveAccessibleName("絞り込み");
    const category = d.getByRole("group", { name: "競技" });
    for (const label of ["駅伝", "マラソン", "トラック"]) {
      expect(within(category).getByLabelText(label)).toHaveAttribute("name", "category");
    }
    const medium = d.getByRole("group", { name: "視聴方法" });
    for (const label of ["地上波", "BS", "CS", "ネット配信", "ラジオ"]) {
      expect(within(medium).getByLabelText(label)).toHaveAttribute("name", "medium");
    }
    expect(d.getByRole("checkbox", { name: "無料ネット配信あり" })).toHaveAccessibleDescription(
      /無料で見られるネット配信の枠がある大会だけ/,
    );
  });

  it("期間の選択肢に実際の日付範囲を説明として関連付け、選択中の範囲を表示する", () => {
    renderForm({ period: "week" });
    expect(screen.getByRole("radio", { name: "今週（7日間）" })).toHaveAccessibleDescription(
      "10月10日（土）〜10月16日（金）",
    );
    expect(screen.getByRole("radio", { name: "今日" })).toHaveAccessibleDescription("10月10日（土）");
    expect(screen.getByTestId("selected-period-range")).toHaveTextContent("10月10日（土）〜10月16日（金）");
  });

  it("URL から読み取った条件を選択状態に反映する", async () => {
    const user = userEvent.setup();
    renderForm({ period: "week", categories: ["EKIDEN"], media: ["BS", "INTERNET"], freeInternet: true, q: "湾岸" });
    expect(screen.getByRole("radio", { name: "今週（7日間）" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "この先" })).not.toBeChecked();
    expect(screen.getByLabelText("大会名で検索")).toHaveValue("湾岸");

    const d = await openDialog(user);
    expect(d.getByRole("checkbox", { name: "駅伝" })).toBeChecked();
    expect(d.getByRole("checkbox", { name: "マラソン" })).not.toBeChecked();
    expect(d.getByRole("checkbox", { name: "BS" })).toBeChecked();
    expect(d.getByRole("checkbox", { name: "ネット配信" })).toBeChecked();
    expect(d.getByRole("checkbox", { name: "無料ネット配信あり" })).toBeChecked();
  });

  it("既定の条件では「条件をクリア」も適用中の条件も出さない", () => {
    renderForm();
    expect(screen.queryByRole("link", { name: "条件をクリア" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-filters")).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleName("絞り込み");
  });
});

describe("EventFilterForm: 期間と検索語", () => {
  it("期間の変更はすぐに URL クエリへ反映し、既存の条件を保つ", async () => {
    const user = userEvent.setup();
    renderForm({ categories: ["TRACK"] });
    await user.click(screen.getByRole("radio", { name: "今日" }));
    expect(navigate).toHaveBeenLastCalledWith("/?period=today&category=track");
  });

  it("検索語は Enter / 検索ボタンで反映し、入力中には更新しない", async () => {
    const user = userEvent.setup();
    renderForm();
    const input = screen.getByLabelText("大会名で検索");
    await user.type(input, " 湾岸 ");
    expect(navigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "検索" }));
    expect(navigate).toHaveBeenLastCalledWith(`/?q=${encodeURIComponent("湾岸")}`);

    navigate.mockClear();
    await user.type(input, "{Enter}");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("入力中の検索語は、期間の切替・ダイアログの適用のときにも合わせて反映する（コメントの仕様どおり）", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("大会名で検索"), "駅伝");
    await user.click(screen.getByRole("radio", { name: "今週（7日間）" }));
    expect(navigate).toHaveBeenLastCalledWith(`/?period=week&q=${encodeURIComponent("駅伝")}`);

    navigate.mockClear();
    const d = await openDialog(user);
    await user.click(d.getByRole("checkbox", { name: "BS" }));
    await user.click(d.getByRole("button", { name: "適用" }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]![0]).toContain(`q=${encodeURIComponent("駅伝")}`);
  });

  it("「条件をクリア」で既定の条件に戻す", async () => {
    const user = userEvent.setup();
    renderForm({ period: "today", categories: ["EKIDEN"], q: "テスト" });
    const clear = screen.getByRole("link", { name: "条件をクリア" });
    expect(clear).toHaveAttribute("href", "/");
    await user.click(clear);
    expect(navigate).toHaveBeenLastCalledWith("/");
    expect(screen.getByLabelText("大会名で検索")).toHaveValue("");
  });
});

describe("EventFilterForm: 絞り込みダイアログ", () => {
  it("ダイアログ内の変更は「適用」までは反映せず、適用でまとめて 1 回だけ反映する", async () => {
    const user = userEvent.setup();
    renderForm({ period: "week" });
    const d = await openDialog(user);
    await user.click(d.getByRole("checkbox", { name: "駅伝" }));
    await user.click(d.getByRole("checkbox", { name: "地上波" }));
    await user.click(d.getByRole("checkbox", { name: "無料ネット配信あり" }));
    expect(navigate).not.toHaveBeenCalled();

    await user.click(d.getByRole("button", { name: "適用" }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenLastCalledWith("/?period=week&category=ekiden&medium=terrestrial&free=1");
    expect(dialog().open).toBe(false);
  });

  it("「キャンセル」では変更を破棄し、次に開いたときは適用中の条件に戻っている", async () => {
    const user = userEvent.setup();
    renderForm({ media: ["BS"] });
    let d = await openDialog(user);
    await user.click(d.getByRole("checkbox", { name: "駅伝" }));
    await user.click(d.getByRole("checkbox", { name: "BS" }));
    await user.click(d.getByRole("button", { name: "キャンセル" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(dialog().open).toBe(false);

    d = await openDialog(user);
    expect(d.getByRole("checkbox", { name: "駅伝" })).not.toBeChecked();
    expect(d.getByRole("checkbox", { name: "BS" })).toBeChecked();
  });

  it("閉じるボタンでも変更を破棄する", async () => {
    const user = userEvent.setup();
    renderForm();
    const d = await openDialog(user);
    await user.click(d.getByRole("checkbox", { name: "トラック" }));
    await user.click(d.getByRole("button", { name: "閉じる（変更を破棄）" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(dialog().open).toBe(false);
  });

  it("閉じたあとは絞り込みボタンにフォーカスを戻す", async () => {
    const user = userEvent.setup();
    renderForm();
    const d = await openDialog(user);
    await user.click(d.getByRole("button", { name: "キャンセル" }));
    expect(trigger()).toHaveFocus();
  });

  it("「すべて外す」はダイアログ内の選択だけを外し、適用で反映する", async () => {
    const user = userEvent.setup();
    renderForm({ categories: ["EKIDEN"], media: ["CS"], q: "駅伝" });
    const d = await openDialog(user);
    await user.click(d.getByRole("button", { name: "すべて外す" }));
    expect(d.getByRole("checkbox", { name: "駅伝" })).not.toBeChecked();
    expect(navigate).not.toHaveBeenCalled();
    await user.click(d.getByRole("button", { name: "適用" }));
    expect(navigate).toHaveBeenLastCalledWith(`/?q=${encodeURIComponent("駅伝")}`);
  });

  it("背景（ダイアログ要素そのもの）のクリックはキャンセル扱い", async () => {
    const user = userEvent.setup();
    renderForm();
    const d = await openDialog(user);
    await user.click(d.getByRole("checkbox", { name: "駅伝" }));
    await user.click(dialog());
    expect(dialog().open).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("EventFilterForm: 適用中の追加条件", () => {
  it("適用中の条件を表示し、件数を絞り込みボタンで伝える", () => {
    renderForm({ categories: ["EKIDEN"], media: ["INTERNET"], freeInternet: true });
    const list = screen.getByRole("list", { name: "適用中の絞り込み条件" });
    expect(within(list).getAllByRole("link").map((a) => a.textContent)).toEqual(["駅伝", "ネット配信", "無料ネット配信あり"]);
    expect(trigger()).toHaveAccessibleName("絞り込み（3件適用中）");
  });

  it("条件ごとに個別に外せる（リンク先はその条件を除いた URL）", async () => {
    const user = userEvent.setup();
    renderForm({ period: "today", categories: ["EKIDEN", "TRACK"], freeInternet: true });
    const remove = screen.getByRole("link", { name: "「駅伝」の条件を外す" });
    expect(remove).toHaveAttribute("href", "/?period=today&category=track&free=1");
    expect(screen.getByRole("link", { name: "「無料ネット配信あり」の条件を外す" })).toHaveAttribute(
      "href",
      "/?period=today&category=ekiden&category=track",
    );
    await user.click(remove);
    expect(navigate).toHaveBeenLastCalledWith("/?period=today&category=track&free=1");
  });
});
