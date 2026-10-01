// ShopCloseService — Cloudflare Workers 진입점
// 정적 화면(public/)은 assets 로 제공되고, /api/* 만 처리한다. 환경변수는 src/api.js 참고.
import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url.pathname);
    return env.ASSETS.fetch(request);
  },
};
