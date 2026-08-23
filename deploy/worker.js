/**
 * Cloudflare Worker — proxy HTTPS cho Sổ Chi.
 *
 * Điện thoại ──HTTPS──> Worker ──HTTP──> VPS hermes-family:8080
 *
 * Worker gắn header X-Sochi-Proxy; máy chủ từ chối mọi request thiếu header này.
 *
 * BẪY ĐÃ GẶP: Cloudflare Workers CHẶN fetch() tới địa chỉ IP trần, trả về
 * error code 1003 ngay tại biên, request không bao giờ chạm tới VPS.
 * Bắt buộc phải dùng hostname. sslip.io và nip.io là DNS wildcard công cộng,
 * tự phân giải 35-209-186-237.sslip.io -> 35.209.186.237, không cần đăng ký.
 *
 * Deploy:  npx wrangler deploy
 * Secret:  npx wrangler secret put PROXY_SECRET   (lấy từ .env trên VPS)
 */

const ORIGINS = [
  "http://35-209-186-237.sslip.io:8080",
  "http://35-209-186-237.nip.io:8080",
];

export default {
  async fetch(request, env) {
    if (!env.PROXY_SECRET) {
      return new Response("Worker chưa cấu hình PROXY_SECRET", { status: 500 });
    }

    const incoming = new URL(request.url);

    const headers = new Headers(request.headers);
    headers.set("X-Sochi-Proxy", env.PROXY_SECRET);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ray");

    // Body chỉ đọc được một lần, nên phải giữ lại để còn thử origin dự phòng.
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const body = hasBody ? await request.arrayBuffer() : undefined;

    let lastError = "";
    for (const origin of ORIGINS) {
      const target = new URL(origin);
      target.pathname = incoming.pathname;
      target.search = incoming.search;
      try {
        const res = await fetch(target.toString(), {
          method: request.method,
          headers,
          body,
          redirect: "manual",
        });
        const out = new Headers(res.headers);
        out.set("X-Frame-Options", "DENY");
        out.set("Strict-Transport-Security", "max-age=31536000");
        return new Response(res.body, { status: res.status, headers: out });
      } catch (e) {
        lastError = target.hostname + ": " + e.message;
      }
    }

    return new Response("Không kết nối được tới máy chủ.\n" + lastError, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
