/* Código compartilhado pelas funções /api — o prefixo "_" impede que vire endpoint. */

const BASE_URL = process.env.PROFANUS_BASE_URL || "https://profanuspay.com";

/* A fonte da verdade dos valores é o servidor: o front só envia o id do frete. */
const SUBTOTAL = 0;
const SHIPPING = {
  pac: { name: "PAC", price: 22.34 },
  sedex: { name: "SEDEX", price: 26.77 },
  expresso: { name: "SEDEX Expresso", price: 34.81 }
};

/* ref = external_id no Profanus (chave de idempotência). Ex: SC-K3M9X2PQ7A ou SC-K3M9X2PQ7A-2 */
const REF_RE = /^SC-[A-Z0-9]{10}(-\d{1,2})?$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => Math.min(300 * 2 ** attempt, 4000) + Math.random() * 150;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Chamada à API Profanus com retry exponencial.
 * Só repete em 429/5xx/timeout/rede; 4xx (exceto 429) volta direto pro chamador.
 * Repetir o POST /api/pix/create é seguro porque external_id é idempotente.
 * Retorna { ok, status, data }.
 */
async function profanus(path, { method = "GET", body, retries = 2 } = {}) {
  const key = process.env.PROFANUS_API_KEY;
  if (!key) throw new Error("PROFANUS_API_KEY não configurada");

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(BASE_URL + path, {
        method,
        headers: { "x-api-key": key, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000)
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text.slice(0, 300) }; }

      if (res.ok) return { ok: true, status: res.status, data };
      if (RETRYABLE.has(res.status) && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(ra > 0 ? Math.min(ra * 1000, 4000) : backoff(attempt));
        continue;
      }
      return { ok: false, status: res.status, data };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) { await sleep(backoff(attempt)); continue; }
    }
  }
  throw lastErr;
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return "https://" + host;
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { SUBTOTAL, SHIPPING, REF_RE, profanus, publicBaseUrl, round2 };
