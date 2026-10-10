/**
 * 管理機能の有効判定（src/server/admin-guard.ts）の組み合わせ。
 * 本番モードでは MIRURIKU_ADMIN_ENABLED の値に関わらず無効であること。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminDisabledError, assertAdminEnabled, isAdminEnabled } from "@/server/admin-guard";

describe("isAdminEnabled", () => {
  it.each([
    { NODE_ENV: "production", MIRURIKU_ADMIN_ENABLED: "true", expected: false },
    { NODE_ENV: "production", MIRURIKU_ADMIN_ENABLED: undefined, expected: false },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: "true", expected: true },
    { NODE_ENV: "test", MIRURIKU_ADMIN_ENABLED: "true", expected: true },
    { NODE_ENV: undefined, MIRURIKU_ADMIN_ENABLED: "true", expected: true },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: undefined, expected: false },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: "", expected: false },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: "false", expected: false },
    { NODE_ENV: "test", MIRURIKU_ADMIN_ENABLED: "TRUE", expected: false },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: "True", expected: false },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: "1", expected: false },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: "yes", expected: false },
    { NODE_ENV: "development", MIRURIKU_ADMIN_ENABLED: " true", expected: false },
  ])("NODE_ENV=$NODE_ENV, MIRURIKU_ADMIN_ENABLED=$MIRURIKU_ADMIN_ENABLED → $expected", ({ expected, ...env }) => {
    expect(isAdminEnabled(env)).toBe(expected);
    if (expected) {
      expect(() => assertAdminEnabled(env)).not.toThrow();
    } else {
      expect(() => assertAdminEnabled(env)).toThrow(AdminDisabledError);
    }
  });

  describe("process.env を参照する既定の動作", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("本番モードでは true を指定しても無効", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "true");
      expect(isAdminEnabled()).toBe(false);
      expect(() => assertAdminEnabled()).toThrow(AdminDisabledError);
    });

    it("開発モードで true を明示した場合だけ有効", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "true");
      expect(isAdminEnabled()).toBe(true);
      vi.stubEnv("MIRURIKU_ADMIN_ENABLED", "");
      expect(isAdminEnabled()).toBe(false);
    });
  });
});
