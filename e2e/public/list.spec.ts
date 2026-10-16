import { expect, test } from "@playwright/test";

import { eventCard, eventCards, gotoHome, visibleSlugs } from "../support/locators";

// 基準日 2026-10-10（土）12:00 JST に固定（e2e/support/env.ts）

test.describe("トップページの大会一覧", () => {
  test("駅伝・マラソン・トラックが同じ時系列一覧に開催日順で並ぶ", async ({ page }) => {
    await gotoHome(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("みる陸");
    await expect(page.getByText("次のレース、いつ・どこで見られる？").first()).toBeVisible();
    await expect(eventCards(page).first()).toBeVisible();

    const slugs = await visibleSlugs(page);
    expect(slugs.slice(0, 3)).toEqual(["demo-bay-ekiden", "demo-track-night", "demo-city-marathon"]);
    // 海外大会（現地 10/17 20:00 = 日本時間 10/18 未明）は 10/16 の大会の後、10/20 の大会の前
    expect(slugs.indexOf("demo-europe-grand-prix")).toBeGreaterThan(slugs.indexOf("demo-10000m-night"));
    expect(slugs.indexOf("demo-europe-grand-prix")).toBeLessThan(slugs.indexOf("demo-championships"));

    // 3 カテゴリが混在している
    await expect(eventCard(page, "demo-bay-ekiden")).toContainText("駅伝");
    await expect(eventCard(page, "demo-city-marathon")).toContainText("マラソン");
    await expect(eventCard(page, "demo-track-night")).toContainText("トラック");

    // デモデータであることの明示
    await expect(page.getByText(/架空のデモデータ/).first()).toBeVisible();
  });

  test("下書きの大会・放送枠と終了済みの大会は表示されない", async ({ page }) => {
    await gotoHome(page, "/");
    await expect(eventCards(page).first()).toBeVisible();
    const slugs = await visibleSlugs(page);
    expect(slugs).not.toContain("demo-draft-ekiden");
    expect(slugs).not.toContain("demo-autumn-relay");
    await expect(page.getByText("みる陸デモ下書き駅伝（非公開）")).toHaveCount(0);
    await expect(page.getByText("下書きの放送枠（非公開・デモ）")).toHaveCount(0);
  });

  test("一覧のカードで放送・配信先と状態を確認できる", async ({ page }) => {
    await gotoHome(page, "/");

    const bay = eventCard(page, "demo-bay-ekiden");
    await expect(bay).toContainText("地上波");
    await expect(bay).toContainText("デモテレビ系列（架空）");
    await expect(bay).toContainText("7:50");
    await expect(bay).toContainText("無料");
    await expect(bay).toContainText("ライブ");
    await expect(bay.getByRole("link", { name: /大会公式サイト/ })).toBeVisible();
    // 放送・配信カード全体が 1 つのリンク。視聴 URL がない枠は放送案内へ（公式サイトを視聴ページとして偽装しない）
    const baySlot = bay.getByRole("link", { name: /^デモテレビ系列（架空） 放送案内へ/ });
    await expect(baySlot).toBeVisible();
    await expect(baySlot).toContainText("7:50");
    await expect(bay.getByRole("link", { name: /視聴ページ/ })).toHaveCount(0);
    // 出典・確認日時は一覧に出さず、詳細ページで確認する
    await expect(bay.getByTestId("slot-provenance")).toHaveCount(0);
    await expect(bay).not.toContainText("確認日時");

    const night = eventCard(page, "demo-track-night");
    await expect(night).toContainText("ネット配信");
    await expect(night.getByRole("link", { name: /視聴ページへ/ })).toHaveAttribute(
      "href",
      "https://example.com/miruriku-demo/watch/track-night",
    );

    // 未確認と配信なしを区別して表示
    await expect(eventCard(page, "demo-city-marathon")).toContainText("放送・配信情報は未確認");
    await expect(eventCard(page, "demo-record-challenge")).toContainText("放送・配信なし（公式案内）");

    // 開始時刻不明に仮の 0:00 を出さない
    const road = eventCard(page, "demo-corporate-road");
    await expect(road).toContainText("開始時刻未確認");
    await expect(road).not.toContainText("0:00");

    // 地域限定・有料
    await expect(eventCard(page, "demo-prefecture-ekiden")).toContainText("デモ県内のみ放送");
    await expect(eventCard(page, "demo-10000m-night")).toContainText("有料");

    // 海外大会は日本時間の日付で並び、現地日時も併記
    const europe = eventCard(page, "demo-europe-grand-prix");
    await expect(europe).toContainText("10月18日（日）");
    await expect(europe).toContainText("現地 10月17日（土）20:00");

    // 過去大会の参考情報は今年の情報と区別
    await expect(eventCard(page, "demo-lakeside-marathon")).toContainText("過去大会の参考情報");
  });
});

test.describe("JavaScript が無効な場合", () => {
  test.use({ javaScriptEnabled: false });

  test("ビルド時点の一覧（これから開催される大会）と、絞り込みに JavaScript が必要な旨を表示する", async ({ page }) => {
    await page.goto("/");
    const slugs = await visibleSlugs(page);
    expect(slugs.slice(0, 3)).toEqual(["demo-bay-ekiden", "demo-track-night", "demo-city-marathon"]);
    expect(slugs).not.toContain("demo-autumn-relay");
    await expect(page.getByText(/絞り込みには JavaScript が必要です/)).toBeVisible();
  });

  test("大会詳細は JavaScript なしでも読める", async ({ page }) => {
    await page.goto("/events/demo-championships/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("みる陸デモ陸上競技選手権");
    await expect(page.getByText("BSデモ（架空）").first()).toBeVisible();
  });
});
