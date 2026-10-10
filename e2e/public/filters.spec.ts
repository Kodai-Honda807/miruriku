import { expect, test } from "@playwright/test";

import { eventCards, visibleSlugs } from "../support/locators";

test.describe("絞り込み", () => {
  test("期間「今日」で今日の大会だけになり、URL に保持される", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "今日" }).check();
    await expect(page).toHaveURL(/period=today/);
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-track-night"]);

    await page.reload();
    await expect(page.getByRole("radio", { name: "今日" })).toBeChecked();
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-track-night"]);
  });

  test("期間「今週（7日間）」は今日から 7 日間", async ({ page }) => {
    await page.goto("/?period=week");
    await expect(eventCards(page).first()).toBeVisible();
    const slugs = await visibleSlugs(page);
    expect(slugs).toContain("demo-10000m-night"); // 10/16
    expect(slugs).not.toContain("demo-europe-grand-prix"); // 日本時間 10/18
    expect(slugs).not.toContain("demo-championships"); // 10/20〜
  });

  test("カテゴリと視聴方法の組み合わせで絞り込める", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("group", { name: "競技" }).getByRole("checkbox", { name: "駅伝" }).check();
    await expect(page).toHaveURL(/category=ekiden/);
    await page.getByRole("group", { name: "視聴方法" }).getByRole("checkbox", { name: "地上波" }).check();
    await expect(page).toHaveURL(/medium=terrestrial/);

    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-prefecture-ekiden"]);

    // URL を直接開いても同じ結果（フィルタ状態を URL に保持）
    await page.goto("/?category=ekiden&medium=terrestrial");
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-prefecture-ekiden"]);
    await expect(page.getByRole("checkbox", { name: "駅伝" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "地上波" })).toBeChecked();
  });

  test("無料ネット配信ありで絞り込める（有料・料金不明・過去の参考情報は含めない）", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox", { name: "無料ネット配信あり" }).check();
    await expect(page).toHaveURL(/free=1/);
    await expect
      .poll(() => visibleSlugs(page))
      .toEqual(["demo-track-night", "demo-seaside-marathon", "demo-championships"]);
  });

  test("大会名で検索でき、該当なしの表示がある", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("大会名で検索").fill("湾岸");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page).toHaveURL(/q=/);
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden"]);

    await page.goto("/?q=" + encodeURIComponent("存在しない大会名"));
    await expect(page.getByText("条件に合う大会はありません")).toBeVisible();
    await expect(eventCards(page)).toHaveCount(0);
  });
});
