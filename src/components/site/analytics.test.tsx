import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({
  default: ({ id, src, children }: { id?: string; src?: string; children?: string }) => (
    <script data-testid={id} data-src={src}>
      {children}
    </script>
  ),
}));

import { GA_MEASUREMENT_ID, GoogleAnalytics, isAnalyticsEnabled } from "./analytics";
import { SiteFooter } from "./site-footer";

describe("isAnalyticsEnabled", () => {
  it("本番ビルドのときだけ有効", () => {
    expect(isAnalyticsEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(isAnalyticsEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isAnalyticsEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(isAnalyticsEnabled({})).toBe(false);
  });

  it("NEXT_PUBLIC_DISABLE_ANALYTICS=1 なら本番ビルドでも無効", () => {
    expect(isAnalyticsEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DISABLE_ANALYTICS: "1" })).toBe(false);
  });
});

describe("GoogleAnalytics", () => {
  it("有効なときは指定の測定 ID で gtag.js を読み込み、初期化する", () => {
    expect(GA_MEASUREMENT_ID).toBe("G-72DVD655JY");
    render(<GoogleAnalytics enabled />);
    expect(screen.getByTestId("ga-gtag")).toHaveAttribute(
      "data-src",
      "https://www.googletagmanager.com/gtag/js?id=G-72DVD655JY",
    );
    expect(screen.getByTestId("ga-init").textContent).toContain("gtag('config','G-72DVD655JY')");
  });

  it("無効なとき（テスト環境の既定）は何も出力しない", () => {
    const { container } = render(<GoogleAnalytics />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SiteFooter のアクセス解析の告知", () => {
  it("計測するときだけ、Google アナリティクスの利用と Google のポリシーへのリンクを表示する", () => {
    const { unmount } = render(<SiteFooter analytics />);
    const notice = screen.getByTestId("analytics-notice");
    expect(notice).toHaveTextContent("Google アナリティクスを使っています");
    const link = screen.getByRole("link", { name: /Google のポリシー/ });
    expect(link).toHaveAttribute("href", "https://policies.google.com/technologies/partner-sites?hl=ja");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    unmount();

    render(<SiteFooter />);
    expect(screen.queryByTestId("analytics-notice")).not.toBeInTheDocument();
  });
});
