import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseAndNormalizeExtraction } from "@/domain/candidate";
import { computeCandidateDiff, type CurrentEventState } from "@/domain/diff";

import { CandidateDiffView } from "./candidate-diff";

const CURRENT: CurrentEventState = {
  timezone: "Asia/Tokyo",
  startDate: "2026-10-11",
  endDate: "2026-10-11",
  startAt: new Date("2026-10-11T00:00:00.000Z"),
  venueName: "デモ会場",
  broadcastInfoStatus: "UNVERIFIED",
  slots: [
    {
      id: "slot-existing",
      medium: "BS",
      providerName: "BSデモ",
      airDate: "2026-10-11",
      startAt: new Date("2026-10-11T03:00:00.000Z"),
      endAt: null,
      cost: "FREE",
      viewingType: "LIVE",
      region: "NATIONWIDE",
      regionNote: null,
      note: null,
      watchUrl: null,
      infoUrl: null,
      status: "PUBLISHED",
      verificationStatus: "CONFIRMED",
    },
    {
      id: "slot-untouched",
      medium: "RADIO",
      providerName: "デモラジオ",
      airDate: null,
      startAt: null,
      endAt: null,
      cost: "UNKNOWN",
      viewingType: "UNKNOWN",
      region: "UNKNOWN",
      regionNote: null,
      note: null,
      watchUrl: null,
      infoUrl: null,
      status: "DRAFT",
      verificationStatus: "UNVERIFIED",
    },
  ],
};

const MALICIOUS = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function setup() {
  const parsed = parseAndNormalizeExtraction(
    {
      broadcastStatus: "CONFIRMED",
      event: { startDate: "2026-10-11", startTime: "09:30", venueName: "新しい会場" },
      broadcasts: [
        {
          medium: "TERRESTRIAL",
          providerName: "デモテレビ",
          date: "2026-10-11",
          startTime: "09:00",
          endTime: "12:00",
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          evidence: MALICIOUS,
          watchUrl: "https://example.com/watch",
        },
        { medium: "BS", providerName: "BSデモ", date: "2026-10-11", startTime: "12:30", cost: "FREE", viewingType: "LIVE" },
      ],
      notes: `メモ ${MALICIOUS}`,
    },
    "Asia/Tokyo",
  );
  if (!parsed.success) throw parsed.error;
  const diff = computeCandidateDiff(CURRENT, parsed.data);
  return render(<CandidateDiffView diff={diff} payload={parsed.data} eventTimezone="Asia/Tokyo" />);
}

describe("CandidateDiffView", () => {
  it("再計算した差分であることと、自動では削除しない既存枠を表示する", () => {
    setup();
    expect(screen.getByText(/差分は現在の公開データに対して再計算しています/)).toBeInTheDocument();
    const untouched = screen.getByRole("heading", { name: "候補に含まれない既存の放送枠（自動では削除しません）" });
    expect(untouched.parentElement).toHaveTextContent("デモラジオ");
  });

  it("大会の項目の変更前→変更後を日本時間・ラベルで表示する", () => {
    setup();
    const table = screen.getByRole("table", { name: "大会の項目の変更" });
    const statusRow = within(table).getByRole("row", { name: /放送情報の状態/ });
    expect(statusRow).toHaveTextContent("放送・配信情報は未確認");
    expect(statusRow).toHaveTextContent("公式発表を確認済み");
    const startRow = within(table).getByRole("row", { name: /競技開始日時/ });
    expect(startRow).toHaveTextContent("2026/10/11 09:00（日本時間）");
    expect(startRow).toHaveTextContent("2026/10/11 09:30（日本時間）");
  });

  it("追加・更新を区別し、更新は項目ごとの変更を表示する", () => {
    setup();
    expect(screen.getByText("追加")).toBeInTheDocument();
    expect(screen.getByText("更新")).toBeInTheDocument();
    const updateTable = screen.getByRole("table", { name: "BSデモ の変更" });
    expect(within(updateTable).getByRole("row", { name: /開始（日本時間）/ })).toHaveTextContent("2026/10/11 12:30");
  });

  it("根拠の引用とメモは HTML として解釈せずプレーンテキストで表示する", () => {
    const { container } = setup();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(MALICIOUS)).toBeInTheDocument();
    expect(screen.getByText(`メモ ${MALICIOUS}`)).toBeInTheDocument();
  });

  it("外部リンクは http(s) のみで、新しいタブ・noopener で開く", () => {
    setup();
    const link = screen.getByRole("link", { name: "https://example.com/watch" });
    expect(link).toHaveAttribute("href", "https://example.com/watch");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
