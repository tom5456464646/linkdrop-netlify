import { getStore } from "@netlify/blobs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function bad(msg, status = 400) { return json({ ok: false, error: msg }, status); }

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
    // создаём (или открываем) blob-хранилище c именем "linkdrop"
    const store = getStore({ name: "linkdrop", consistency: "strong" });

    if (event.httpMethod === "GET") {
      const items = await loadAll(store);
      // сортируем по дате убыв.
      items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      return json({ ok: true, items });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const raw = String(body.url || "").trim();
      const title = body.title ? String(body.title).trim() : null;
      try { new URL(raw); } catch { return bad("INVALID_URL"); }

      const items = await loadAll(store);
      const id = (items.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
      const item = { id, url: raw, title, created_at: Math.floor(Date.now() / 1000) };
      items.push(item);
      await saveAll(store, items);
      return json({ ok: true, item });
    }

    if (event.httpMethod === "DELETE") {
      // id берём из query (?id=123) или из redirect из /api/links/:id
      const idStr = (event.queryStringParameters && (event.queryStringParameters.id || event.queryStringParameters.delete)) || "";
      const id = Number(idStr);
      if (!id) return bad("MISSING_ID", 404);

      const items = await loadAll(store);
      const next = items.filter(x => x.id !== id);
      if (next.length === items.length) return bad("NOT_FOUND", 404);

      await saveAll(store, next);
      return json({ ok: true });
    }

    return bad("METHOD_NOT_ALLOWED", 405);
  } catch (e) {
    return bad("SERVER_ERROR: " + (e?.message || String(e)), 500);
  }
}
