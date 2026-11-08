/* Envia pedidos para a API do Utmify (venda gerada = waiting_payment, venda paga = paid).
   Os scripts de pixel só registram visitas; a venda precisa ser enviada pelo servidor.
   Variável de ambiente: UTMIFY_API_TOKEN (Utmify > Integrações > Credenciais de API). */

const pad = (n) => String(n).padStart(2, "0");
function utcStamp(d) {
  d = d ? new Date(d) : new Date();
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " +
    pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
}
const str = (v) => (typeof v === "string" && v ? v.slice(0, 300) : null);

async function sendToUtmify({ ref, status, total, customer, tracking, createdAt, paidAt, ip }) {
  const token = process.env.UTMIFY_API_TOKEN;
  if (!token) { console.warn("UTMIFY_API_TOKEN não configurada — venda não enviada ao Utmify"); return false; }
  const c = customer || {};
  const t = tracking || {};
  const cents = Math.round(total * 100);
  const body = {
    orderId: ref,
    platform: "Scarlet",
    paymentMethod: "pix",
    status,
    createdAt: utcStamp(createdAt),
    approvedDate: status === "paid" ? utcStamp(paidAt) : null,
    refundedAt: null,
    customer: {
      name: str(c.name) || "Cliente",
      email: str(c.email) || "",
      phone: (c.phone || "").replace(/\D/g, "") || null,
      document: (c.cpf || "").replace(/\D/g, "") || null,
      country: "BR",
      ip: ip || undefined
    },
    products: [{ id: "kit-scarlet", name: process.env.UTMIFY_PRODUCT_NAME || "Kit de aniversário 10 anos Scarlet", planId: null, planName: null, quantity: 1, priceInCents: cents }],
    trackingParameters: {
      src: str(t.src), sck: str(t.sck), utm_source: str(t.utm_source), utm_campaign: str(t.utm_campaign),
      utm_medium: str(t.utm_medium), utm_content: str(t.utm_content), utm_term: str(t.utm_term)
    },
    commission: { totalPriceInCents: cents, gatewayFeeInCents: 0, userCommissionInCents: cents },
    isTest: false
  };
  try {
    const res = await fetch("https://api.utmify.com.br/api-credentials/orders", {
      method: "POST",
      headers: { "x-api-token": token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) console.error("utmify erro", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.error("utmify falhou", e && e.message);
    return false;
  }
}

module.exports = { sendToUtmify };
