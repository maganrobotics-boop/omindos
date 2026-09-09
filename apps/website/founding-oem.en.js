(() => {
  const form = document.getElementById("oem-application-form");
  const copyButton = document.getElementById("copy-application");
  const status = document.getElementById("form-status");
  if (!form || !copyButton || !status) return;
  let applicationText = "";
  const val = (data, key) => String(data.get(key) || "Not provided").trim() || "Not provided";
  const build = () => {
    const data = new FormData(form);
    return ["OmindOS — Founding OEM Partner Application", "", `Company: ${val(data,"company")}`, `Contact: ${val(data,"contact")}`, `Work email: ${val(data,"email")}`, `Phone / WhatsApp / WeChat: ${val(data,"phone")}`, "", `Track: ${val(data,"track")}`, `Robot type / model: ${val(data,"robot")}`, `Operating system & interfaces: ${val(data,"stack")}`, `Preferred start: ${val(data,"start")}`, `Expected quantity: ${val(data,"quantity")}`, `Test unit & documentation: ${val(data,"test_unit")}`, "", "Current and target capabilities:", val(data,"capabilities"), "", "Additional project notes:", val(data,"summary"), "", "I understand that applying does not confirm a partner slot or create a delivery commitment; project start requires at least 20 Foundation software licenses or 10 Advanced software licenses; final cooperation is governed by written agreement."].join("\n");
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); status.textContent = "Please complete all required fields."; return; }
    applicationText = build(); copyButton.disabled = false;
    const data = new FormData(form);
    status.textContent = "Application email generated. If your email app does not open, copy the application and send it to sales@omindos.ai.";
    window.location.href = `mailto:sales@omindos.ai?subject=${encodeURIComponent(`OriginMind™ OEM Application | ${data.get("company")}`)}&body=${encodeURIComponent(applicationText)}`;
  });
  copyButton.addEventListener("click", async () => {
    if (!applicationText) applicationText = build();
    try { await navigator.clipboard.writeText(applicationText); }
    catch { const helper = document.createElement("textarea"); helper.value = applicationText; helper.style.position = "fixed"; helper.style.opacity = "0"; document.body.append(helper); helper.select(); document.execCommand("copy"); helper.remove(); }
    status.textContent = "Application copied. Please send it to sales@omindos.ai.";
  });
})();

