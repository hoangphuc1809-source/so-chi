/**
 * Cloudflare Worker — proxy HTTPS cho Sổ Chi.
 *
 * Điện thoại  ──HTTPS──>  Worker  ──HTTP──>  VPS hermes-family:8080
 *
 * Worker gắn header X-Sochi-Proxy; máy chủ từ chối mọi request thiếu header này,
 * nên dù ai đó dò trúng IP và cổng cũng chỉ nhận 403.
 *
 * Cài đặt trên dash.cloudflare.com:
 *   1. Workers & Pages  →  Create  →  Start with Hello World  →  Deploy
 *   2. Edit code, dán toàn bộ file này, Deploy lại
 *   3. Settings → Variables and Secrets → thêm secret tên PROXY_SECRET,
 *      giá trị lấy từ file .env trên VPS (dòng PROXY_SECRET=...)
 *
 * KHÔNG hardcode secret vào file này.
 */

const ORIGIN = "http://35.209.186.237:8080";

export default {
  async fetch(request, env) {
    if (!env.PROXY_SECRET) {
      return new Response("Worker chưa cấu hình PROXY_SECRET", { status: 500 });
    }

    const incoming = new URL(request.url);
    const target = new URL(ORIGIN);
    target.pathname = incoming.pathname;
    target.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.set("X-Sochi-Proxy", env.PROXY_SECRET);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ray");

    let res;
    try {
      res = await fetch(target.toString(), {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });
    } catch (e) {
      return new Response(
        "Không kết nối được tới máy chủ. Kiểm tra dịch vụ sochi trên VPS còn chạy không.",
        { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    const out = new Headers(res.headers);
    out.set("X-Frame-Options", "DENY");
    out.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(res.body, { status: res.status, headers: out });
  },
};
