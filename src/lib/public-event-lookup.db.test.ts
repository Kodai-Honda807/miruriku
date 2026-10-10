import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/demo-seed";
import { createTestPrisma, resetDatabase } from "../../test/db";
import { isPublishedEventSlug } from "./public-event-lookup";

const prisma = createTestPrisma();

beforeAll(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma, { baseDate: "2026-10-10" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("isPublishedEventSlug", () => {
  it("公開中の大会は true", async () => {
    expect(await isPublishedEventSlug(prisma, "demo-city-marathon")).toBe(true);
  });

  it("下書き・存在しない・形式外の slug は false", async () => {
    expect(await isPublishedEventSlug(prisma, "demo-draft-ekiden")).toBe(false);
    expect(await isPublishedEventSlug(prisma, "no-such-event")).toBe(false);
    expect(await isPublishedEventSlug(prisma, "Demo City")).toBe(false);
  });
});
