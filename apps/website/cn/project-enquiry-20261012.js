(() => {
  const form = document.getElementById('project-enquiry');
  if (!form) return;
  const output = document.getElementById('enquiry-preview');
  const preview = document.getElementById('enquiry-preview-group');
  const status = document.getElementById('enquiry-status');
  const mail = document.getElementById('enquiry-mail');
  const copy = document.getElementById('enquiry-copy');
  const fields = ['topic', 'organisation', 'contact', 'requirements'];
  form.hidden = false;
  function compose() {
    const values = Object.fromEntries(fields.map(name => [name, form.elements[name].value.trim()]));
    return {
      subject: 'OriginMind 项目咨询：' + values.topic,
      body: ['您好，我想咨询以下项目：', '', '咨询方向：' + values.topic,
        '单位与联系人：' + (values.organisation || '待补充'),
        '联系方式：' + (values.contact || '待补充'), '',
        '项目需求：', values.requirements].join('\n')
    };
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    form.elements.requirements.setCustomValidity(form.elements.requirements.value.trim() ? '' : '请填写具体的项目需求。');
    if (!form.reportValidity()) return;
    const draft = compose();
    output.value = draft.body;
    mail.href = 'mailto:sales@omindos.ai?subject=' + encodeURIComponent(draft.subject) + '&body=' + encodeURIComponent(draft.body);
    preview.hidden = false;
    status.textContent = '需求已整理。请复制内容，或打开邮件应用后确认发送。';
    output.focus();
  });
  form.addEventListener('input', () => {
    form.elements.requirements.setCustomValidity('');
    preview.hidden = true;
    status.textContent = '';
  });
  copy.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(output.value);
      status.textContent = '已复制，可粘贴到邮件中发送。';
    } catch {
      output.focus();
      output.select();
      status.textContent = '请长按或使用复制快捷键，复制已选中的需求内容。';
    }
  });
  mail.addEventListener('click', () => {
    status.textContent = '请在邮件应用中确认并发送。若未打开，可复制需求后自行发送。';
  });
})();
