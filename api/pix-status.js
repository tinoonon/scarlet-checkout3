const { REF_RE, profanus } = require("./_lib/shared");

/* GET /api/pix-status?ref=SC-XXXX  ->  { status: pending|paid|expired|cancelled|unknown, paidAt } */
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const ref = req.query && req.query.ref;
  if (typeof ref !== "string" || !REF_RE.test(ref)) return res.status(400).json({ error: "Pedido inválido" });

  try {
    const r = await profanus("/api/pix/" + encodeURIComponent(ref));
    if (r.status === 404) return res.status(200).json({ status: "unknown" });
    if (!r.ok) return res.status(502).json({ error: "Gateway indisponível" });
    /* Devolve só o necessário — nada de dados do pagador. */
    return res.status(200).json({ status: r.data.status, paidAt: r.data.paid_at || null });
  } catch (e) {
    console.error("pix-status erro", e && e.message);
    return res.status(502).json({ error: "Gateway indisponível" });
  }
};
