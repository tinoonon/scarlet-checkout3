const { REF_RE, SHIPPING, SUBTOTAL, profanus, round2 } = require("./_lib/shared");
const { sendToUtmify } = require("./_lib/utmify");

/* POST /api/track-paid { ref, shippingId, customer, tracking }
   Confirma no Profanus que o Pix está pago e só então avisa o Utmify (o Utmify trata orderId repetido como atualização). */
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const { ref, shippingId, customer, tracking } = req.body || {};
  if (typeof ref !== "string" || !REF_RE.test(ref) || !SHIPPING[shippingId]) return res.status(400).json({ error: "Pedido inválido" });
  try {
    const r = await profanus("/api/pix/" + encodeURIComponent(ref));
    if (!r.ok || r.data.status !== "paid") return res.status(200).json({ sent: false });
    const ok = await sendToUtmify({
      ref, status: "paid", total: round2(SUBTOTAL + SHIPPING[shippingId].price), customer, tracking,
      createdAt: r.data.created_at, paidAt: r.data.paid_at, ip: (req.headers["x-forwarded-for"] || "").split(",")[0] || undefined
    });
    return res.status(200).json({ sent: ok });
  } catch (e) {
    return res.status(502).json({ error: "falha" });
  }
};
