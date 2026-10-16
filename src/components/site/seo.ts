/**
 * ページ共通の OGP。Next.js のメタデータは openGraph をページで指定すると親の値を丸ごと置き換えるため、
 * 各ページはこの値を展開してから title・description・url を上書きする。
 */
import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/site-url";

import { SITE_DESCRIPTION, SITE_NAME } from "./site-header";

/**
 * サイト URL が設定されているか（ビルド時に決まる）。未設定なら canonical・OGP 画像を出さない
 * （Next.js が http://localhost:3000 を補ってしまい、誤った絶対 URL になるため）。
 */
export const HAS_SITE_URL = getSiteUrl() !== null;

/** トップのタイトル（検索結果の見出し）。サイト名と、検索されやすい言葉（駅伝・マラソン・放送・配信）を入れる */
export const SITE_TITLE = `${SITE_NAME} | 駅伝・マラソン・陸上競技のテレビ放送・ネット配信予定`;

/** app/opengraph-image.png と同じ画像（サイト共通の OGP 画像） */
export const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — 次のレース、いつ・どこで見られる？ 駅伝・マラソン・トラック競技の開催日程と、日本から視聴できるテレビ放送・ネット配信`,
} as const;

export const BASE_OPEN_GRAPH = {
  type: "website",
  locale: "ja_JP",
  siteName: SITE_NAME,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  ...(HAS_SITE_URL ? { images: [OG_IMAGE] } : {}),
} satisfies NonNullable<Metadata["openGraph"]>;

/** X（Twitter）カード。ページごとに title・description を足して使う */
export const BASE_TWITTER = {
  card: "summary_large_image",
  ...(HAS_SITE_URL ? { images: [OG_IMAGE.url] } : {}),
} satisfies NonNullable<Metadata["twitter"]>;

/** canonical（サイト URL が未設定なら付けない） */
export function canonical(path: string): Pick<Metadata, "alternates"> {
  return HAS_SITE_URL ? { alternates: { canonical: path } } : {};
}
