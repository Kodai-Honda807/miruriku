/**
 * 静的書き出し（out/ など）をローカルで配信する簡易サーバー。本番（S3 + CloudFront）の振る舞いを再現する:
 * - URL の書き換え・転送は、本番と同じ CloudFront Functions のコード（deploy/static/viewer-request.js）で行う
 * - ファイルがなければ 404.html を 404 で返す（CloudFront のカスタムエラーレスポンスと同じ）
 *
 *   node scripts/serve-static.mjs [配信するディレクトリ=out] [ポート=3000]
 *
 * E2E（playwright.config.ts）と、デプロイ前の確認（pnpm preview）で使う。本番の配信には使わない。
 */
import { readFileSync, statSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FUNCTION_FILE = path.resolve(here, "../deploy/static/viewer-request.js");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** CloudFront Functions のコードを読み込み、handler 関数を返す（本番と同じファイル） */
export function loadViewerRequestHandler(file = FUNCTION_FILE) {
  const source = readFileSync(file, "utf8");
  return new Function(`${source}\nreturn handler;`)();
}

export function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** S3 のキーに相当するファイルパス。ディレクトリの外を指すものは null */
function resolveKey(root, uri) {
  let decoded;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return null;
  }
  const resolved = path.resolve(root, `.${decoded}`);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

export function createStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const handler = loadViewerRequestHandler();
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawQuery = url.search ? url.search.slice(1) : req.url?.includes("?") ? "" : undefined;
    const request = {
      method: req.method,
      uri: url.pathname,
      headers: { host: { value: req.headers.host ?? "" } },
      rawQueryString: () => rawQuery,
    };
    const result = handler({ request });

    if (result.statusCode) {
      const headers = {};
      for (const [name, { value }] of Object.entries(result.headers ?? {})) headers[name] = value;
      res.writeHead(result.statusCode, headers);
      res.end();
      return;
    }

    const filePath = resolveKey(root, result.uri);
    const found = filePath && isFile(filePath);
    const servePath = found ? filePath : path.join(root, "404.html");
    res.writeHead(found ? 200 : 404, {
      "content-type": contentTypeFor(servePath),
      "cache-control": "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(servePath).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir = "out", portArg = "3000"] = process.argv.slice(2);
  const port = Number(portArg);
  if (!isFile(path.join(path.resolve(dir), "index.html"))) {
    console.error(`${dir}/index.html がありません。先に pnpm build で静的ビルドしてください`);
    process.exit(1);
  }
  createStaticServer(dir).listen(port, () => {
    console.log(`静的配信: http://localhost:${port}/ （${dir}）`);
  });
}
