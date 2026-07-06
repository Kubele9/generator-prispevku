// Netlify serverless funkce – bezpečný proxy na Google Gemini.
// Klíč je uložený jen v proměnné prostředí GEMINI_API_KEY na Netlify,
// nikdy se neposílá do prohlížeče ani není v kódu/repozitáři.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return json(500, { error: "NA_SERVERU_CHYBI_KLIC" });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
  const system = String(body.system || "");
  const user = String(body.user || "");
  const model = String(body.model || "gemini-2.5-flash");
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.8;

  const url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ("Gemini " + res.status);
      return json(res.status, { error: msg });
    }
    const cand = data.candidates && data.candidates[0];
    const parts = cand && cand.content && cand.content.parts;
    const text = parts ? parts.map((p) => p.text || "").join("") : "";
    return json(200, { text: text.trim() });
  } catch (e) {
    return json(502, { error: String((e && e.message) || e) });
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(statusCode, obj) {
  return { statusCode, headers: Object.assign({ "Content-Type": "application/json" }, cors()), body: JSON.stringify(obj) };
}
