(() => {
  'use strict';
  const form = document.getElementById('project-enquiry');
  if (!form) return;
  const output = document.getElementById('enquiry-preview');
  const preview = document.getElementById('enquiry-preview-group');
  const status = document.getElementById('enquiry-status');
  const mail = document.getElementById('enquiry-mail');
  const fields = ['topic', 'organisation', 'contact', 'environment', 'result', 'requirements'];
  form.hidden = false;
  function compose() {
    const values = Object.fromEntries(fields.map(name => [name, form.elements[name].value.trim()]));
    const body = ['您好，我想咨询以下项目：', '', '咨询方向：' + values.topic,
      '单位与联系人：' + (values.organisation || '待补充'),
      '联系方式：' + (values.contact || '待补充'),
      '作业场景：' + (values.environment || '待补充'),
      '期望结果：' + (values.result || '待补充'), '', '项目需求：', values.requirements].join('\n');
    output.value = body;
    mail.href = 'mailto:sales@omindos.ai?subject=' + encodeURIComponent('OriginMind 项目咨询：' + values.topic) + '&body=' + encodeURIComponent(body);
    preview.hidden = false;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    form.elements.requirements.setCustomValidity(form.elements.requirements.value.trim() ? '' : '请填写具体的项目需求。');
    if (!form.reportValidity()) return;
    compose();
    mail.click();
  });
  form.addEventListener('input', () => {
    form.elements.requirements.setCustomValidity('');
    preview.hidden = true;
    status.textContent = '';
  });
  async function copyText(value, feedback, fallback) {
    try {
      await navigator.clipboard.writeText(value);
      feedback.textContent = '已复制。';
    } catch {
      if (fallback) { fallback.focus(); fallback.select(); }
      feedback.textContent = fallback ? '请使用复制快捷键或长按，复制已选中的需求内容。' : '请长按或选中邮箱地址复制：sales@omindos.ai';
    }
  }
  document.getElementById('enquiry-copy').addEventListener('click', () => copyText(output.value, status, output));
  document.getElementById('copy-sales-email').addEventListener('click', () => copyText('sales@omindos.ai', document.getElementById('copy-sales-status')));
  mail.addEventListener('click', () => {
    status.textContent = '请在邮件应用中确认发送。若未打开，可复制下方需求及邮箱地址后自行发送。';
  });
})();
