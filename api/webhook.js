const crypto = require("crypto");
const { profanus } = require("./_lib/shared");

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
    /* Sem segredo configurado a assinatura não vem: confirma direto na API antes de confiar. */
    let paid = !!secret;
    if (!paid) {
      try {
        const r = await profanus("/api/pix/" + encodeURIComponent(evt.external_id));
        paid = r.ok && r.data.status === "paid";
      } catch (e) { return res.status(500).end(); } // 5xx => o Profanus reenvia
    }
    if (paid) {
      /* PONTO DE GANCHO: aqui entra o que acontece quando o pedido é pago
         (e-mail, planilha, notificação no WhatsApp...). Deve ser idempotente por external_id. */
      console.log("pagamento confirmado", evt.external_id, evt.amount);
    }
  }

  return res.status(200).json({ received: true });
};
