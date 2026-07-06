export async function onRequest() {
  return new Response(JSON.stringify({
    ok: true,
    service: 'elementera-pages-functions',
    route: '/api/ping',
    message: 'Cloudflare Pages Functions is alive.'
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
