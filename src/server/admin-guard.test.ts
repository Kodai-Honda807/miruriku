import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminDisabledError, assertAdminEnabled, isAdminEnabled } from "./admin-guard";

describe("isAdminEnabled / assertAdminEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["development", "test", undefined])('NODE_ENV=%s で MIRURIKU_ADMIN_ENABLED="true" のときだけ有効', (nodeEnv) => {
    expect(isAdminEnabled({ NODE_ENV: nodeEnv, MIRURIKU_ADMIN_ENABLED: "true" })).toBe(true);
    expect(() => assertAdminEnabled({ NODE_ENV: nodeEnv, MIRURIKU_ADMIN_ENABLED: "true" })).not.toThrow();
  });

  it('NODE_ENV=production では "true" でも無効', () => {
    expect(isAdminEnabled({ NODE_ENV: "production", MIRURIKU_ADMIN_ENABLED: "true" })).toBe(false);
    expect(() => assertAdminEnabled({ NODE_ENV: "production", MIRURIKU_ADMIN_ENABLED: "true" })).toThrow(AdminDisabledError);
  });

  it.each([undefined, "", "false", "TRUE", "True", "1", "yes", " true", "true "])(
    "MIRURIKU_ADMIN_ENABLED=%j は無効",
    (value) => {
      for (const nodeEnv of ["development", "test"]) {
        const env = { NODE_ENV: nodeEnv, MIRURIKU_ADMIN_ENABLED: value };
        expect(isAdminEnabled(env)).toBe(false);
        expect(() => assertAdminEnabled(env)).toThrow(AdminDisabledError);
      }
    },
  );

  it("AdminDisabledError は Error のサブクラスで名前を持つ", () => {
    try {
      assertAdminEnabled({ NODE_ENV: "development" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AdminDisabledError);
      expect((error as Error).name).toBe("AdminDisabledError");
    }
  });

  it("引数を省略すると process.env を参照する", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "true");
    expect(isAdminEnabled()).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(isAdminEnabled()).toBe(false);
    expect(() => assertAdminEnabled()).toThrow(AdminDisabledError);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "false");
    expect(isAdminEnabled()).toBe(false);
  });
});
