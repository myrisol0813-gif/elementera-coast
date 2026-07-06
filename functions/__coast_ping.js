export async function onRequest() {
  return new Response(JSON.stringify({
    ok: true,
    service: 'elementera-root-functions',
    route: '/__coast_ping',
    source: 'repo-root/functions/__coast_ping.js',
    message: 'Cloudflare Pages Functions is alive outside /api.'
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
