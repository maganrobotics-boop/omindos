(() => {
  const form = document.getElementById("oem-application-form");
  const copyButton = document.getElementById("copy-application");
  const status = document.getElementById("form-status");
  if (!form || !copyButton || !status) return;
  let applicationText = "";
  const val = (data, key) => String(data.get(key) || "未填写").trim() || "未填写";
  const build = () => {
    const data = new FormData(form);
    return ["OriginMind AI OS™ 首批 OEM 共创申请", "", `公司名称：${val(data,"company")}`, `联系人：${val(data,"contact")}`, `工作邮箱：${val(data,"email")}`, `电话 / 微信：${val(data,"phone")}`, "", `意向方向：${val(data,"track")}`, `机器人类型 / 型号：${val(data,"robot")}`, `操作系统与接口：${val(data,"stack")}`, `希望启动时间：${val(data,"start")}`, `预计部署数量：${val(data,"quantity")}`, `测试样机与接口资料：${val(data,"test_unit")}`, "", "现有能力与希望增加的能力：", val(data,"capabilities"), "", "项目补充说明：", val(data,"summary"), "", "本人理解：提交申请不等于获得席位或形成交付承诺；基础版项目正式启动时须一次性采购不少于 20 套软件许可，升级版须不少于 10 套软件许可；最终合作以双方书面协议为准。"].join("\n");
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); status.textContent = "请先填写所有必填信息。"; return; }
    applicationText = build(); copyButton.disabled = false;
    const data = new FormData(form);
    status.textContent = "申请邮件已生成。若邮件应用未打开，请复制申请内容后发送至 sales@omindos.ai。";
    window.location.href = `mailto:sales@omindos.ai?subject=${encodeURIComponent(`OriginMind™ OEM 共创申请｜${data.get("company")}`)}&body=${encodeURIComponent(applicationText)}`;
  });
  copyButton.addEventListener("click", async () => {
    if (!applicationText) applicationText = build();
    try { await navigator.clipboard.writeText(applicationText); }
    catch { const helper = document.createElement("textarea"); helper.value = applicationText; helper.style.position = "fixed"; helper.style.opacity = "0"; document.body.append(helper); helper.select(); document.execCommand("copy"); helper.remove(); }
    status.textContent = "申请内容已复制，请发送至 sales@omindos.ai。";
  });
})();
