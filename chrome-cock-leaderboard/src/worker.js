export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // CORS básico
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (pathname === "/api/leaderboard" && request.method === "GET") {
        const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 100);
        const { results } = await env.DB.prepare(
          `SELECT display_name AS name, best_score AS score
             FROM scores
             ORDER BY best_score DESC, updated_at ASC
             LIMIT ?1`
        ).bind(limit).all();

        return json({ ok: true, data: results }, corsHeaders);
      }

      if (pathname === "/api/me" && request.method === "GET") {
        const name = (searchParams.get("name") || "").trim();
        const name_norm = normalizeName(name);
        if (!name_norm) return json({ ok: false, error: "invalid_name" }, corsHeaders, 400);

        const row = await env.DB.prepare(
          `SELECT display_name AS name, best_score AS score
             FROM scores
             WHERE name_norm = ?1`
        ).bind(name_norm).first();

        return json({ ok: true, data: row || null }, corsHeaders);
      }

      if (pathname === "/api/score" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const nameRaw = typeof body.name === "string" ? body.name : "";
        const score = Number.isFinite(body.score) ? Math.max(0, Math.floor(body.score)) : NaN;
        const name_norm = normalizeName(nameRaw);

        if (!name_norm || !Number.isFinite(score)) {
          return json({ ok: false, error: "invalid_payload" }, corsHeaders, 400);
        }

        const display_name = nameRaw.trim().slice(0, 16);
        const now = Math.floor(Date.now() / 1000);

        // UPSERT: mantém o melhor score e atualiza display_name
        await env.DB.prepare(
          `INSERT INTO scores (name_norm, display_name, best_score, updated_at)
             VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(name_norm) DO UPDATE SET
             display_name = excluded.display_name,
             best_score = CASE
               WHEN excluded.best_score > scores.best_score THEN excluded.best_score
               ELSE scores.best_score END,
             updated_at = CASE
               WHEN excluded.best_score > scores.best_score THEN excluded.updated_at
               ELSE scores.updated_at END`
        ).bind(name_norm, display_name, score, now).run();

        const after = await env.DB.prepare(
          `SELECT display_name AS name, best_score AS score
             FROM scores WHERE name_norm = ?1`
        ).bind(name_norm).first();

        return json({ ok: true, data: after }, corsHeaders);
      }

      if (pathname === "/api/health") {
        return new Response("ok", { headers: corsHeaders });
      }

      return json({ ok: false, error: "not_found" }, corsHeaders, 404);
    } catch (err) {
      return json({ ok: false, error: "server_error", detail: String(err) }, corsHeaders, 500);
    }
  }
};

function normalizeName(name) {
  if (typeof name !== "string") return "";
  const trimmed = name.trim().slice(0, 16);
  // Aceita letras, números e underline. Ajuste se quiser liberar mais.
  if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) return "";
  return trimmed.toLowerCase();
}

function json(obj, extraHeaders = {}, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    }
  });
}

