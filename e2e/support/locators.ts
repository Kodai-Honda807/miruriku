import type { Locator, Page } from "@playwright/test";

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
