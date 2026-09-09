// ── SHARE PROXY (Vercel serverless) ───────────────────────────────────────────
// Serves GET /s/:id on the CLIENT domain so users never see the backend host.
// Reads BACKEND_ORIGIN (server-only env, e.g. https://southswift.onrender.com),
// fetches the OG HTML from <BACKEND_ORIGIN>/api/share/:id, and streams it back.
// The browser URL stays on southswift.com.ng the whole time.
//
// Vercel env: BACKEND_ORIGIN (required, prod + preview). Never use a
// REACT_APP_*/NEXT_PUBLIC_* prefix — those ship to browsers.

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const MAX_BYTES = 1024 * 1024; // 1MB — OG pages are a few KB; cap abuse

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed.');
  }

  const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  if (!id || !ID_RE.test(String(id))) {
    return res.status(400).send('Invalid listing id.');
  }

  const origin = String(process.env.BACKEND_ORIGIN || '').replace(/\/+$/, '');
  if (!origin) {
    console.error('❌ share proxy: BACKEND_ORIGIN is not set');
    return res.status(500).send('Share service not configured.');
  }
  // https required in production; http allowed only for localhost dev
  // (`vercel dev` with BACKEND_ORIGIN=http://localhost:5000).
  const isLocalhost = /^http:\/\/localhost(:\d+)?$/i.test(origin);
  if (!/^https:\/\/[^/\s]+$/i.test(origin) && !isLocalhost) {
    console.error('❌ share proxy: BACKEND_ORIGIN malformed');
    return res.status(500).send('Share service misconfigured.');
  }

  const target = `${origin}/api/share/${encodeURIComponent(String(id))}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const upstream = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        Accept: 'text/html',
        'User-Agent': req.headers['user-agent'] || 'SouthSwift-ShareProxy/1.0',
      },
    });
    clearTimeout(timer);
    const html = await upstream.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return res.status(upstream.status).send(html.slice(0, MAX_BYTES));
  } catch (err) {
    console.error('❌ share proxy error:', err.message);
    return res.status(502).send('Share service unavailable.');
  }
}
