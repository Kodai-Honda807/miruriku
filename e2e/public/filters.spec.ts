import { expect, test } from "@playwright/test";

import { eventCards, gotoHome, visibleSlugs } from "../support/locators";

test.describe("絞り込み", () => {
  test("期間「今日」で今日の大会だけになり、URL に保持される", async ({ page }) => {
    await gotoHome(page, "/");
    await page.getByRole("radio", { name: "今日" }).check();
    await expect(page).toHaveURL(/period=today/);
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-track-night"]);

    await page.reload();
    await expect(page.locator('[data-filters-ready="true"]')).toBeAttached();
    await expect(page.getByRole("radio", { name: "今日" })).toBeChecked();
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-track-night"]);
  });

  test("期間「今週（7日間）」は今日から 7 日間", async ({ page }) => {
    await gotoHome(page, "/?period=week");
    await expect(eventCards(page).first()).toBeVisible();
    const slugs = await visibleSlugs(page);
    expect(slugs).toContain("demo-10000m-night"); // 10/16
    expect(slugs).not.toContain("demo-europe-grand-prix"); // 日本時間 10/18
    expect(slugs).not.toContain("demo-championships"); // 10/20〜
  });

  test("絞り込みダイアログで競技と視聴方法を選び、「適用」でまとめて反映する", async ({ page }) => {
    await gotoHome(page, "/");
    await expect(eventCards(page).first()).toBeVisible();
    const initialSlugs = await visibleSlugs(page);

    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const dialog = page.getByRole("dialog", { name: "絞り込み" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("group", { name: "競技" }).getByRole("checkbox", { name: "駅伝" }).check();
    await dialog.getByRole("group", { name: "視聴方法" }).getByRole("checkbox", { name: "地上波" }).check();
    // 「適用」までは一覧も URL も変わらない
    await expect(page).not.toHaveURL(/category=/);
    expect(await visibleSlugs(page)).toEqual(initialSlugs);

    await dialog.getByRole("button", { name: "適用" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/category=ekiden/);
    await expect(page).toHaveURL(/medium=terrestrial/);
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-prefecture-ekiden"]);

    // 適用中の条件を表示し、個別に外せる
    const active = page.getByRole("list", { name: "適用中の絞り込み条件" });
    await expect(active.getByRole("link")).toHaveText(["駅伝", "地上波"]);
    await expect(page.getByRole("button", { name: /^絞り込み\s*（2件適用中）$/ })).toBeVisible();

    // URL を直接開いても同じ結果（フィルタ状態を URL に保持）
    await gotoHome(page, "/?category=ekiden&medium=terrestrial");
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden", "demo-prefecture-ekiden"]);
    await page.getByRole("link", { name: "「地上波」の条件を外す" }).click();
    await expect(page).not.toHaveURL(/medium=/);
    await expect(page).toHaveURL(/category=ekiden/);
    await expect(page.getByRole("list", { name: "適用中の絞り込み条件" }).getByRole("link")).toHaveText(["駅伝"]);
  });

  test("「キャンセル」と Esc では変更を破棄し、絞り込みボタンにフォーカスが戻る", async ({ page }) => {
    await gotoHome(page, "/");
    await expect(eventCards(page).first()).toBeVisible();
    const trigger = page.getByRole("button", { name: /^絞り込み/ });
    const dialog = page.getByRole("dialog", { name: "絞り込み" });

    await trigger.click();
    await dialog.getByRole("checkbox", { name: "トラック" }).check();
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).not.toHaveURL(/category=/);

    // キーボードだけで開き、Esc で閉じる
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "トラック" })).not.toBeChecked(); // 前回の変更は破棄済み
    await expect(dialog.locator(":focus")).toHaveCount(1); // フォーカスはダイアログ内
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).not.toHaveURL(/category=|medium=|free=/);
  });

  test("無料ネット配信ありで絞り込める（有料・料金不明・過去の参考情報は含めない）", async ({ page }) => {
    await gotoHome(page, "/");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const dialog = page.getByRole("dialog", { name: "絞り込み" });
    await dialog.getByRole("checkbox", { name: "無料ネット配信あり" }).check();
    await dialog.getByRole("button", { name: "適用" }).click();
    await expect(page).toHaveURL(/free=1/);
    await expect
      .poll(() => visibleSlugs(page))
      .toEqual(["demo-track-night", "demo-seaside-marathon", "demo-championships"]);
  });

  test("大会名で検索でき、該当なしの表示がある", async ({ page }) => {
    await gotoHome(page, "/");
    await page.getByLabel("大会名で検索").fill("湾岸");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page).toHaveURL(/q=/);
    await expect.poll(() => visibleSlugs(page)).toEqual(["demo-bay-ekiden"]);

    await gotoHome(page, "/?q=" + encodeURIComponent("存在しない大会名"));
    await expect(page.getByText("条件に合う大会はありません")).toBeVisible();
    await expect(eventCards(page)).toHaveCount(0);
  });
});
