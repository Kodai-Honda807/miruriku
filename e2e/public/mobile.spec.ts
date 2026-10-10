import { expect, test } from "@playwright/test";

import { eventCard } from "../support/locators";

test("スマートフォン幅でも一覧の放送先が読め、横スクロールが発生しない", async ({ page }) => {
  await page.goto("/");
  const card = eventCard(page, "demo-bay-ekiden");
  await expect(card).toBeVisible();
  await expect(card).toContainText("デモテレビ系列（架空）");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
