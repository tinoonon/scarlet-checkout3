const { sendToUtmify } = require("./_lib/utmify");
const { SUBTOTAL, SHIPPING, REF_RE, profanus, publicBaseUrl, round2 } = require("./_lib/shared");

/* POST /api/pix-create  { ref, shippingId }  ->  { id, ref, total, pixCode, expiresAt, status } */
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { ref, shippingId, customer, tracking } = req.body || {};
  if (typeof ref !== "string" || !REF_RE.test(ref)) return res.status(400).json({ error: "Pedido inválido" });
  const ship = SHIPPING[shippingId];
  if (!ship) return res.status(400).json({ error: "Forma de entrega inválida" });

  const amount = round2(SUBTOTAL + ship.price);

  try {
    let r = await profanus("/api/pix/create", {
      method: "POST",
      body: {
        amount,
        description: "Scarlet " + ref,
        external_id: ref,
        webhook_url: publicBaseUrl(req) + "/api/webhook",
        expiration: 1800
      }
    });

    let tx = r.ok ? r.data.transaction : null;

    /* 409: external_id já existe e não pôde ser devolvido -> busca a cobrança existente */
    if (!tx && r.status === 409) {
      const g = await profanus("/api/pix/" + encodeURIComponent(ref));
      if (g.ok) tx = g.data;
    }

    if (!tx || !tx.pix_copia_cola) {
      console.error("profanus create falhou", r.status, JSON.stringify(r.data).slice(0, 300));
      const code = r.status === 401 ? 500 : 502;
      return res.status(code).json({ error: "Não foi possível gerar o Pix. Tente novamente." });
    }

    /* Idempotência devolve a cobrança antiga: garante que o valor bate com o frete escolhido */
    if (Math.abs(Number(tx.amount) - amount) > 0.001) {
      return res.status(409).json({ error: "Este pedido já foi criado com outro valor. Recarregue a página." });
    }
    if (tx.status === "paid") {
      return res.status(200).json({ id: ref, ref, total: amount, pixCode: tx.pix_copia_cola, expiresAt: tx.expires_at, status: "paid" });
    }

    /* Venda gerada: avisa o Utmify (await porque a função serverless congela após responder) */
    await sendToUtmify({
      ref, status: "waiting_payment", total: amount, customer, tracking,
      ip: (req.headers["x-forwarded-for"] || "").split(",")[0] || undefined
    });

    return res.status(200).json({
      id: ref, ref, total: amount,
      pixCode: tx.pix_copia_cola,
      expiresAt: tx.expires_at,
      status: tx.status
    });
  } catch (e) {
    console.error("pix-create erro", e && e.message);
    return res.status(502).json({ error: "Não foi possível gerar o Pix. Tente novamente." });
  }
};
