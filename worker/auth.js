const COOKIE = "__Host-snapapp_admin";
const authJson = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
const cookie = (value, age) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function configured(env) {
  return !!(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.ADMIN_USER_ID);
}
function sameOrigin(request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
async function authFetch(env, path, options = {}) {
  return fetch(env.SUPABASE_URL + "/auth/v1/" + path, {
    ...options,
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, ...options.headers },
    signal: AbortSignal.timeout(10000)
  });
}
export async function adminUser(request, env) {
  if (!configured(env)) return null;
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) return null;
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!token || !/^[A-Za-z0-9_.-]+$/.test(token) || token.length > 8192) return null;
  try {
    const response = await authFetch(env, "user", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const user = await response.json();
    return user.id === env.ADMIN_USER_ID && !user.is_anonymous ? { id: user.id, email: user.email } : null;
  } catch { return null; }
}
export async function handleAuth(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/session" && request.method === "GET") {
    const user = await adminUser(request, env);
    return authJson({ user }, user ? 200 : 401);
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    if (!sameOrigin(request)) return authJson({ error: "Request not allowed." }, 403);
    return authJson({ ok: true }, 200, { "set-cookie": cookie("", 0) });
  }
  if (path !== "/api/auth/login" || request.method !== "POST") return authJson({ error: "Not found." }, 404);
  if (!sameOrigin(request)) return authJson({ error: "Request not allowed." }, 403);
  if (!configured(env)) return authJson({ error: "Sign-in is not configured yet." }, 503);
  if (!request.headers.get("content-type")?.includes("application/json")) return authJson({ error: "Invalid request." }, 415);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return authJson({ error: "Invalid request." }, 413);
    body = JSON.parse(raw);
  } catch { return authJson({ error: "Invalid request." }, 400); }
  if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) return authJson({ error: "Enter your email and password." }, 400);
  try {
    const response = await authFetch(env, "token?grant_type=password", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: body.email.trim(), password: body.password })
    });
    if (response.status === 429) return authJson({ error: "Too many sign-in attempts. Please try again later." }, 429);
    if (!response.ok) return authJson({ error: "Unable to sign in. Check your email and password." }, 401);
    const data = await response.json();
    if (data.user?.id !== env.ADMIN_USER_ID || data.user?.is_anonymous || !data.access_token || !/^[A-Za-z0-9_.-]+$/.test(data.access_token)) {
      return authJson({ error: "This account does not have gallery admin access." }, 403);
    }
    const age = Math.min(3600, Math.max(0, Number(data.expires_in) || 0));
    if (!age) return authJson({ error: "Unable to start a session. Please try again." }, 502);
    return authJson({ user: { id: data.user.id, email: data.user.email } }, 200, { "set-cookie": cookie(data.access_token, age) });
  } catch { return authJson({ error: "Sign-in is temporarily unavailable. Please try again." }, 503); }
}
