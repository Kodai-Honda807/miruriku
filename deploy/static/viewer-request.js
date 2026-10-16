// CloudFront Functions（JavaScript ランタイム 2.0）のビューワーリクエスト関数。
// deploy/static/template.yaml が、このファイルの内容をそのまま関数のコードとして登録する。
// ローカルの静的サーバー（scripts/serve-static.mjs）も同じファイルを読み込んで同じ振る舞いを再現する。
//
// 1. www.<ドメイン> へのアクセスは、www なしのドメインへ 301 で転送する（パスとクエリはそのまま）
// 2. 末尾が / のパスは index.html を返す（/events/<slug>/ → /events/<slug>/index.html）
// 3. 拡張子のないパス（/events/<slug>）は、末尾に / を付けた URL へ 301 で転送する
//
// クエリは rawQueryString()（受け取ったままの文字列）で引き継ぐ（日本語の検索語などを二重にエンコードしないため）。
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : "";
  var raw = typeof request.rawQueryString === "function" ? request.rawQueryString() : undefined;
  var query = raw ? "?" + raw : "";

  if (host.indexOf("www.") === 0) {
    return redirect("https://" + host.substring(4) + uri + query);
  }
  if (uri.charAt(uri.length - 1) === "/") {
    request.uri = uri + "index.html";
    return request;
  }
  var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
  if (lastSegment.indexOf(".") === -1) {
    return redirect(uri + "/" + query);
  }
  return request;
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: location },
      "cache-control": { value: "public, max-age=3600" },
    },
  };
}
