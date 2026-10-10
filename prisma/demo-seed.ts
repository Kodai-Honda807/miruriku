/**
 * 架空のデモデータ。実在の大会・放送局・配信サービスとは関係ありません。
 *
 * - 日付は基準日（既定は日本時間の今日）からの相対日付で作るため、
 *   いつ seed しても「今日／今週」の表示を確認できる
 * - ID を固定して upsert するため、再実行しても重複しない
 * - デモ大会（isDemo=true）は毎回この定義の状態に戻す。デモ以外のデータには触れない
 * - URL は IANA 予約ドメイン（example.com / example.org）のみを使い、
 *   実在するように見える視聴 URL は作らない
 */
import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { JST, addDaysToLocalDate, jstDateOf, localDateToDbDate, zonedToUtc, type LocalDate } from "../src/domain/datetime";

type SlotDef = Omit<Prisma.BroadcastSlotUncheckedCreateInput, "eventId" | "id"> & { key: string };
type SessionDef = Omit<Prisma.EventSessionUncheckedCreateInput, "eventId" | "id"> & { key: string };
type SourceDef = Omit<Prisma.SourceUncheckedCreateInput, "eventId" | "id"> & { key: string };

type EventDef = {
  slug: string;
  seriesName: string;
  data: Omit<Prisma.EventUncheckedCreateInput, "id" | "slug" | "seriesId" | "isDemo" | "seasonYear">;
  sessions?: SessionDef[];
  slots?: SlotDef[];
  sources?: SourceDef[];
};

const DEMO_URL = "https://example.com/miruriku-demo";
const DEMO_OFFICIAL_URL = "https://example.org/miruriku-demo";

/** 収集デモ（固定ファイル）で使う情報源 URL。fixtures/collector と対応 */
export const DEMO_COLLECT_SOURCE_URL = `${DEMO_URL}/city-marathon/broadcast`;

export function buildDemoEvents(baseDate: LocalDate): EventDef[] {
  const d = (n: number) => addDaysToLocalDate(baseDate, n);
  const date = (n: number) => localDateToDbDate(d(n));
  const at = (n: number, time: string, tz = JST) => zonedToUtc(d(n), time, tz);
  const checked = at(-2, "10:00");

  return [
    // 1. 地上波のみ（今日）
    {
      slug: "demo-bay-ekiden",
      seriesName: "みる陸デモ湾岸駅伝",
      data: {
        name: "みる陸デモ湾岸駅伝",
        editionLabel: "第5回",
        category: "EKIDEN",
        status: "PUBLISHED",
        description: "架空の湾岸コースを走る 6 区間の駅伝（デモデータ）。",
        venueName: "デモ湾岸公園 発着（架空）",
        venueRegion: "東京都（架空のコース）",
        startDate: date(0),
        endDate: date(0),
        startAt: at(0, "08:00"),
        officialUrl: `${DEMO_OFFICIAL_URL}/bay-ekiden`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      slots: [
        {
          key: "tv",
          medium: "TERRESTRIAL",
          providerName: "デモテレビ系列（架空）",
          airDate: date(0),
          startAt: at(0, "07:50"),
          endAt: at(0, "14:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          infoUrl: `${DEMO_URL}/info/bay-ekiden`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
        },
      ],
      sources: [
        { key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/bay-ekiden`, title: "大会公式（デモ）" },
        { key: "info", kind: "BROADCAST_INFO", url: `${DEMO_URL}/info/bay-ekiden`, title: "放送案内（デモ）" },
      ],
    },

    // 2. YouTube 無料ライブ（今日・夜）
    {
      slug: "demo-track-night",
      seriesName: "みる陸デモ トラックナイト記録会",
      data: {
        name: "みる陸デモ トラックナイト記録会",
        category: "TRACK",
        status: "PUBLISHED",
        description: "中長距離種目の記録会（デモデータ）。",
        venueName: "デモ市陸上競技場（架空）",
        venueRegion: "神奈川県（架空）",
        startDate: date(0),
        endDate: date(0),
        startAt: at(0, "18:00"),
        officialUrl: `${DEMO_OFFICIAL_URL}/track-night`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      slots: [
        {
          key: "youtube",
          medium: "INTERNET",
          providerName: "YouTube（主催者のデモチャンネル・架空）",
          airDate: date(0),
          startAt: at(0, "17:55"),
          endAt: at(0, "21:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          watchUrl: `${DEMO_URL}/watch/track-night`,
          infoUrl: `${DEMO_URL}/info/track-night`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
        },
      ],
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/track-night` }],
    },

    // 3. 放送・配信情報が未確認（収集デモの対象）
    {
      slug: "demo-city-marathon",
      seriesName: "みる陸デモ市民マラソン",
      data: {
        name: "みる陸デモ市民マラソン",
        editionLabel: "第12回",
        category: "MARATHON",
        status: "PUBLISHED",
        description: "市街地を周回する市民マラソン（デモデータ）。",
        venueName: "デモ市役所前 発着（架空）",
        venueRegion: "埼玉県（架空）",
        startDate: date(1),
        endDate: date(1),
        startAt: at(1, "09:00"),
        officialUrl: `${DEMO_OFFICIAL_URL}/city-marathon`,
        broadcastInfoStatus: "UNVERIFIED",
      },
      sources: [
        { key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/city-marathon`, title: "大会公式（デモ）" },
        {
          key: "broadcast",
          kind: "BROADCAST_INFO",
          url: DEMO_COLLECT_SOURCE_URL,
          title: "テレビ・配信のお知らせ（デモ）",
          collectEnabled: true,
          note: "収集 CLI のデモ対象。--fetch fixture で fixtures/collector の固定ファイルを読み込みます。",
        },
      ],
    },

    // 4. 地上波とネットの併用 + 複数枠 + 下書きの枠
    {
      slug: "demo-seaside-marathon",
      seriesName: "みる陸デモ海浜マラソン",
      data: {
        name: "みる陸デモ海浜マラソン",
        editionLabel: "第30回",
        category: "MARATHON",
        status: "PUBLISHED",
        description: "海沿いの平坦なコースで行うエリートマラソン（デモデータ）。",
        venueName: "デモ海浜スタジアム 発着（架空）",
        venueRegion: "千葉県（架空）",
        startDate: date(2),
        endDate: date(2),
        startAt: at(2, "09:10"),
        officialUrl: `${DEMO_OFFICIAL_URL}/seaside-marathon`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      slots: [
        {
          key: "tv",
          medium: "TERRESTRIAL",
          providerName: "デモ放送（架空）",
          airDate: date(2),
          startAt: at(2, "09:00"),
          endAt: at(2, "12:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          infoUrl: `${DEMO_URL}/info/seaside-marathon`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 0,
        },
        {
          key: "net-live",
          medium: "INTERNET",
          providerName: "デモ配信プラス（架空）",
          airDate: date(2),
          startAt: at(2, "09:00"),
          endAt: at(2, "12:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          note: "地上波と同時配信",
          watchUrl: `${DEMO_URL}/watch/seaside-marathon`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 1,
        },
        {
          key: "net-vod",
          medium: "INTERNET",
          providerName: "デモ配信プラス（架空）",
          airDate: date(2),
          cost: "FREE",
          viewingType: "ON_DEMAND",
          region: "NATIONWIDE",
          note: "レース終了後から 7 日間の見逃し配信（開始時刻は未定）",
          watchUrl: `${DEMO_URL}/watch/seaside-marathon-replay`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 2,
        },
        {
          key: "draft",
          medium: "CS",
          providerName: "下書きの放送枠（非公開・デモ）",
          cost: "PAID",
          viewingType: "DELAYED",
          region: "NATIONWIDE",
          verificationStatus: "UNVERIFIED",
          status: "DRAFT",
          sortOrder: 3,
        },
      ],
      sources: [
        { key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/seaside-marathon` },
        { key: "info", kind: "BROADCAST_INFO", url: `${DEMO_URL}/info/seaside-marathon`, title: "中継のお知らせ（デモ）" },
      ],
    },

    // 5. 公式に放送・配信なしと案内
    {
      slug: "demo-record-challenge",
      seriesName: "みる陸デモ記録挑戦会",
      data: {
        name: "みる陸デモ記録挑戦会",
        category: "TRACK",
        status: "PUBLISHED",
        description: "少人数で行う記録挑戦の競技会（デモデータ）。",
        venueName: "デモ大学グラウンド（架空）",
        venueRegion: "東京都（架空）",
        startDate: date(2),
        endDate: date(2),
        startAt: at(2, "13:00"),
        officialUrl: `${DEMO_OFFICIAL_URL}/record-challenge`,
        broadcastInfoStatus: "NO_BROADCAST",
        broadcastNote: "主催者から「テレビ放送・ネット配信の予定はありません」と案内されています（デモ）。",
        broadcastCheckedAt: at(-3, "15:00"),
      },
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/record-challenge` }],
    },

    // 6. 開始時刻が不明 + 未発表であることを確認済み
    {
      slug: "demo-corporate-road",
      seriesName: "みる陸デモ実業団ロード選手権",
      data: {
        name: "みる陸デモ実業団ロード選手権",
        category: "MARATHON",
        status: "PUBLISHED",
        description: "ハーフマラソンの選手権（デモデータ）。スタート時刻は未発表。",
        venueName: "デモ運動公園 発着（架空）",
        venueRegion: "静岡県（架空）",
        startDate: date(3),
        endDate: date(3),
        startAt: null,
        officialUrl: `${DEMO_OFFICIAL_URL}/corporate-road`,
        broadcastInfoStatus: "NOT_ANNOUNCED",
        broadcastNote: "主催者サイトで「放送・配信は決まり次第お知らせします」と案内されています（デモ）。",
        broadcastCheckedAt: at(-1, "18:30"),
      },
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/corporate-road` }],
    },

    // 7. BS のみ
    {
      slug: "demo-highland-womens-ekiden",
      seriesName: "みる陸デモ高原女子駅伝",
      data: {
        name: "みる陸デモ高原女子駅伝",
        editionLabel: "第8回",
        category: "EKIDEN",
        status: "PUBLISHED",
        venueName: "デモ高原リゾート 発着（架空）",
        venueRegion: "長野県（架空）",
        startDate: date(4),
        endDate: date(4),
        startAt: at(4, "12:15"),
        officialUrl: `${DEMO_OFFICIAL_URL}/highland-womens-ekiden`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      slots: [
        {
          key: "bs",
          medium: "BS",
          providerName: "BSデモ（架空）",
          airDate: date(4),
          startAt: at(4, "12:00"),
          endAt: at(4, "14:30"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          infoUrl: `${DEMO_URL}/info/highland-womens-ekiden`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
        },
      ],
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/highland-womens-ekiden` }],
    },

    // 8. 地域限定の地上波
    {
      slug: "demo-prefecture-ekiden",
      seriesName: "みる陸デモ県縦断駅伝",
      data: {
        name: "みる陸デモ県縦断駅伝",
        editionLabel: "第60回",
        category: "EKIDEN",
        status: "PUBLISHED",
        venueName: "デモ県庁前 発着（架空）",
        venueRegion: "デモ県（架空）",
        startDate: date(5),
        endDate: date(5),
        startAt: at(5, "08:30"),
        officialUrl: `${DEMO_OFFICIAL_URL}/prefecture-ekiden`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      slots: [
        {
          key: "local-tv",
          medium: "TERRESTRIAL",
          providerName: "デモ地方テレビ（架空）",
          airDate: date(5),
          startAt: at(5, "08:15"),
          endAt: at(5, "13:30"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "REGIONAL",
          regionNote: "デモ県内のみ放送",
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
        },
      ],
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/prefecture-ekiden` }],
    },

    // 9. 有料ネット配信
    {
      slug: "demo-10000m-night",
      seriesName: "みる陸デモ 10000m ナイト",
      data: {
        name: "みる陸デモ 10000m ナイト",
        category: "TRACK",
        status: "PUBLISHED",
        venueName: "デモ総合運動場（架空）",
        venueRegion: "大阪府（架空）",
        startDate: date(6),
        endDate: date(6),
        startAt: at(6, "19:00"),
        officialUrl: `${DEMO_OFFICIAL_URL}/10000m-night`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      slots: [
        {
          key: "paid-net",
          medium: "INTERNET",
          providerName: "デモスポーツ配信（架空・有料）",
          airDate: date(6),
          startAt: at(6, "18:45"),
          endAt: at(6, "21:30"),
          cost: "PAID",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          note: "視聴には有料プランへの加入が必要（デモ）",
          watchUrl: `${DEMO_URL}/watch/10000m-night`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
        },
      ],
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/10000m-night` }],
    },

    // 10. 海外開催で日本時間の日付が変わる + 未確認の枠を含む
    {
      slug: "demo-europe-grand-prix",
      seriesName: "みる陸デモ国際グランプリ",
      data: {
        name: "みる陸デモ国際グランプリ ヨーロッパ大会",
        category: "TRACK",
        status: "PUBLISHED",
        description: "ヨーロッパで行われる国際グランプリ（架空の大会・デモデータ）。",
        venueName: "デモ・スタジアム（架空）",
        venueRegion: "スイス・チューリッヒ（架空の大会）",
        countryCode: "CH",
        timezone: "Europe/Zurich",
        startDate: date(7),
        endDate: date(7),
        startAt: at(7, "20:00", "Europe/Zurich"),
        officialUrl: `${DEMO_OFFICIAL_URL}/europe-grand-prix`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      slots: [
        {
          key: "cs-delayed",
          medium: "CS",
          providerName: "デモスポーツCS（架空）",
          airDate: date(8),
          startAt: at(8, "21:00"),
          endAt: at(8, "23:00"),
          cost: "PAID",
          viewingType: "DELAYED",
          region: "NATIONWIDE",
          infoUrl: `${DEMO_URL}/info/europe-grand-prix`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 0,
        },
        {
          key: "intl-stream",
          medium: "INTERNET",
          providerName: "デモ国際陸上ストリーム（架空）",
          startAt: at(7, "19:55", "Europe/Zurich"),
          cost: "UNKNOWN",
          viewingType: "LIVE",
          region: "JAPAN_UNKNOWN",
          note: "主催者による国際配信。日本からの視聴可否は確認できていません（デモ）。",
          verificationStatus: "UNVERIFIED",
          status: "PUBLISHED",
          sortOrder: 1,
        },
      ],
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/europe-grand-prix` }],
    },

    // 11. 複数日開催 + 複数の放送・配信枠 + セッション別日時
    {
      slug: "demo-championships",
      seriesName: "みる陸デモ陸上競技選手権",
      data: {
        name: "みる陸デモ陸上競技選手権",
        editionLabel: "第110回",
        category: "TRACK",
        status: "PUBLISHED",
        description: "3 日間にわたるトラック・フィールドの選手権（デモデータ）。",
        venueName: "デモ国立競技場（架空）",
        venueRegion: "東京都（架空）",
        startDate: date(10),
        endDate: date(12),
        startAt: at(10, "10:00"),
        officialUrl: `${DEMO_OFFICIAL_URL}/championships`,
        broadcastInfoStatus: "CONFIRMED",
        broadcastCheckedAt: checked,
      },
      sessions: [
        { key: "day1", name: "1日目（予選・男女10000m決勝）", date: date(10), startAt: at(10, "10:00"), sortOrder: 0 },
        { key: "day2", name: "2日目（男女100m決勝 ほか）", date: date(11), startAt: at(11, "10:00"), sortOrder: 1 },
        {
          key: "day3",
          name: "3日目（男女1500m決勝 ほか）",
          date: date(12),
          startAt: null,
          note: "競技開始時刻は未発表",
          sortOrder: 2,
        },
      ],
      slots: [
        {
          key: "net-all",
          medium: "INTERNET",
          providerName: "デモ陸連公式ライブ（架空）",
          airDate: date(10),
          startAt: at(10, "09:50"),
          endAt: at(10, "18:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          note: "1日目の全種目をライブ配信",
          watchUrl: `${DEMO_URL}/watch/championships-day1`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 0,
        },
        {
          key: "bs-day2",
          medium: "BS",
          providerName: "BSデモ（架空）",
          airDate: date(11),
          startAt: at(11, "15:00"),
          endAt: at(11, "17:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 1,
        },
        {
          key: "tv-day3",
          medium: "TERRESTRIAL",
          providerName: "デモ公共放送 総合（架空）",
          airDate: date(12),
          startAt: at(12, "14:00"),
          endAt: at(12, "16:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          infoUrl: `${DEMO_URL}/info/championships`,
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 2,
        },
        {
          key: "tv-highlight",
          medium: "TERRESTRIAL",
          providerName: "デモ公共放送 総合（架空）",
          airDate: date(12),
          startAt: at(12, "23:00"),
          endAt: at(12, "23:45"),
          cost: "FREE",
          viewingType: "DELAYED",
          region: "NATIONWIDE",
          note: "3日間のハイライト（録画）",
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
          verifiedAt: checked,
          sortOrder: 3,
        },
      ],
      sources: [
        { key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/championships`, title: "大会公式（デモ）" },
        { key: "info", kind: "BROADCAST_INFO", url: `${DEMO_URL}/info/championships`, title: "放送予定（デモ）" },
      ],
    },

    // 12. 過去大会の参考情報のみ
    {
      slug: "demo-lakeside-marathon",
      seriesName: "みる陸デモ湖畔マラソン",
      data: {
        name: "みる陸デモ湖畔マラソン",
        category: "MARATHON",
        status: "PUBLISHED",
        venueName: "デモ湖畔公園 発着（架空）",
        venueRegion: "滋賀県（架空）",
        startDate: date(20),
        endDate: date(20),
        startAt: at(20, "09:00"),
        officialUrl: `${DEMO_OFFICIAL_URL}/lakeside-marathon`,
        broadcastInfoStatus: "PAST_REFERENCE",
        broadcastNote: "今年の放送・配信は未発表です。下記は昨年大会の参考情報です（デモ）。",
        broadcastCheckedAt: at(-5, "11:00"),
      },
      slots: [
        {
          key: "last-year",
          medium: "TERRESTRIAL",
          providerName: "デモテレビ系列（架空）",
          cost: "FREE",
          viewingType: "DELAYED",
          region: "NATIONWIDE",
          note: "昨年大会は当日夕方に録画放送（参考）",
          verificationStatus: "PAST_REFERENCE",
          status: "PUBLISHED",
        },
      ],
      sources: [{ key: "official", kind: "OFFICIAL_SITE", url: `${DEMO_OFFICIAL_URL}/lakeside-marathon` }],
    },

    // 13. 下書き（公開ページに出てはいけない）
    {
      slug: "demo-draft-ekiden",
      seriesName: "みる陸デモ下書き駅伝",
      data: {
        name: "みる陸デモ下書き駅伝（非公開）",
        category: "EKIDEN",
        status: "DRAFT",
        description: "下書き状態のデモ大会。公開ページには表示されません。",
        venueName: "未定",
        startDate: date(1),
        endDate: date(1),
        startAt: at(1, "10:00"),
        broadcastInfoStatus: "CONFIRMED",
      },
      slots: [
        {
          key: "tv",
          medium: "TERRESTRIAL",
          providerName: "下書き大会の放送局（デモ）",
          airDate: date(1),
          startAt: at(1, "10:00"),
          cost: "FREE",
          viewingType: "LIVE",
          region: "NATIONWIDE",
          verificationStatus: "CONFIRMED",
          status: "PUBLISHED",
        },
      ],
    },

    // 14. 終了済み（「この先」には出ない）
    {
      slug: "demo-autumn-relay",
      seriesName: "みる陸デモ秋季リレーマラソン",
      data: {
        name: "みる陸デモ秋季リレーマラソン（終了）",
        category: "MARATHON",
        status: "PUBLISHED",
        venueName: "デモ河川敷（架空）",
        venueRegion: "東京都（架空）",
        startDate: date(-3),
        endDate: date(-3),
        startAt: at(-3, "09:00"),
        broadcastInfoStatus: "NO_BROADCAST",
        broadcastNote: "主催者から放送・配信なしと案内されていました（デモ）。",
        broadcastCheckedAt: at(-6, "12:00"),
      },
    },
  ];
}

/**
 * 再 seed で管理画面の編集や承認の結果を確実に初期化するため、定義に書かれていない項目も既定値で上書きする。
 */
const EVENT_RESET_DEFAULTS = {
  editionLabel: null,
  description: null,
  venueName: null,
  venueRegion: null,
  countryCode: "JP",
  timezone: JST,
  startAt: null,
  officialUrl: null,
  broadcastInfoStatus: "UNVERIFIED",
  broadcastNote: null,
  broadcastCheckedAt: null,
} satisfies Partial<Prisma.EventUncheckedCreateInput>;

function childId(slug: string, kind: string, key: string): string {
  return `seed-${slug}-${kind}-${key}`;
}

export async function seedDemoData(prisma: PrismaClient, opts: { baseDate?: LocalDate } = {}) {
  const baseDate = opts.baseDate ?? jstDateOf(new Date());
  const defs = buildDemoEvents(baseDate);

  for (const def of defs) {
    const seriesSlug = `${def.slug}-series`;
    const series = await prisma.eventSeries.upsert({
      where: { slug: seriesSlug },
      create: { slug: seriesSlug, name: def.seriesName, isDemo: true },
      update: { name: def.seriesName, isDemo: true, description: null, officialUrl: null },
    });

    const seasonYear = Number(String((def.data.startDate as Date).toISOString()).slice(0, 4));
    const eventData = { ...EVENT_RESET_DEFAULTS, ...def.data, seriesId: series.id, isDemo: true, seasonYear };

    await prisma.$transaction(async (tx) => {
      const event = await tx.event.upsert({
        where: { slug: def.slug },
        create: { slug: def.slug, ...eventData },
        update: eventData,
      });

      // デモ大会の子レコードは定義どおりに作り直す（承認で作られた枠や候補も含めて初期化）
      await tx.broadcastSlot.deleteMany({ where: { eventId: event.id } });
      await tx.extractionCandidate.deleteMany({ where: { eventId: event.id } });
      await tx.eventSession.deleteMany({ where: { eventId: event.id } });

      const sourceIds = new Map<string, string>();
      const keepSourceIds: string[] = [];
      for (const { key, ...source } of def.sources ?? []) {
        const id = childId(def.slug, "source", key);
        const data = { title: null, note: null, collectEnabled: false, lastFetchedAt: null, ...source };
        await tx.source.upsert({
          where: { id },
          create: { id, eventId: event.id, ...data },
          update: data,
        });
        sourceIds.set(key, id);
        keepSourceIds.push(id);
      }
      // 収集実行履歴は情報源に紐づくため、定義外の情報源と一緒に削除される
      await tx.source.deleteMany({ where: { eventId: event.id, id: { notIn: keepSourceIds } } });
      await tx.collectionRun.deleteMany({ where: { sourceId: { in: keepSourceIds } } });

      for (const { key, ...session } of def.sessions ?? []) {
        await tx.eventSession.create({ data: { id: childId(def.slug, "session", key), eventId: event.id, ...session } });
      }

      const firstSourceId = sourceIds.get("info") ?? sourceIds.get("official") ?? null;
      for (const { key, ...slot } of def.slots ?? []) {
        await tx.broadcastSlot.create({
          data: {
            id: childId(def.slug, "slot", key),
            eventId: event.id,
            sourceId: slot.verificationStatus === "CONFIRMED" ? firstSourceId : null,
            ...slot,
          },
        });
      }
    });
  }

  return { baseDate, eventCount: defs.length };
}
