import { expect, test, type Page } from "@playwright/test";

import { eventCard, eventCards } from "../support/locators";

const WIDTHS = [360, 390, 430] as const;

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

for (const width of WIDTHS) {
  test.describe(`スマートフォン幅 ${width}px`, () => {
    test.use({ viewport: { width, height: 780 } });

    test("一覧の放送先が読め、横スクロールが発生せず、フィルタが初期画面を占有しない", async ({ page }) => {
      await page.goto("/");
      const card = eventCard(page, "demo-bay-ekiden");
      await expect(card).toBeVisible();
      await expect(card).toContainText("デモテレビ系列（架空）");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      // 絞り込みフォームは画面の高さの半分未満で、最初の大会カードの見出しが初期画面に入る
      const form = await page.getByRole("search", { name: "大会の絞り込み" }).boundingBox();
      expect(form!.height).toBeLessThan(780 / 2);
      const firstHeading = await eventCards(page).first().getByRole("heading").first().boundingBox();
      expect(firstHeading!.y + firstHeading!.height).toBeLessThanOrEqual(780);
    });

    test("長い大会名・局名でも崩れない", async ({ page }) => {
      await page.goto("/");
      await expect(eventCards(page).first()).toBeVisible();
      // 実データにない長さ（空白なしの長い英数字を含む）を入れて、折り返しを確かめる
      await page.evaluate(() => {
        const card = document.querySelector('[data-testid="event-card"]')!;
        card.querySelector("h3")!.textContent =
          "第103回東京箱根間往復大学駅伝競走予選会・兼・全日本学生陸上競技選手権大会ロードレースの部ExtraordinarilyLongEnglishEventNameWithoutSpaces2026";
        const provider = card.querySelector('[data-testid="broadcast-slot"] [id$="-provider"], [data-testid="broadcast-slot"] .font-semibold');
        if (provider) provider.textContent = "日本テレビ（関東エリア）ほか系列各局・BS日テレ・日テレジータスVeryLongProviderNameWithoutSpaces";
      });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      const card = await eventCards(page).first().boundingBox();
      expect(card!.x + card!.width).toBeLessThanOrEqual(width + 1);
    });

    test("絞り込みダイアログは画面内に収まり、内容をスクロールして適用・キャンセルできる", async ({ page }) => {
      await page.setViewportSize({ width, height: 560 });
      await page.goto("/");
      await expect(eventCards(page).first()).toBeVisible();
      const trigger = page.getByRole("button", { name: /^絞り込み/ });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "絞り込み" });
      await expect(dialog).toBeVisible();

      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(560);
      // 「適用」「キャンセル」は常に見えている（内容だけがスクロールする）
      await expect(dialog.getByRole("button", { name: "適用" })).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeInViewport();
      const body = dialog.getByTestId("filter-dialog-body");
      expect(await body.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
      // 背後のページはスクロールしない
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");

      await dialog.getByRole("checkbox", { name: "無料ネット配信あり" }).scrollIntoViewIfNeeded();
      await dialog.getByRole("checkbox", { name: "無料ネット配信あり" }).check();
      await dialog.getByRole("button", { name: "キャンセル" }).click();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page).not.toHaveURL(/free=1/);

      await trigger.click();
      await dialog.getByRole("checkbox", { name: "マラソン" }).check();
      await dialog.getByRole("button", { name: "適用" }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/category=marathon/);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });

    test("放送・配信カード全体をタップでき、外部ページを新しいタブで開く", async ({ page }) => {
      await page.goto("/");
      const link = eventCard(page, "demo-track-night").getByRole("link", { name: /視聴ページへ/ });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      const box = (await link.boundingBox())!;
      // カード全体（局名から条件まで）がタップ領域になっている
      expect(box.height).toBeGreaterThan(80);
      expect(box.width).toBeGreaterThan(width * 0.7);
    });
  });
}
