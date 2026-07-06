export async function onRequest() {
  return new Response(JSON.stringify({
    ok: true,
    service: 'elementera-root-functions',
    route: '/api/ping',
    source: 'repo-root/functions/api/ping.js',
    message: 'Cloudflare Pages Functions is alive from repo root.'
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
