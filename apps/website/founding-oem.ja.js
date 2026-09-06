(() => {
  const form = document.getElementById("oem-application-form");
  const copyButton = document.getElementById("copy-application");
  const status = document.getElementById("form-status");
  if (!form || !copyButton || !status) return;

  let applicationText = "";
  const val = (data, key) => String(data.get(key) || "未入力").trim() || "未入力";

  const build = () => {
    const data = new FormData(form);
    return [
      "OriginMind™ご担当者様",
      "",
      "先行OEMパートナープログラムへの参加を希望し、下記のとおり申請いたします。",
      "",
      "【企業情報】",
      `会社名：${val(data, "company")}`,
      `担当者名：${val(data, "contact")}`,
      `業務用メールアドレス：${val(data, "email")}`,
      `電話番号／WhatsApp／WeChat：${val(data, "phone")}`,
      "",
      "【ロボット・プロジェクト】",
      `希望製品プラン：${val(data, "track")}`,
      `ロボットの種類・型式：${val(data, "robot")}`,
      `OS・インターフェース：${val(data, "stack")}`,
      `導入希望時期：${val(data, "start")}`,
      `導入予定台数：${val(data, "quantity")}`,
      `テスト機・インターフェース資料の準備状況：${val(data, "test_unit")}`,
      "",
      "現在搭載している機能、および追加をご希望の機能：",
      val(data, "capabilities"),
      "",
      "その他のご要望・補足事項：",
      val(data, "summary"),
      "",
      "【確認事項】",
      "本申請のみでは、パートナー枠の確保または納品義務は生じないことを理解しています。プロジェクト開始時には、Foundation版は20ライセンス以上、Advanced版は10ライセンス以上を初回に一括購入する必要があることを理解しています。最終的な取引条件は、双方が締結する書面契約に基づきます。",
      "",
      "ご検討のほど、よろしくお願い申し上げます。",
    ].join("\n");
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      status.textContent = "必須項目をご入力ください。";
      return;
    }

    applicationText = build();
    copyButton.disabled = false;
    const data = new FormData(form);
    status.textContent = "申請メールを作成しました。メールアプリが開かない場合は、「申請内容をコピーする」を押し、sales@omindos.ai宛てにお送りください。";
    window.location.href = `mailto:sales@omindos.ai?subject=${encodeURIComponent(`OriginMind™ 先行OEMパートナー申請｜${data.get("company")}`)}&body=${encodeURIComponent(applicationText)}`;
  });

  copyButton.addEventListener("click", async () => {
    if (!applicationText) applicationText = build();
    try {
      await navigator.clipboard.writeText(applicationText);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = applicationText;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    status.textContent = "申請内容をコピーしました。sales@omindos.ai宛てのメールに貼り付けてお送りください。";
  });
})();
