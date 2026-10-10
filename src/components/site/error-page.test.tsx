import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";

describe("エラー表示（src/app/error.tsx）", () => {
  it("内部のエラー内容を出さずに案内し、再試行できる", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432 secret-detail"), { digest: "123" });
    render(<ErrorPage error={error} retry={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("大会情報を読み込めませんでした");
    expect(document.body.textContent).not.toContain("ECONNREFUSED");
    expect(document.body.textContent).not.toContain("secret-detail");

    await userEvent.setup().click(screen.getByRole("button", { name: "再試行" }));
    expect(retry).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe("見つからない場合の表示（src/app/not-found.tsx）", () => {
  it("見出しと一覧へ戻るリンクを表示する", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "ページが見つかりません" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "大会一覧へ戻る" })).toHaveAttribute("href", "/");
    // 公開ページの共通フッター
    expect(screen.getByRole("contentinfo")).toHaveTextContent("視聴前に必ず大会・放送局・配信サービスの公式情報をご確認ください");
  });
});
