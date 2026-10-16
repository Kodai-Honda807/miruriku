import { expect, type Locator, type Page } from "@playwright/test";

export function eventCards(page: Page): Locator {
  return page.getByTestId("event-card");
}

export function eventCard(page: Page, slug: string): Locator {
  return page.locator(`[data-testid="event-card"][data-event-slug="${slug}"]`);
}

/** 表示中のカードの slug を上から順に返す */
export async function visibleSlugs(page: Page): Promise<string[]> {
  return eventCards(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-event-slug") ?? ""));
}

/**
 * トップページを開き、ブラウザでの絞り込みが使えるようになるまで待つ
 * （静的配信のため、URL の条件はページの JavaScript が読み込まれてから反映される）
 */
export async function gotoHome(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await expect(page.locator('[data-filters-ready="true"]')).toBeAttached();
}
