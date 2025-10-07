// Netlify Functions + Netlify Blobs (manual config via env)
// Возвращаем { statusCode, headers, body }
import { getStore } from "@netlify/blobs";

const respond = (data, status = 200) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(data),
});
const bad = (msg, status = 400) => respond({ ok: false, error: msg }, status);

async function loadAll(store) {
  const txt = await store.get("links");
  if (!txt) return [];
  try { return JSON.parse(txt); } catch { return []; }
}
async function saveAll(store, arr) {
  await store.set("links", JSON.stringify(arr));
}

export async function handler(event) {
  try {
    const store = getStore({
      name: "linkdrop",
      consistency: "strong",
      // если Blobs не включены в UI — берём siteID и token из переменных окружения
      siteID: process.env.BLOBS_SITE_ID,
      token: process.env.BLOBS_TOKEN,
    });

    if (event.httpMethod === "GET") {
      const items = await loadAll(store);
      items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      return respond({ ok: true, items });
    }

    if (event.httpMethod === "POST") {
      // (опционально) защита токеном:
      // const token = event.headers["x-write-token"] || event.headers["X-Write-Token"];
      // if (!token || token !== process.env.WRITE_TOKEN) return bad("FORBIDDEN", 403);

      const body = JSON.parse(event.body || "{}");
      const raw = String(body.url || "").trim();
      const title = body.title ? String(body.title).trim() : null;
      try { new URL(raw); } catch { return bad("INVALID_URL"); }

      const items = await loadAll(store);
      const id = (items.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
      const item = { id, url: raw, title, created_at: Math.floor(Date.now() / 1000) };
      items.push(item);
      await saveAll(store, items);
      return respond({ ok: true, item });
    }

    if (event.httpMethod === "DELETE") {
      // фикс: берём id из query (?id=123); fallback — выцепить число из пути
      const fromQuery = Number(event.queryStringParameters?.id || event.queryStringParameters?.delete || 0);
      const fromPath = (() => {
        const m = (event.path || "").match(/(?:^|\/)(\d+)(?:$|\/)/);
        return m ? Number(m[1]) : 0;
      })();
      const id = fromQuery || fromPath;
      if (!id) return bad("MISSING_ID", 404);

      const items = await loadAll(store);
      const next = items.filter(x => x.id !== id);
      if (next.length === items.length) return bad("NOT_FOUND", 404);

      await saveAll(store, next);
      return respond({ ok: true });
    }

    return bad("METHOD_NOT_ALLOWED", 405);
  } catch (e) {
    return bad("SERVER_ERROR: " + (e?.message || String(e)), 500);
  }
}
