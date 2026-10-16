import { chromium } from '/home/user/workspace/miruriku/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
const svg = fs.readFileSync('/tmp/brand/icon.svg','utf8'); const small = fs.readFileSync('/tmp/brand/icon-small.svg','utf8');
const b = await chromium.launch();
for (const s of [16,32,48,180,192,512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${(s<=48?small:svg).replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
  await p.screenshot({ path: `/tmp/brand/icon-${s}.png`, omitBackground: true });
  await p.close();
}
// apple-touch: full-bleed square (iOS rounds corners itself)
{
  const p = await b.newPage({ viewport: { width: 180, height: 180 } });
  await p.setContent(`<html><body style="margin:0">${svg.replace('rx="112"','rx="0"').replace('<svg ', '<svg width="180" height="180" ')}</body></html>`);
  await p.screenshot({ path: '/tmp/brand/apple-icon.png' }); await p.close();
}
// OG image
{
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<html><body style="margin:0;font-family:'Noto Sans CJK JP',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;background:#f6f8fc;position:relative;padding:72px 88px;display:flex;flex-direction:column;justify-content:center;gap:28px">
    <div style="position:absolute;left:0;top:0;width:1200px;height:16px;background:#1f3f87"></div>
    <div style="display:flex;align-items:center;gap:32px">
      ${svg.replace('<svg ', '<svg width="148" height="148" ')}
      <div style="font-size:112px;font-weight:700;color:#1f3f87;letter-spacing:4px;line-height:1">みる陸</div>
    </div>
    <div style="font-size:60px;font-weight:700;color:#111827;line-height:1.3">次のレース、いつ・どこで見られる？</div>
    <div style="font-size:34px;color:#475569;line-height:1.5">駅伝・マラソン・トラック競技の開催日程と、<br>日本から視聴できるテレビ放送・ネット配信</div>
  </div></body></html>`);
  await p.screenshot({ path: '/tmp/brand/opengraph-image.png' }); await p.close();
}
await b.close();
