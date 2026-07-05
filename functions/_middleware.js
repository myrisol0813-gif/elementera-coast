function unauthorized() {
  return new Response("Elementera Coast is protected.\n", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Elementera Coast", charset="UTF-8"',
      "Cache-Control": "no-store",
      "Vary": "Authorization",
    },
  });
}

function decodeBasicAuth(header) {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice("Basic ".length));
    const splitAt = decoded.indexOf(":");
    if (splitAt < 0) return null;
    return { user: decoded.slice(0, splitAt), password: decoded.slice(splitAt + 1) };
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const expectedUser = env.COAST_GATE_USER || "coast";
  const expectedPassword = env.COAST_GATE_PASSWORD;

  if (!expectedPassword) return next();

  const auth = decodeBasicAuth(request.headers.get("Authorization"));

  if (!auth || auth.user !== expectedUser || auth.password !== expectedPassword) {
    return unauthorized();
  }

  const response = await next();
  const headers = new Headers(response.headers);

  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Authorization");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}