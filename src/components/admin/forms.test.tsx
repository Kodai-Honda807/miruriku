import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FormState } from "@/server/admin/form-state";

import { EventForm } from "./event-form";
import { ReviewActions } from "./review-actions";
import { SlotForm } from "./slot-form";

const SERIES = [{ id: "series-1", name: "デモシリーズ", slug: "demo-series" }];

describe("EventForm", () => {
  it("サーバーから返った項目ごとのエラーを入力欄に関連づけて表示し、入力値を復元する", async () => {
    const action = vi.fn(
      async (prev: FormState, formData: FormData): Promise<FormState> => ({
        status: "error",
        message: "入力内容を確認してください（2 件のエラー）",
        fieldErrors: { slug: ["slug の形式が不正です"], endDate: ["終了日は開始日と同じか、それより後の日付にしてください"] },
        values: Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])),
        attempt: prev.attempt + 1,
      }),
    );
    render(<EventForm action={action} defaults={{ seriesMode: "existing", seriesId: "series-1" }} seriesOptions={SERIES} submitLabel="大会を作成" />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^slug/), "Bad Slug");
    await user.click(screen.getByRole("button", { name: "大会を作成" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("入力内容を確認してください"));
    const slug = screen.getByLabelText(/^slug/);
    expect(slug).toHaveAttribute("aria-invalid", "true");
    expect(slug).toHaveAccessibleDescription(expect.stringContaining("slug の形式が不正です"));
    expect(slug).toHaveValue("Bad Slug");
    expect(screen.getByLabelText(/終了日/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^大会名/)).not.toHaveAttribute("aria-invalid");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("必須項目はラベルに「必須」を含み、主要な項目にラベルが付いている", () => {
    render(<EventForm action={vi.fn()} defaults={{}} seriesOptions={SERIES} submitLabel="保存" />);
    expect(screen.getByRole("textbox", { name: "大会名（必須）" })).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("textbox", { name: "回" })).not.toHaveAttribute("aria-required");
    for (const label of [/^回/, /開催年/, /カテゴリ/, /開始日/, /競技開始時刻/, /タイムゾーン/, /大会公式 URL/, /放送情報の状態/]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: /放送情報を今確認した/ })).not.toBeChecked();
  });

  it("新しいシリーズの作成に切り替えられる", async () => {
    render(<EventForm action={vi.fn()} defaults={{}} seriesOptions={SERIES} submitLabel="保存" />);
    const user = userEvent.setup();
    expect(screen.getByRole("combobox", { name: "シリーズ（必須）" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "新しいシリーズを作る" }));
    expect(screen.getByRole("textbox", { name: "新しいシリーズ名（必須）" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "シリーズ（必須）" })).toBeNull();
  });
});

describe("SlotForm", () => {
  it("情報源の選択肢と日本時間の入力欄を表示する", () => {
    render(
      <SlotForm
        action={vi.fn()}
        defaults={{ cost: "UNKNOWN", status: "DRAFT", sourceId: "src-1" }}
        sourceOptions={[{ id: "src-1", label: "大会公式: デモ" }]}
        submitLabel="追加"
      />,
    );
    expect(screen.getByLabelText(/放送日（日本時間）/)).toHaveAttribute("type", "date");
    expect(screen.getByLabelText(/開始時刻（日本時間）/)).toHaveAttribute("type", "time");
    expect(screen.getByLabelText(/根拠の情報源/)).toHaveValue("src-1");
    expect(screen.getByLabelText(/^公開状態/)).toHaveValue("DRAFT");
    expect(screen.getByRole("checkbox", { name: /確認日時を今に更新/ })).toBeInTheDocument();
  });
});

describe("ReviewActions", () => {
  it("承認・却下のボタンを表示する", () => {
    render(<ReviewActions approveAction={vi.fn()} rejectAction={vi.fn()} canApprove />);
    expect(screen.getByRole("button", { name: "承認して DB に反映" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "却下する" })).toBeEnabled();
    expect(screen.getByLabelText("却下理由メモ（任意）")).toBeInTheDocument();
  });

  it("承認できない候補では承認ボタンを無効にする", () => {
    render(<ReviewActions approveAction={vi.fn()} rejectAction={vi.fn()} canApprove={false} />);
    expect(screen.getByRole("button", { name: "承認して DB に反映" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "却下する" })).toBeEnabled();
  });

  it("却下理由を送信し、エラーは利用者向けの文言だけを表示する", async () => {
    const rejectAction = vi.fn(
      async (prev: FormState, formData: FormData): Promise<FormState> => ({
        status: "error",
        message: "却下に失敗しました。時間をおいて再度お試しください。",
        fieldErrors: {},
        values: { note: String(formData.get("note") ?? "") },
        attempt: prev.attempt + 1,
      }),
    );
    render(<ReviewActions approveAction={vi.fn()} rejectAction={rejectAction} canApprove />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("却下理由メモ（任意）"), "誤った局名");
    await user.click(screen.getByRole("button", { name: "却下する" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("却下に失敗しました"));
    expect(rejectAction.mock.calls[0]![1].get("note")).toBe("誤った局名");
    // エラー時は入力した理由を残す
    expect(screen.getByLabelText("却下理由メモ（任意）")).toHaveValue("誤った局名");
  });
});
