(() => {
  "use strict";
  const form = document.getElementById("oem-application-form");
  const copyButton = document.getElementById("copy-application");
  const status = document.getElementById("form-status");
  if (!form || !copyButton || !status) return;
  const language = document.documentElement.lang.startsWith("zh") ? "zh" : document.documentElement.lang.startsWith("ja") ? "ja" : "en";
  const copy = {
    zh: { required: "请填写所有必填信息，并确认隐私说明。", sending: "正在提交，请稍候…", success: "申请已收到。回执编号：", followup: "我们会通过您填写的邮箱联系您。申请不代表席位确认或付款承诺。", failed: "暂未确认提交成功。请重试；重复提交不会生成重复申请。也可复制内容发送至 sales@omindos.ai。", limited: "提交较频繁，请一小时后再试，或联系 sales@omindos.ai。", saved: "回执及申请内容已复制。", draft: "申请内容已复制。您可以发送至 sales@omindos.ai。", download: "下载申请回执", copyFailed: "无法自动复制，请选择页面上的回执编号，或下载回执。" },
    en: { required: "Complete all required fields and confirm the privacy notice.", sending: "Submitting…", success: "Application received. Receipt: ", followup: "We will contact you at the email address you provided. This is not a slot confirmation or payment commitment.", failed: "Submission could not be confirmed. Please retry; retries will not create duplicates. You can also copy your application and email sales@omindos.ai.", limited: "Too many submissions. Try again in an hour or contact sales@omindos.ai.", saved: "Receipt and application copied.", draft: "Application copied. You can email it to sales@omindos.ai.", download: "Download receipt", copyFailed: "Copying is unavailable. Select the receipt number or download your receipt." },
    ja: { required: "必須項目を入力し、プライバシーについてご確認ください。", sending: "送信中です…", success: "申請を受け付けました。受付番号：", followup: "ご入力のメールアドレスにご連絡します。受付は枠の確保やお支払いの確約ではありません。", failed: "受付を確認できませんでした。再送しても重複登録はされません。申請内容をコピーして sales@omindos.ai へ送ることもできます。", limited: "送信回数が多いため、1時間後に再度お試しください。または sales@omindos.ai へご連絡ください。", saved: "受付番号と申請内容をコピーしました。", draft: "申請内容をコピーしました。sales@omindos.ai へ送信できます。", download: "受付控えをダウンロード", copyFailed: "コピーできません。受付番号を選択するか、受付控えをダウンロードしてください。" },
  }[language];
  const submit = form.querySelector('[type="submit"]');
  let busy = false, receipt = "", applicationText = "", lastPayload = "", submissionKey = "";
  const fieldNames = ["company", "contact", "email", "phone", "robot", "stack", "start", "quantity", "capabilities", "test_unit", "track", "summary"];
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || receipt) return;
    if (!form.checkValidity()) { form.reportValidity(); status.textContent = copy.required; return; }
    const data = new FormData(form);
    const payload = Object.fromEntries(fieldNames.map((key) => [key, String(data.get(key) || "").trim()]));
    payload.language = language; payload.consent = data.has("consent"); payload.website = String(data.get("website") || "");
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayload) { submissionKey = crypto.randomUUID(); lastPayload = serialized; }
    applicationText = fieldNames.map((name) => {
      const control = form.querySelector(`[name="${name}"]`);
      return `${control?.closest("label")?.querySelector("span")?.textContent?.trim() || name}: ${payload[name]}`;
    }).join("\n");
    copyButton.disabled = false; busy = true; submit.disabled = true;
    form.setAttribute("aria-busy", "true"); status.textContent = copy.sending;
    try {
      const response = await fetch("/api/oem-applications", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, submissionKey }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) { status.textContent = response.status === 429 ? copy.limited : copy.failed; return; }
      if (typeof result.receipt !== "string" || !/^OEM-[0-9a-f-]{36}$/i.test(result.receipt)) throw new Error("Invalid receipt");
      receipt = result.receipt;
      applicationText = `${copy.success}${receipt}\n${new Date().toISOString()}\n\n${applicationText}\n\n${copy.followup}`;
      status.textContent = `${copy.success}${receipt} ${copy.followup}`;
      form.querySelectorAll("input, textarea, select").forEach((control) => { control.disabled = true; });
      const download = document.createElement("a");
      download.className = "button button-secondary";
      download.textContent = copy.download;
      download.href = URL.createObjectURL(new Blob([applicationText], { type: "text/plain;charset=utf-8" }));
      download.download = `${receipt}.txt`;
      form.querySelector(".form-actions").append(download);
    } catch { status.textContent = copy.failed; }
    finally { busy = false; submit.disabled = Boolean(receipt); form.removeAttribute("aria-busy"); }
  });
  copyButton.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(applicationText); status.textContent = receipt ? `${copy.saved} ${copy.success}${receipt}` : copy.draft; }
    catch { status.textContent = copy.copyFailed; }
  });
})();
