const DEFAULT_PATH = '/api/health';

async function ping(env) {
  const baseUrl = env.HEALTH_URL;
  if (!baseUrl) {
    return { ok: false, error: 'HEALTH_URL is not configured' };
  }

  const url = baseUrl.endsWith(DEFAULT_PATH)
    ? baseUrl
    : `${baseUrl.replace(/\/$/, '')}${DEFAULT_PATH}`;
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'telemetry-keepalive/1.0' },
      cf: { cacheTtl: 0 },
    });

    return {
      ok: response.ok,
      status: response.status,
      url,
      ms: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      url,
      ms: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  }
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(ping(env));
  },

  async fetch(_request, env) {
    const result = await ping(env);
    return Response.json(result, { status: result.ok ? 200 : 502 });
  },
};
