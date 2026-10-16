/**
 * 実在の大会データ（人が公式情報を確認して記入する正本）。
 *
 *   pnpm data:load                 # このファイルの内容を DB に反映（デモデータには触れない）
 *   pnpm data:load --remove-demo   # あわせて架空のデモ大会を削除する（実際の観戦用）
 *
 * 記入のルール（docs/real-data.md に詳しく書いています）
 * - 載せるのは、出典 URL で確認できた事実だけ。推測で日時・放送先・視聴 URL を埋めない
 * - 確認できなかった項目は null（未確認）にし、必要なら broadcastNote / note に「未確認」と書く
 * - 「見つからない」は「放送なし」ではない。NO_BROADCAST は公式に「放送・配信なし」とある場合だけ
 * - 確認済み（CONFIRMED）の枠には、必ず出典（sourceKey）と確認日時（verifiedAt）を付ける
 * - 確認日時は、出典ページを実際に開いて内容を確かめた日時（日本時間）を書く
 * - 時刻: 大会・セッションは開催地の現地時刻、放送・配信は日本時間
 * - 料金・地域は、出典の記載か、媒体の性質として明らかなもの（地上波は無料、CS・スカパー！は有料）に限る
 *
 * 2026-10-16 の確認は Perplexity Computer（AI）が公式ページを取得して行った。
 * 観戦前に、出典リンクから最新の公式情報を確かめてください。
 */
import type { RealEventDef } from "../prisma/real-events";

/** 2026-10-16 の確認日時（公式ページを取得・確認した時刻） */
const CHECKED_20261016 = "2026-10-16T06:00:00+09:00";

export const REAL_EVENTS: RealEventDef[] = [
  // -------------------------------------------------------------------------
  // 箱根駅伝予選会
  // -------------------------------------------------------------------------
  {
    slug: "hakone-ekiden-qualifier-2026",
    series: { slug: "hakone-ekiden-qualifier", name: "箱根駅伝予選会", officialUrl: "https://www.hakone-ekiden.jp/" },
    name: "第103回東京箱根間往復大学駅伝競走予選会",
    editionLabel: "第103回",
    category: "EKIDEN",
    description: "箱根駅伝本戦の出場権（10枠）を争うハーフマラソン。各校上位10人の合計タイムで競う。",
    venueName: "陸上自衛隊立川駐屯地〜立川市街地〜国営昭和記念公園",
    venueRegion: "東京都立川市",
    countryCode: "JP",
    timezone: "Asia/Tokyo",
    startDate: "2026-10-17",
    endDate: "2026-10-17",
    startTime: "08:30",
    officialUrl: "https://www.hakone-ekiden.jp/",
    broadcastInfoStatus: "CONFIRMED",
    broadcastNote:
      "スタートは大会要項で「8時30分スタート（予定）」。TVerのライブ配信は番組公式Xで告知されていますが、番組公式サイトでは確認できていません。",
    broadcastCheckedAt: CHECKED_20261016,
    sources: [
      {
        key: "youkou",
        kind: "OFFICIAL_SITE",
        url: "https://www.hakone-ekiden.jp/_assets/2026/103hakoneyosen_yoko.pdf",
        title: "第103回箱根駅伝予選会 大会要項（関東学連・PDF）",
      },
      {
        key: "spectators",
        kind: "OFFICIAL_SITE",
        url: "https://www.hakone-ekiden.jp/spectators/",
        title: "箱根駅伝公式サイト 観戦情報",
        note: "本選（1月）の放送情報が混在するため、予選会の収集対象にはしない",
      },
      {
        key: "ntv-oa",
        kind: "BROADCAST_INFO",
        url: "https://www.ntv.co.jp/hakone/info/3760062as8mh7v3nwxdk.html",
        title: "日本テレビ 箱根駅伝番組公式 予選会OA情報",
        collectEnabled: true,
      },
      {
        key: "gtasu",
        kind: "BROADCAST_INFO",
        url: "https://www.gtasu.com/prg/hakonequalify.html",
        title: "日テレジータス 番組ページ",
        collectEnabled: true,
      },
      {
        key: "ntv-x",
        kind: "OTHER",
        url: "https://x.com/hakone_ntv",
        title: "箱根駅伝番組公式X（@hakone_ntv）",
      },
    ],
    slots: [
      {
        key: "ntv",
        medium: "TERRESTRIAL",
        providerName: "日本テレビ（関東エリア）ほか",
        airDate: "2026-10-17",
        startTime: "08:25",
        endTime: "10:25",
        cost: "FREE",
        viewingType: "LIVE",
        region: "REGIONAL",
        regionNote: "関東エリアほか",
        note: "関東以外の放送局・放送地域は、お住まいの地域の番組表で確認してください。",
        watchUrl: null,
        infoUrl: "https://www.ntv.co.jp/hakone/info/3760062as8mh7v3nwxdk.html",
        verificationStatus: "CONFIRMED",
        sourceKey: "ntv-oa",
        verifiedAt: CHECKED_20261016,
      },
      {
        key: "tver",
        medium: "INTERNET",
        providerName: "TVer",
        airDate: "2026-10-17",
        startTime: null,
        endTime: null,
        cost: "UNKNOWN",
        viewingType: "LIVE",
        region: "UNKNOWN",
        regionNote: null,
        note: "番組公式Xで「TVerでもライブ配信」と告知（番組公式サイトには記載なし）。配信時刻・視聴ページは未確認です。",
        watchUrl: null,
        infoUrl: null,
        verificationStatus: "UNVERIFIED",
        sourceKey: "ntv-x",
        verifiedAt: null,
      },
      {
        key: "gtasu",
        medium: "CS",
        providerName: "日テレジータス（特別編）",
        airDate: "2026-10-25",
        startTime: "19:00",
        endTime: "21:30",
        cost: "PAID",
        viewingType: "DELAYED",
        region: "NATIONWIDE",
        regionNote: null,
        note: "全選手のフィニッシュや結果発表後のインタビューを含む特別編。再放送 10月28日（水）23:00〜25:30 ほか。",
        watchUrl: null,
        infoUrl: "https://www.gtasu.com/prg/hakonequalify.html",
        verificationStatus: "CONFIRMED",
        sourceKey: "gtasu",
        verifiedAt: CHECKED_20261016,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 東京レガシーハーフマラソン
  // -------------------------------------------------------------------------
  {
    slug: "tokyo-legacy-half-2026",
    series: { slug: "tokyo-legacy-half", name: "東京レガシーハーフマラソン", officialUrl: "https://legacyhalf.tokyo/" },
    name: "東京レガシーハーフマラソン2026",
    editionLabel: null,
    category: "MARATHON",
    description: "MUFGスタジアム（国立競技場）発着のハーフマラソン（東京2020パラリンピックのマラソンコースを活用）。",
    venueName: "MUFGスタジアム（国立競技場）発着",
    venueRegion: "東京都",
    countryCode: "JP",
    timezone: "Asia/Tokyo",
    startDate: "2026-10-18",
    endDate: "2026-10-18",
    startTime: "08:00",
    officialUrl: "https://legacyhalf.tokyo/",
    broadcastInfoStatus: "CONFIRMED",
    broadcastNote: "テレビ放送は公式サイトで確認できていません（未確認）。YouTubeの配信開始時刻は公式サイトに記載がありません。",
    broadcastCheckedAt: CHECKED_20261016,
    sessions: [
      { key: "wheelchair", name: "車いす スタート", date: "2026-10-18", startTime: "08:00", note: null },
      { key: "half", name: "ハーフマラソン 第1ウェーブ スタート", date: "2026-10-18", startTime: "08:05", note: "第2ウェーブ 8:08、第3ウェーブ 8:15（予定）" },
    ],
    sources: [
      {
        key: "outline",
        kind: "OFFICIAL_SITE",
        url: "https://legacyhalf.tokyo/about/outline/index.html",
        title: "東京レガシーハーフマラソン 大会概要",
      },
      {
        key: "live",
        kind: "BROADCAST_INFO",
        url: "https://legacyhalf.tokyo/news/detail/news_0277.html",
        title: "公式ニュース「YouTubeライブ配信決定！」",
        collectEnabled: true,
      },
    ],
    slots: [
      {
        key: "youtube",
        medium: "INTERNET",
        providerName: "YouTube（東京マラソン財団公式チャンネル）",
        airDate: "2026-10-18",
        startTime: null,
        endTime: null,
        cost: "FREE",
        viewingType: "LIVE",
        region: "NATIONWIDE",
        regionNote: null,
        note: "公式ページに埋め込まれたライブ配信。配信終了後はアーカイブも視聴できます（公式案内）。",
        watchUrl: "https://www.youtube.com/watch?v=AsQ0X_Oi-eg",
        infoUrl: "https://legacyhalf.tokyo/news/detail/news_0277.html",
        verificationStatus: "CONFIRMED",
        sourceKey: "live",
        verifiedAt: CHECKED_20261016,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // プリンセス駅伝
  // -------------------------------------------------------------------------
  {
    slug: "princess-ekiden-2026",
    series: { slug: "princess-ekiden", name: "プリンセス駅伝", officialUrl: "https://www.tbs.co.jp/princess-ekiden/" },
    name: "プリンセス駅伝 in 宗像・福津 2026",
    editionLabel: "第12回",
    category: "EKIDEN",
    description:
      "正式名称は「第12回全日本実業団対抗女子駅伝競走大会予選会」。クイーンズ駅伝（11月22日）への出場16チームを決める予選会。6区間42.195km。",
    venueName: "宗像ユリックス 発着",
    venueRegion: "福岡県宗像市・福津市",
    countryCode: "JP",
    timezone: "Asia/Tokyo",
    startDate: "2026-10-18",
    endDate: "2026-10-18",
    startTime: "12:10",
    officialUrl: "https://www.tbs.co.jp/princess-ekiden/",
    broadcastInfoStatus: "CONFIRMED",
    broadcastNote: "ネット配信は公式サイトで確認できていません（未確認）。",
    broadcastCheckedAt: CHECKED_20261016,
    sources: [
      {
        key: "munakata",
        kind: "OFFICIAL_SITE",
        url: "https://www.city.munakata.lg.jp/kiji0038788/index.html",
        title: "宗像市 第12回プリンセス駅伝in宗像・福津",
        collectEnabled: true,
      },
      {
        key: "munakata-pdf",
        kind: "BROADCAST_INFO",
        url: "https://www.city.munakata.lg.jp/kiji0038788/3_8788_17638_up_cq4s6bzq.pdf",
        title: "宗像市 大会チラシ（PDF・放送予定 11:50〜14:54）",
      },
      {
        key: "tbs",
        kind: "BROADCAST_INFO",
        url: "https://www.tbs.co.jp/princess-ekiden/",
        title: "TBSテレビ プリンセス駅伝2026",
        collectEnabled: true,
      },
    ],
    slots: [
      {
        key: "tbs",
        medium: "TERRESTRIAL",
        providerName: "TBS系列",
        airDate: "2026-10-18",
        startTime: "11:50",
        endTime: "14:54",
        cost: "FREE",
        viewingType: "LIVE",
        region: "NATIONWIDE",
        regionNote: null,
        note: "宗像市の案内で「TBS系列で全国生中継」。終了時刻 14:54 は宗像市の大会チラシ（PDF）による。",
        watchUrl: null,
        infoUrl: "https://www.tbs.co.jp/princess-ekiden/",
        verificationStatus: "CONFIRMED",
        sourceKey: "munakata",
        verifiedAt: CHECKED_20261016,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 全日本大学女子駅伝（杜の都駅伝）
  // -------------------------------------------------------------------------
  {
    slug: "all-japan-university-womens-ekiden-2026",
    series: {
      slug: "all-japan-university-womens-ekiden",
      name: "全日本大学女子駅伝",
      officialUrl: "https://www.morino-miyako.com/index.html",
    },
    name: "第44回全日本大学女子駅伝対校選手権大会",
    editionLabel: "第44回",
    category: "EKIDEN",
    description: "仙台で大学女子の日本一を争う駅伝。",
    venueName: "弘進ゴムアスリートパーク仙台（仙台市陸上競技場）発着",
    venueRegion: "宮城県仙台市",
    countryCode: "JP",
    timezone: "Asia/Tokyo",
    startDate: "2026-10-25",
    endDate: "2026-10-25",
    startTime: "12:10",
    officialUrl: "https://www.morino-miyako.com/index.html",
    broadcastInfoStatus: "CONFIRMED",
    broadcastNote: "前日 10月24日（土）13:30〜と当日 11:45〜に関連番組（関東ローカル+α）があります。TVerの視聴ページURLは未確認です。",
    broadcastCheckedAt: CHECKED_20261016,
    sources: [
      {
        key: "youkou",
        kind: "OFFICIAL_SITE",
        url: "https://www.iuau.jp/jigyo/2026/zenjo.pdf",
        title: "日本学連 第44回大会要項（PDF・12時10分スタート）",
      },
      {
        key: "ntv",
        kind: "BROADCAST_INFO",
        url: "https://www.ntv.co.jp/morinomiyako/",
        title: "日本テレビ 第44回全日本大学女子駅伝 番組公式",
        collectEnabled: true,
      },
    ],
    slots: [
      {
        key: "ntv",
        medium: "TERRESTRIAL",
        providerName: "日本テレビ系",
        airDate: "2026-10-25",
        startTime: "12:00",
        endTime: "14:35",
        cost: "FREE",
        viewingType: "LIVE",
        region: "NATIONWIDE",
        regionNote: null,
        note: "全国28局ネットで生中継。",
        watchUrl: null,
        infoUrl: "https://www.ntv.co.jp/morinomiyako/",
        verificationStatus: "CONFIRMED",
        sourceKey: "ntv",
        verifiedAt: CHECKED_20261016,
      },
      {
        key: "tver",
        medium: "INTERNET",
        providerName: "TVer",
        airDate: "2026-10-25",
        startTime: null,
        endTime: null,
        cost: "FREE",
        viewingType: "LIVE",
        region: "NATIONWIDE",
        regionNote: null,
        note: "スタート直前から無料ライブ配信（番組公式の案内）。",
        watchUrl: null,
        infoUrl: "https://www.ntv.co.jp/morinomiyako/",
        verificationStatus: "CONFIRMED",
        sourceKey: "ntv",
        verifiedAt: CHECKED_20261016,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 全日本大学駅伝
  // -------------------------------------------------------------------------
  {
    slug: "all-japan-university-ekiden-2026",
    series: { slug: "all-japan-university-ekiden", name: "全日本大学駅伝", officialUrl: "https://daigaku-ekiden.com/" },
    name: "秩父宮賜杯 第58回全日本大学駅伝対校選手権大会",
    editionLabel: "第58回",
    category: "EKIDEN",
    description: "熱田神宮から伊勢神宮までを走る大学駅伝。",
    venueName: "熱田神宮西門前〜伊勢神宮内宮宇治橋前",
    venueRegion: "愛知県名古屋市〜三重県伊勢市",
    countryCode: "JP",
    timezone: "Asia/Tokyo",
    startDate: "2026-11-01",
    endDate: "2026-11-01",
    startTime: "08:10",
    officialUrl: "https://daigaku-ekiden.com/",
    broadcastInfoStatus: "CONFIRMED",
    broadcastNote:
      "放送終了時刻とネット配信（TVerなど）は公式発表を確認できていません。CS（テレ朝チャンネル）で11月22日に特番予定と案内されていますが、時刻は未確認です。",
    broadcastCheckedAt: CHECKED_20261016,
    sources: [
      {
        key: "official",
        kind: "OFFICIAL_SITE",
        url: "https://daigaku-ekiden.com/",
        title: "全日本大学駅伝 公式サイト（8時10分スタート）",
      },
      {
        key: "jaaf",
        kind: "BROADCAST_INFO",
        url: "https://www.jaaf.or.jp/competition/detail/2072/",
        title: "日本陸連 大会情報（オンエア情報）",
        collectEnabled: true,
      },
      {
        key: "tv-asahi",
        kind: "BROADCAST_INFO",
        url: "https://www.tv-asahi.co.jp/ekiden/",
        title: "テレビ朝日 第58回全日本大学駅伝 番組サイト",
        note: "JavaScript で描画されるため、収集 CLI では本文を取得できない（2026-10-16 確認）",
      },
    ],
    slots: [
      {
        key: "tv-asahi",
        medium: "TERRESTRIAL",
        providerName: "テレビ朝日系列",
        airDate: "2026-11-01",
        startTime: "07:45",
        endTime: null,
        cost: "FREE",
        viewingType: "LIVE",
        region: "UNKNOWN",
        regionNote: null,
        note: "放送終了時刻は未確認。",
        watchUrl: null,
        infoUrl: "https://www.tv-asahi.co.jp/ekiden/",
        verificationStatus: "CONFIRMED",
        sourceKey: "jaaf",
        verifiedAt: CHECKED_20261016,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // ニューヨークシティマラソン（海外・日本時間で日付が変わる例）
  // -------------------------------------------------------------------------
  {
    slug: "new-york-city-marathon-2026",
    series: {
      slug: "new-york-city-marathon",
      name: "ニューヨークシティマラソン",
      officialUrl: "https://www.nyrr.org/tcsnycmarathon",
    },
    name: "TCSニューヨークシティマラソン2026",
    editionLabel: null,
    category: "MARATHON",
    description: "参加者数が世界で最も多いことで知られるマラソン（テレ朝チャンネル番組ページより）。",
    venueName: "ニューヨーク市内",
    venueRegion: "ニューヨーク",
    countryCode: "US",
    timezone: "America/New_York",
    startDate: "2026-11-01",
    endDate: "2026-11-01",
    startTime: null,
    officialUrl: "https://www.nyrr.org/tcsnycmarathon",
    broadcastInfoStatus: "CONFIRMED",
    broadcastNote: "プロ選手のスタート時刻は主催者サイトで確認できていません。日本ではCS・有料配信のみ確認しています。",
    broadcastCheckedAt: CHECKED_20261016,
    sources: [
      {
        key: "tv-asahi-ch",
        kind: "BROADCAST_INFO",
        url: "https://www.tv-asahi.co.jp/ch/contents/sports/0665/",
        title: "テレ朝チャンネル 番組ページ",
        collectEnabled: true,
      },
      {
        key: "tv-asahi-ch-marathon",
        kind: "BROADCAST_INFO",
        url: "https://www.tv-asahi.co.jp/ch/recommend/marathon/",
        title: "テレ朝チャンネル 世界8大マラソン特集",
      },
    ],
    slots: [
      {
        key: "tv-asahi-ch2",
        medium: "CS",
        providerName: "テレ朝チャンネル2",
        airDate: "2026-11-01",
        startTime: "23:00",
        endTime: null,
        cost: "PAID",
        viewingType: "LIVE",
        region: "NATIONWIDE",
        regionNote: null,
        note: "国際映像での生中継（上位選手中心）。スカパー！ch.299、ひかりTV、J:COMなど。",
        watchUrl: null,
        infoUrl: "https://www.tv-asahi.co.jp/ch/contents/sports/0665/",
        verificationStatus: "CONFIRMED",
        sourceKey: "tv-asahi-ch",
        verifiedAt: CHECKED_20261016,
      },
      {
        key: "skyperfectv-online",
        medium: "INTERNET",
        providerName: "スカパー！番組配信",
        airDate: "2026-11-01",
        startTime: "23:00",
        endTime: null,
        cost: "PAID",
        viewingType: "LIVE",
        region: "NATIONWIDE",
        regionNote: null,
        note: "テレ朝チャンネル2の同時配信。見逃し配信1週間あり（番組ページの案内）。",
        watchUrl: null,
        infoUrl: "https://www.tv-asahi.co.jp/ch/contents/sports/0665/",
        verificationStatus: "CONFIRMED",
        sourceKey: "tv-asahi-ch",
        verifiedAt: CHECKED_20261016,
      },
    ],
  },
];
