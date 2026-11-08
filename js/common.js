/* ===== Scarlet Checkout — código compartilhado ===== */
/* Pix real via Profanus Pay: a chave fica no servidor (pasta /api). */

var SUBTOTAL = 0;

var SHIPPING_OPTIONS = [
  { id: "pac", name: "PAC", eta: "4 a 6 dias úteis", price: 22.34, maxDays: 6 },
  { id: "sedex", name: "SEDEX", eta: "2 a 3 dias úteis", price: 26.77, maxDays: 3 },
  { id: "expresso", name: "SEDEX Expresso", eta: "1 a 2 dias úteis", price: 34.81, maxDays: 2 }
];

function getShipping(id) {
  return SHIPPING_OPTIONS.find(function (o) { return o.id === id; }) || SHIPPING_OPTIONS[0];
}
function orderTotal(shippingId) {
  return Math.round((SUBTOTAL + getShipping(shippingId).price) * 100) / 100;
}
function formatBRL(v) {
  return "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/* ---------- Máscaras e validações ---------- */
function digits(v) { return v.replace(/\D/g, ""); }

function maskCPF(v) {
  return digits(v).slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskPhone(v) {
  var d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";
  if (d.length <= 7) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}
function maskCEP(v) {
  var d = digits(v).slice(0, 8);
  return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
}
function isValidCPF(v) {
  var d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  function calc(len) {
    var sum = 0;
    for (var i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    var r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
function isValidPhone(v) { return digits(v).length === 11; }
function isValidCEP(v) { return digits(v).length === 8; }
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }

function fetchCep(cep) {
  return fetch("https://viacep.com.br/ws/" + digits(cep) + "/json/")
    .then(function (r) { return r.json(); })
    .then(function (j) { return j.erro ? null : j; })
    .catch(function () { return null; });
}

/* ---------- GATEWAY (Profanus Pay via /api) ---------- */
var PIX_DURATION_MS = 30 * 60 * 1000;
var STORAGE_KEY = "scarlet-orders";

function readAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { return {}; }
}
function saveOrder(o) {
  var all = readAll();
  all[o.id] = o;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) {}
}
function getOrder(id) { return readAll()[id] || null; }

function randomCode(len) {
  var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", out = "";
  var buf = new Uint8Array(len);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  for (var i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function apiPost(url, body) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "Erro ao gerar pagamento PIX");
        return j;
      });
    });
}

/* Um id por frete escolhido: se o envio falhar e a pessoa tentar de novo, reaproveita o mesmo
   id e o Profanus devolve a mesma cobrança (idempotência por external_id) em vez de criar outra. */
var ATTEMPTS = {};
function createCheckout(customer, shippingId) {
  var id = ATTEMPTS[shippingId] || (ATTEMPTS[shippingId] = "SC-" + randomCode(10));
  return apiPost("/api/pix-create", { ref: id, shippingId: shippingId }).then(function (r) {
    var order = {
      id: id, ref: id, attempt: 1, customer: customer, shippingId: shippingId, total: r.total,
      pixCode: r.pixCode, createdAt: Date.now(), expiresAt: Date.parse(r.expiresAt)
    };
    if (r.status === "paid") order.paidAt = Date.now();
    saveOrder(order);
    return order;
  });
}

/* Pix expirado: cria uma nova cobrança (novo external_id derivado do pedido). */
function regeneratePix(id) {
  var o = getOrder(id);
  if (!o) return Promise.resolve(null);
  var n = (o.attempt || 1) + 1;
  var ref = o.id + "-" + n;
  return apiPost("/api/pix-create", { ref: ref, shippingId: o.shippingId }).then(function (r) {
    o.ref = ref; o.attempt = n; o.pixCode = r.pixCode;
    o.createdAt = Date.now(); o.expiresAt = Date.parse(r.expiresAt);
    saveOrder(o);
    return o;
  });
}

/* Consulta o status real no gateway. Resolve "pending" | "paid" | "expired". */
function getOrderStatus(id) {
  var o = getOrder(id);
  if (!o) return Promise.resolve("expired");
  if (o.paidAt) return Promise.resolve("paid");
  return fetch("/api/pix-status?ref=" + encodeURIComponent(o.ref))
    .then(function (r) { return r.ok ? r.json() : { status: "pending" }; })
    .then(function (j) {
      if (j.status === "paid") {
        o.paidAt = j.paidAt ? Date.parse(j.paidAt) : Date.now();
        saveOrder(o);
        return "paid";
      }
      if (j.status === "expired" || j.status === "cancelled") return "expired";
      return "pending";
    })
    .catch(function () { return "pending"; });
}

/* ---------- Ícones (SVG inline) ---------- */
var ICONS = {
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  search: '<path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/><circle cx="18.5" cy="15.5" r="2.5"/><path d="M20.27 17.27 22 19"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'
};
function icon(name, cls) {
  return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>";
}
function pixIcon(cls) {
  return '<svg class="pix-icon ' + (cls || "") + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z" opacity=".25"/><path d="M12 6.2 17.8 12 12 17.8 6.2 12z"/></svg>';
}

/* ---------- Partes comuns da página ---------- */
function headerHTML() {
  return '<header class="header"><div class="container">' +
    '<span class="logo">SCARLET</span>' +
    '<div class="secure-top">' + icon("lock") + "<span>Pagamento<br>100% seguro</span></div>" +
    "</div></header>";
}
function counterHTML() {
  return '<div class="live">' + icon("cart") +
    '<p aria-live="polite"><b id="live-n">7</b> pessoas finalizando a compra neste momento.</p></div>';
}
function footerHTML() {
  var chips = [
    ["Visa", '<span style="font-size:9px;font-weight:900;font-style:italic">VISA</span>', ""],
    ["Mastercard", '<span style="display:flex"><span style="width:12px;height:12px;border-radius:50%;background:var(--destructive)"></span><span style="width:12px;height:12px;margin-left:-6px;border-radius:50%;background:oklch(0.8 0.16 75)"></span></span>', ""],
    ["American Express", '<span style="font-size:5px;font-weight:700;line-height:1">AMERICAN<br>EXPRESS</span>', "background:oklch(0.55 0.15 250);color:#fff"],
    ["Elo", '<span style="font-size:9px;font-weight:700">elo</span>', "background:var(--foreground);color:#fff"],
    ["Diners", '<span style="width:12px;height:12px;border-radius:50%;border:2px solid oklch(0.45 0.12 250)"></span>', ""],
    ["Pix", pixIcon(), ""],
    ["Boleto", '<span style="width:24px;height:8px;background:linear-gradient(var(--destructive) 50%,oklch(0.85 0.16 90) 50%)"></span>', ""],
    ["Discover", '<span style="font-size:5px;font-weight:700">DISCOVER</span>', "background:oklch(0.35 0.03 60);color:#fff"]
  ];
  return '<footer class="footer"><p>Formas de pagamento:</p><ul>' +
    chips.map(function (c) {
      return '<li class="chip" title="' + c[0] + '" aria-label="' + c[0] + '" style="' + c[2] + '">' + c[1] + "</li>";
    }).join("") +
    "</ul><p>Scarlett 2026</p></footer>";
}
function moneyOr(v, alt) { return v == null ? alt : formatBRL(v); }
function summaryHTML(shipping, total) {
  return '<section class="card summary open" id="summary">' +
    '<button type="button" class="summary-head" id="summary-toggle" aria-expanded="true">' +
    "<h2>Resumo do pedido</h2>" +
    '<span class="right"><span class="pill">1 item</span><strong>' + moneyOr(total, "—") + "</strong>" + icon("chevron", "chev") + "</span></button>" +
    '<div class="summary-body"><div class="totals">' +
    '<div class="row"><span>Subtotal</span><span>' + formatBRL(SUBTOTAL) + "</span></div>" +
    '<div class="row"><span>Frete</span><span id="sum-ship">' + moneyOr(shipping, "A calcular") + "</span></div><hr>" +
    '<div class="total"><span>Total</span><span id="sum-total">' + moneyOr(total, "—") + "</span></div></div>" +
    '<div class="item"><img src="img/produto2.png" alt="Kit de produtos Scarlet" width="66" height="66" loading="lazy">' +
    '<div><p class="n">Opção 2</p><p class="p">' + formatBRL(SUBTOTAL) + '</p><p class="q">Qtd: 1</p></div></div>' +
    "</div></section>";
}
function secureBadgeHTML() {
  return '<div class="secure-badge"><div>' + icon("shield") + "Ambiente seguro</div></div>";
}

/* Monta header, contador e rodapé; liga o resumo colapsável e o contador. */
function mountShell() {
  var h = document.getElementById("site-header"); if (h) h.innerHTML = headerHTML();
  var c = document.getElementById("site-counter"); if (c) c.innerHTML = counterHTML();
  var f = document.getElementById("site-footer"); if (f) f.innerHTML = footerHTML();
  var n = document.getElementById("live-n");
  if (n) setInterval(function () { n.textContent = 4 + Math.floor(Math.random() * 9); }, 4000);
}
function mountAside(shipping, total) {
  var a = document.getElementById("aside");
  if (!a) return;
  a.innerHTML = summaryHTML(shipping, total) + secureBadgeHTML();
  var box = document.getElementById("summary");
  var btn = document.getElementById("summary-toggle");
  btn.addEventListener("click", function () {
    var open = box.classList.toggle("open");
    btn.setAttribute("aria-expanded", open);
  });
}
function updateSummary(shipping, total) {
  document.getElementById("sum-ship").textContent = moneyOr(shipping, "A calcular");
  document.getElementById("sum-total").textContent = moneyOr(total, "—");
  var s = document.querySelector("#summary .summary-head strong");
  if (s) s.textContent = moneyOr(total, "—");
}

function toast(msg) {
  var t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2500);
}
function getParam(name) { return new URLSearchParams(location.search).get(name); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
