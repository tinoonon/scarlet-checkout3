/* ===== Página de pagamento confirmado ===== */
(function () {
  mountShell();

  var orderId = getParam("id");
  var order = orderId ? getOrder(orderId) : null;
  var main = document.getElementById("main");

  if (!order) {
    main.innerHTML = '<div class="not-found"><section class="card"><h2 class="card-title">Pedido não encontrado</h2>' +
      '<a href="index.html" class="link-success" style="text-decoration:underline">Voltar ao checkout</a></section></div>';
    return;
  }

  function addBusinessDays(from, n) {
    var d = new Date(from);
    while (n > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) n--;
    }
    return d;
  }

  var c = order.customer;
  var ship = getShipping(order.shippingId);
  var paid = new Date(order.paidAt || Date.now());
  var eta = addBusinessDays(paid, ship.maxDays).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  var paidStr = paid.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  var firstName = c.name.split(" ")[0];

  var rows = [
    ["Número do pedido", "<b>#" + esc(order.id) + "</b>"],
    ["Data e hora do pagamento", esc(paidStr)],
    ["Forma de pagamento", "Pix"],
    ["Valor pago", '<b style="color:var(--success)">' + formatBRL(order.total) + "</b>"],
    ["Status", '<span class="paid-pill">PAGO</span>']
  ].map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");

  var next = [
    ["mail", "Você receberá a confirmação por e-mail"],
    ["message", "Enviaremos o código de rastreio pelo WhatsApp"],
    ["search", "Acompanhe seu pedido a qualquer momento"]
  ].map(function (n) { return '<li><span class="ic">' + icon(n[0]) + "</span>" + n[1] + "</li>"; }).join("");

  var colors = ["var(--success)", "var(--footer)", "oklch(0.85 0.15 85)", "var(--destructive)"];
  var confetti = "";
  for (var i = 0; i < 36; i++) {
    confetti += '<span style="left:' + ((i * 37) % 100) + "%;animation-delay:" + ((i % 9) * 0.12) + "s;background:" + colors[i % 4] + '"></span>';
  }

  main.innerHTML =
    '<div class="confetti" aria-hidden="true">' + confetti + "</div>" +
    '<div class="container layout"><div class="stack">' +
    '<section class="card"><div class="confirm-head"><span class="big-check">' + icon("check") + "</span>" +
    "<h1>Pagamento confirmado!</h1>" +
    "<p>Obrigado pela sua compra, " + esc(firstName) + "! Seu kit de aniversário 10 anos Scarlet já está sendo preparado.</p></div>" +
    '<dl class="dl">' + rows + "</dl></section>" +

    '<section class="card"><h2 class="card-title">Entrega</h2>' +
    '<p class="addr">' + esc(c.street) + ", " + esc(c.number) + (c.complement ? " — " + esc(c.complement) : "") + "</p>" +
    '<p class="addr">' + [esc(c.district), c.city ? esc(c.city) + (c.uf ? "/" + esc(c.uf) : "") : "", "CEP " + esc(c.cep)].filter(Boolean).join(" · ") + "</p>" +
    '<div class="eta-line">' + icon("truck") + esc(ship.name) + " — " + esc(ship.eta) + "</div>" +
    '<p class="eta-day">Previsão de entrega: <b>até ' + esc(eta) + "</b></p></section>" +

    '<section class="card"><h2 class="card-title">Próximos passos</h2><ul class="next">' + next + "</ul>" +
    '<div class="btn-row"><button type="button" class="btn btn-primary" id="track-btn">Acompanhar pedido</button>' +
    '<a href="https://wa.me/" target="_blank" rel="noreferrer" class="btn btn-outline">Falar no WhatsApp</a></div></section>' +
    '</div><aside class="aside" id="aside"></aside></div>';

  mountAside(ship.price, order.total);

  /* Remove o confete depois da animação */
  setTimeout(function () {
    var el = document.querySelector(".confetti");
    if (el) el.remove();
  }, 5000);

  /* Botão "Acompanhar pedido": ainda sem destino. Defina o link de rastreio aqui. */
  document.getElementById("track-btn").addEventListener("click", function () {
    toast("Em breve você poderá acompanhar seu pedido por aqui.");
  });
})();
