import { expect, test } from "@playwright/test";

import { eventCard } from "../support/locators";

test.describe("大会詳細", () => {
  test("一覧から大会詳細へ移動し、日程・放送枠・リンクを区別して確認できる", async ({ page }) => {
    await page.goto("/");
    await eventCard(page, "demo-championships")
      .getByRole("link", { name: "みる陸デモ陸上競技選手権の大会詳細" })
      .click();

    await expect(page).toHaveURL(/\/events\/demo-championships$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("みる陸デモ陸上競技選手権");

    // 複数日開催とセッション
    await expect(page.getByText("1日目（予選・男女10000m決勝）")).toBeVisible();
    await expect(page.getByText("3日目（男女1500m決勝 ほか）")).toBeVisible();

    // 複数の放送・配信枠
    await expect(page.getByText("デモ陸連公式ライブ（架空）").first()).toBeVisible();
    await expect(page.getByText("BSデモ（架空）").first()).toBeVisible();
    await expect(page.getByText("デモ公共放送 総合（架空）").first()).toBeVisible();

    // 「大会公式」「視聴ページ」「放送案内」を区別
    await expect(page.getByRole("link", { name: /大会公式サイト/ }).first()).toHaveAttribute(
      "href",
      "https://example.org/miruriku-demo/championships",
    );
    await expect(page.getByRole("link", { name: /視聴ページ/ }).first()).toHaveAttribute(
      "href",
      "https://example.com/miruriku-demo/watch/championships-day1",
    );
    await expect(page.getByRole("link", { name: /放送案内/ }).first()).toHaveAttribute(
      "href",
      "https://example.com/miruriku-demo/info/championships",
    );
  });

  test("下書きの大会の詳細ページは表示されない（404）", async ({ page }) => {
    const res = await page.goto("/events/demo-draft-ekiden");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("みる陸デモ下書き駅伝（非公開）")).toHaveCount(0);
  });

  test("下書きの放送枠は詳細ページにも表示されない", async ({ page }) => {
    await page.goto("/events/demo-seaside-marathon");
    await expect(page.getByText("デモ配信プラス（架空）").first()).toBeVisible();
    await expect(page.getByText("下書きの放送枠（非公開・デモ）")).toHaveCount(0);
  });
});
