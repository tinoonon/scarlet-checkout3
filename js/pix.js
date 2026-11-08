/* ===== Página do Pix ===== */
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

  var steps = ["Dados", "Entrega", "Pagamento"].map(function (s, i) {
    return '<li class="' + (i === 2 ? "active" : "") + '"><span class="dot">' + (i < 2 ? icon("check") : i + 1) + "</span>" +
      "<span>" + s + "</span>" + (i < 2 ? '<span class="line"></span>' : "") + "</li>";
  }).join("");

  var how = [
    "Abra o app do seu banco e escolha pagar com Pix.",
    "Escaneie o QR Code ou cole o código copiado.",
    "Confira os dados e confirme o pagamento.",
    "Pronto! A confirmação é instantânea e você será redirecionado automaticamente."
  ].map(function (t, i) { return '<li><span class="n">' + (i + 1) + "</span>" + t + "</li>"; }).join("");

  main.innerHTML =
    '<div class="container layout"><div class="stack"><section class="card">' +
    '<ol class="steps">' + steps + "</ol>" +
    '<h1 class="h1">Falta pouco! Finalize seu pagamento via Pix</h1>' +
    '<span class="status" id="status">' + icon("clock") + '<span id="status-text">Aguardando pagamento</span></span>' +
    '<div class="timer-box" id="timer-box"></div>' +
    '<div class="order-line"><p class="o">Pedido <b>#' + esc(order.id) + '</b>' +
    '<button type="button" id="copy-order" aria-label="Copiar número do pedido">' + icon("copy") + "</button></p>" +
    '<p class="val">Valor: ' + formatBRL(order.total) + "</p></div>" +
    '<div id="pay-area"></div>' +
    '<h2 class="h2">Como pagar</h2><ol class="how">' + how + "</ol>" +
    '<div class="notice">Não feche esta página. Assim que o pagamento for identificado, você será redirecionado automaticamente.</div>' +
    '<button type="button" class="btn btn-outline check-btn" id="check-btn">Já paguei, verificar pagamento</button>' +
    '<p class="help">Precisa de ajuda? <a href="https://wa.me/" target="_blank" rel="noreferrer">Fale com a gente pelo WhatsApp.</a></p>' +
    '</section></div><aside class="aside" id="aside"></aside></div>';

  mountAside(getShipping(order.shippingId).price, order.total);

  /* ---------- QR Code (SVG) ---------- */
  function qrSVG(text) {
    var m = makeQR(text), n = m.length, q = 2, size = n + q * 2, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (m[r][c]) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z";
    }
    return '<svg class="qr" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="QR Code Pix">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  function renderPay() {
    var area = document.getElementById("pay-area");
    if (Date.now() >= order.expiresAt) { area.innerHTML = ""; return; }
    area.innerHTML =
      '<div class="qr-wrap">' + qrSVG(order.pixCode) + '<span class="qr-logo">' + pixIcon() + "</span></div>" +
      '<p class="copy-label">Ou copie o código Pix (copia e cola)</p>' +
      '<input class="code-input" id="code" readonly aria-label="Código Pix copia e cola" value="' + esc(order.pixCode) + '">' +
      '<button type="button" class="btn btn-primary copy-btn" id="copy-code">' + icon("copy") + " Copiar código Pix</button>";
    document.getElementById("copy-code").addEventListener("click", copyCode);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve) {
      var t = document.createElement("textarea");
      t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch (e) {}
      t.remove(); resolve();
    });
  }
  function copyCode() {
    var b = document.getElementById("copy-code");
    copyText(order.pixCode).then(function () {
      toast("Código Pix copiado!");
      b.innerHTML = icon("check") + " Código copiado!";
      setTimeout(function () { b.innerHTML = icon("copy") + " Copiar código Pix"; }, 3000);
    });
  }
  document.getElementById("copy-order").addEventListener("click", function () {
    copyText(order.id).then(function () { toast("Número do pedido copiado"); });
  });

  /* ---------- Contagem regressiva ---------- */
  var wasExpired = null;
  function tick() {
    var left = Math.max(0, order.expiresAt - Date.now());
    var expired = left === 0;
    var box = document.getElementById("timer-box");

    if (expired !== wasExpired) {
      wasExpired = expired;
      var st = document.getElementById("status");
      st.classList.toggle("expired", expired);
      document.getElementById("status-text").textContent = expired ? "Pix expirado" : "Aguardando pagamento";
      if (expired) {
        box.innerHTML = '<p class="expired-title">Pix expirado</p>' +
          '<button type="button" class="btn btn-primary" id="regen">' + icon("refresh") + " Gerar novo Pix</button>";
        document.getElementById("regen").addEventListener("click", function () {
          var rb = this;
          rb.disabled = true;
          regeneratePix(order.id).then(function (o) {
            if (o) order = o;
            wasExpired = null; renderPay(); tick();
          }).catch(function () {
            rb.disabled = false;
            toast("Não foi possível gerar um novo Pix. Tente novamente.");
          });
        });
      } else {
        box.innerHTML = '<p class="l">Seu Pix expira em</p><p class="timer" id="timer" aria-live="polite"></p>' +
          '<div class="bar" id="bar"><div id="bar-fill"></div></div>';
      }
      renderPay();
    }
    if (!expired) {
      var mm = String(Math.floor(left / 60000)).padStart(2, "0");
      var ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
      var urgent = left < 5 * 60000;
      var t = document.getElementById("timer");
      t.textContent = mm + ":" + ss;
      t.setAttribute("aria-label", mm + " minutos e " + ss + " segundos");
      t.classList.toggle("urgent", urgent);
      document.getElementById("bar").classList.toggle("urgent", urgent);
      document.getElementById("bar-fill").style.width = (left / PIX_DURATION_MS) * 100 + "%";
    }
  }
  tick();
  setInterval(tick, 1000);

  /* ---------- Verificação de pagamento (a cada 5s) ---------- */
  function check(manual) {
    var b = document.getElementById("check-btn");
    if (manual) { b.disabled = true; b.innerHTML = icon("loader", "spin") + " Já paguei, verificar pagamento"; }
    getOrderStatus(order.id).then(function (s) {
      if (manual) {
        b.disabled = false; b.textContent = "Já paguei, verificar pagamento";
        if (s !== "paid") toast("Ainda não identificamos seu pagamento.");
      }
      if (s === "paid") location.href = "confirmado.html?id=" + encodeURIComponent(order.id);
    });
  }
  setInterval(function () { check(false); }, 5000);
  document.getElementById("check-btn").addEventListener("click", function () { check(true); });
})();
