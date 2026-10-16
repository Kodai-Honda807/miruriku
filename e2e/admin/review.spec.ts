import { expect, test, type Page } from "@playwright/test";

// e2e/prepare.ts で、固定ファイルを使った収集 CLI により demo-city-marathon の候補が作られている。
// 管理画面は開発サーバー専用で、承認の結果は DB に反映される（公開サイトは data/real-events.ts から静的に作るため、
// 公開ページの表示は変わらない）。ここでは管理画面の大会編集画面で反映を確かめる。

async function openEventEditor(page: Page) {
  await page.goto("/admin/events");
  await page.getByRole("link", { name: "みる陸デモ市民マラソン", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/?$/);
}

test("管理画面で収集候補を承認すると DB の放送・配信枠に反映される", async ({ page }) => {
  // 承認前: 候補の放送局は大会の枠にない
  await openEventEditor(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("みる陸デモ市民マラソン");
  await expect(page.getByText("みる陸デモ中央テレビ（架空）")).toHaveCount(0);

  // 候補一覧 → 候補詳細（差分表示）
  await page.goto("/admin/candidates");
  await page.getByRole("link", { name: /みる陸デモ市民マラソン.*候補を確認/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/candidates\/[^/]+\/?$/);
  await expect(page.getByText("みる陸デモ中央テレビ（架空）").first()).toBeVisible();
  await expect(page.getByText("みる陸デモ配信（架空）").first()).toBeVisible();
  await expect(page.getByText(/公開サイトには反映されません/)).toBeVisible();

  // 承認
  await page.getByRole("button", { name: "承認して DB に反映" }).click();
  await expect(page).toHaveURL(/notice=approved/);
  await expect(page.getByText(/状態:\s*承認済み/)).toBeVisible();
  await expect(page.getByRole("button", { name: "承認して DB に反映" })).toHaveCount(0);

  // 大会の編集画面に枠が追加されている
  await openEventEditor(page);
  await expect(page.getByText("みる陸デモ中央テレビ（架空）").first()).toBeVisible();
  await expect(page.getByText("みる陸デモ配信（架空）").first()).toBeVisible();
});
