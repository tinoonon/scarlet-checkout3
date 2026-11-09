const crypto = require("crypto");
const { profanus } = require("./_lib/shared");
const { sendToPanel } = require("./_lib/panel");

/* Precisamos do corpo CRU para validar o HMAC. */
module.exports.config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validSignature(header, raw, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((s) => s.trim())));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // janela de 5 min
  const expected = crypto.createHmac("sha256", secret).update(t + "." + raw.toString("utf8")).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const raw = await readRaw(req);
  const secret = process.env.PROFANUS_WEBHOOK_SECRET;

  if (secret && !validSignature(req.headers["x-webhook-signature"], raw, secret)) {
    return res.status(401).json({ error: "assinatura inválida" });
  }

  let evt;
  try { evt = JSON.parse(raw.toString("utf8")); } catch (e) { return res.status(400).end(); }

  if (evt.event === "payment.confirmed" && evt.external_id) {
    /* Sempre confirma na API do Profanus (também traz valor e data reais do pagamento). */
    let paid = false, tx = null;
    try {
      const r = await profanus("/api/pix/" + encodeURIComponent(evt.external_id));
      tx = r.ok ? r.data : null;
      paid = !!tx && tx.status === "paid";
    } catch (e) { return res.status(500).end(); } // 5xx => o Profanus reenvia
    if (paid) {
      console.log("pagamento confirmado", evt.external_id, tx.amount);
      /* Atualiza o painel (idempotente por order_ref; o painel mantém cliente e UTMs já salvos). */
      await sendToPanel({ event: "order_paid", ref: evt.external_id, amount: Number(tx.amount), paidAt: tx.paid_at });
    }
  }

  return res.status(200).json({ received: true });
};
