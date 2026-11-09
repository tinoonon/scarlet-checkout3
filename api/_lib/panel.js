/* Envia eventos de pedido para o Scarlet Admin (painel).
   Variáveis de ambiente: PANEL_URL (URL completa do endpoint /api/public/ingest), PANEL_API_KEY, PANEL_STORE (opcional). */

const STORE = process.env.PANEL_STORE || "scarlet-2";
const str = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);

/* O Pix regenerado usa ref "SC-XXXX-2": no painel é o mesmo pedido, então usamos a ref base. */
const baseRef = (ref) => String(ref).replace(/-\d{1,2}$/, "");

async function sendToPanel({ event, ref, amount, shippingName, paidAt, customer, tracking, ip, userAgent }) {
  const url = process.env.PANEL_URL;
  const key = process.env.PANEL_API_KEY;
  if (!url || !key) { console.warn("PANEL_URL/PANEL_API_KEY não configuradas — venda não enviada ao painel"); return false; }
  const c = customer || {};
  const t = tracking || {};
  const body = {
    event,
    store: STORE,
    order_ref: baseRef(ref),
    amount,
    shipping_method: shippingName,
    paid_at: event === "order_paid" ? new Date(paidAt || Date.now()).toISOString() : undefined,
    customer: { name: str(c.name), email: str(c.email), phone: str(c.phone), cpf: str(c.cpf) },
    address: { cep: str(c.cep), street: str(c.street), number: str(c.number), complement: str(c.complement), district: str(c.district), city: str(c.city), state: str(c.uf) },
    tracking: {
      src: str(t.src), sck: str(t.sck), utm_source: str(t.utm_source), utm_medium: str(t.utm_medium),
      utm_campaign: str(t.utm_campaign), utm_content: str(t.utm_content), utm_term: str(t.utm_term)
    },
    ip: str(ip), user_agent: str(userAgent)
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) console.error("painel erro", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.error("painel falhou", e && e.message);
    return false;
  }
}

module.exports = { sendToPanel };
