/* ===== Página de checkout ===== */
(function () {
  mountShell();

  var form = document.getElementById("checkout-form");
  var chosen = "pac";      /* opção marcada (padrão PAC) */
  var shippingId = null;   /* só vale depois que o endereço estiver completo */
  var touched = {};

  /* Regras de validação (campo -> [função, mensagem]) */
  var RULES = {
    name: [function (v) { return v.trim().length >= 3; }, "Informe seu nome completo"],
    email: [isValidEmail, "E-mail inválido"],
    cpf: [isValidCPF, "CPF inválido"],
    phone: [isValidPhone, "Celular inválido"],
    cep: [isValidCEP, "CEP inválido"],
    street: [function (v) { return v.trim().length >= 3; }, "Informe o endereço"],
    number: [function (v) { return v.trim().length >= 1; }, "Obrigatório"],
    district: [function (v) { return v.trim().length >= 2; }, "Informe o bairro"]
  };
  /* Estes campos ficam brancos mesmo quando válidos (igual ao layout original) */
  ["cep", "street", "district"].forEach(function (k) { fieldEl(k).classList.add("nofill"); });

  var ADDRESS_KEYS = ["cep", "street", "number", "district"];

  function fieldEl(k) { return form.querySelector('[data-field="' + k + '"]'); }
  function input(k) { return document.getElementById(k); }

  function nameError(v) {
    if (v.trim().length < 3) return RULES.name[1];
    if (v.trim().indexOf(" ") === -1) return "Informe nome e sobrenome";
    return "";
  }
  function errorOf(k) {
    var v = input(k).value;
    if (k === "name") return nameError(v);
    return RULES[k][0](v) ? "" : RULES[k][1];
  }
  function paint(k, showError) {
    var el = fieldEl(k), v = input(k).value, err = errorOf(k);
    el.classList.toggle("valid", !err && !!v);
    var bad = showError && !!err;
    el.classList.toggle("invalid", bad);
    el.querySelector(".error").textContent = bad ? err : "";
    input(k).setAttribute("aria-invalid", bad);
    if (k === "cep") document.getElementById("cep-row").classList.toggle("has-error", bad);
    if (ADDRESS_KEYS.indexOf(k) !== -1) syncShipping();
  }

  Object.keys(RULES).forEach(function (k) {
    var el = input(k);
    el.addEventListener("blur", function () { touched[k] = true; paint(k, true); });
    el.addEventListener("input", function () {
      if (k === "cpf") el.value = maskCPF(el.value);
      if (k === "phone") el.value = maskPhone(el.value);
      if (k === "cep") { el.value = maskCEP(el.value); onCep(el.value); }
      paint(k, !!touched[k]);
    });
  });

  /* CEP -> ViaCEP preenche rua, bairro e cidade */
  var city = "", uf = "";
  function onCep(masked) {
    var label = document.getElementById("city-label");
    city = ""; uf = "";
    if (!isValidCEP(masked)) { label.textContent = ""; return; }
    touched.cep = true;
    fetchCep(masked).then(function (r) {
      if (input("cep").value !== masked) return;
      if (!r) { label.textContent = "CEP não encontrado"; return; }
      label.textContent = r.localidade + "/" + r.uf;
      city = r.localidade; uf = r.uf;
      if (r.logradouro) { input("street").value = r.logradouro; paint("street", true); }
      if (r.bairro) { input("district").value = r.bairro; paint("district", true); }
    });
  }

  /* Formas de entrega */
  var list = document.getElementById("shipping-list");
  function renderShipping() {
    list.innerHTML = SHIPPING_OPTIONS.map(function (o) {
      var sel = o.id === chosen;
      return '<label class="ship' + (sel ? " selected" : "") + '">' +
        '<input type="radio" name="shipping" value="' + o.id + '"' + (sel ? " checked" : "") + ">" +
        '<span class="radio"></span>' +
        '<span class="ship-ico">' + icon("box") + "</span>" +
        '<span class="ship-info"><span class="ship-name">' + o.name + '</span><span class="ship-eta">' + o.eta + "</span></span>" +
        '<span class="ship-price">' + formatBRL(o.price) + "</span></label>";
    }).join("");
  }
  list.addEventListener("change", function (e) {
    chosen = e.target.value;
    shippingId = chosen;
    renderShipping();
    refreshTotals();
  });
  function refreshTotals() {
    if (!shippingId) {
      document.getElementById("pix-value").textContent = "Valor: informe o endereço para calcular o frete";
      updateSummary(null, null);
      return;
    }
    var total = orderTotal(shippingId);
    document.getElementById("pix-value").textContent = "Valor: " + formatBRL(total);
    updateSummary(getShipping(shippingId).price, total);
  }

  /* As formas de entrega só aparecem quando CEP, rua, número e bairro estão preenchidos e válidos. */
  var shipBox = document.getElementById("shipping-box");
  function addressComplete() {
    return ADDRESS_KEYS.every(function (k) { return !errorOf(k); });
  }
  function syncShipping() {
    var ok = addressComplete();
    shipBox.classList.toggle("hidden", !ok);
    var next = ok ? chosen : null;
    if (next !== shippingId) { shippingId = next; refreshTotals(); }
  }

  renderShipping();
  mountAside(null, null);
  syncShipping();
  refreshTotals();

  /* Envio */
  var btn = document.getElementById("submit-btn");
  var btnIcon = document.getElementById("submit-icon");
  var btnText = document.getElementById("submit-text");
  var errBox = document.getElementById("pix-error");
  function setLoading(on) {
    btn.disabled = on;
    btnIcon.innerHTML = on ? icon("loader", "spin") : icon("lock");
    btnText.textContent = on ? "Gerando Pix..." : "Confirmar compra";
  }
  setLoading(false);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errBox.classList.add("hidden");
    var firstBad = null;
    Object.keys(RULES).forEach(function (k) {
      touched[k] = true; paint(k, true);
      if (!firstBad && errorOf(k)) firstBad = k;
    });
    if (firstBad) { input(firstBad).focus(); return; }
    if (!shippingId) { input("cep").focus(); return; }

    var data = {
      name: input("name").value.trim(), email: input("email").value.trim(),
      cpf: input("cpf").value, phone: input("phone").value, cep: input("cep").value,
      street: input("street").value.trim(), number: input("number").value.trim(),
      district: input("district").value.trim(), complement: input("complement").value.trim(),
      city: city, uf: uf
    };
    setLoading(true);
    createCheckout(data, shippingId).then(function (order) {
      location.href = "pix.html?id=" + encodeURIComponent(order.id);
    }).catch(function () {
      setLoading(false);
      errBox.classList.remove("hidden");
    });
  });
})();
