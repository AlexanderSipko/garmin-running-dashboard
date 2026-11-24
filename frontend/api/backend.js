// Keep browser requests and the session cookie on the dashboard's own origin.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const origin = process.env.BACKEND_ORIGIN;
  const { path, ...query } = req.query;
  if (!origin || typeof path !== "string" || !/^[a-z0-9_/-]+$/i.test(path)) {
    return res.status(503).json({ detail: "Сервер аккаунтов ещё не подключён." });
  }

  const target = new URL(`/api/${path}`, origin);
  for (const [name, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      target.searchParams.append(name, item);
    }
  }
  const headers = new Headers();
  for (const name of ["cookie", "origin", "content-type"]) {
    if (req.headers[name]) headers.set(name, req.headers[name]);
  }
  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) || req.body == null
        ? undefined
        : typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      redirect: "manual",
      signal: AbortSignal.timeout(55_000),
    });
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) res.setHeader("Retry-After", retryAfter);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");
    return res.status(response.status).send(await response.text());
  } catch {
    return res.status(502).json({ detail: "Сервер аккаунтов временно недоступен." });
  }
}
