import { expect, test } from "@playwright/test";

import { eventCard } from "../support/locators";

// global-setup で、固定ファイルを使った収集 CLI により demo-city-marathon の候補が作られている

test("管理画面で収集候補を承認すると公開ページに反映される", async ({ page }) => {
  // 承認前: 未確認で、候補の放送局は公開ページに出ていない
  await page.goto("/events/demo-city-marathon");
  await expect(page.getByText("放送・配信情報は未確認").first()).toBeVisible();
  await expect(page.getByText("みる陸デモ中央テレビ（架空）")).toHaveCount(0);

  // 候補一覧 → 候補詳細（差分表示）
  await page.goto("/admin/candidates");
  await page.getByRole("link", { name: /みる陸デモ市民マラソン.*候補を確認/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/candidates\/[^/]+$/);
  await expect(page.getByText("みる陸デモ中央テレビ（架空）").first()).toBeVisible();
  await expect(page.getByText("みる陸デモ配信（架空）").first()).toBeVisible();

  // 承認
  await page.getByRole("button", { name: "承認して公開データに反映" }).click();
  await expect(page).toHaveURL(/notice=approved/);
  await expect(page.getByText(/状態:\s*承認済み/)).toBeVisible();
  await expect(page.getByRole("button", { name: "承認して公開データに反映" })).toHaveCount(0);

  // 公開ページに反映
  await page.goto("/events/demo-city-marathon");
  await expect(page.getByText("みる陸デモ中央テレビ（架空）").first()).toBeVisible();
  await expect(page.getByText("公式発表を確認済み").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /視聴ページ/ }).first()).toHaveAttribute(
    "href",
    "https://example.com/miruriku-demo/watch/city-marathon",
  );

  await page.goto("/");
  const card = eventCard(page, "demo-city-marathon");
  await expect(card).toContainText("みる陸デモ中央テレビ（架空）");
  await expect(card).toContainText("8:50");
});
