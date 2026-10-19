/* Compose a project enquiry on this page; sending remains in the email app. */
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
    const body = [
      'Hello, I would like to discuss the following project with OriginMind.', '',
      'Enquiry: ' + values.topic,
      'Organisation and contact name: ' + (values.organisation || 'Not specified'),
      'Contact details: ' + values.contact,
      'Operating environment: ' + (values.environment || 'Not specified'),
      'Expected outcome: ' + (values.result || 'Not specified'), '',
      'Project requirements:', values.requirements,
    ].join('\n');
    output.value = body;
    mail.href = 'mailto:sales@omindos.ai?subject=' + encodeURIComponent('OriginMind project enquiry: ' + values.topic) + '&body=' + encodeURIComponent(body);
    preview.hidden = false;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    form.elements.requirements.setCustomValidity(form.elements.requirements.value.trim() ? '' : 'Please describe the task you would like the robot to perform.');
    form.elements.contact.setCustomValidity(form.elements.contact.value.trim() ? '' : 'Please enter an email address or phone number.');
    if (!form.reportValidity()) return;
    compose();
    mail.click();
  });
  form.addEventListener('input', () => {
    form.elements.requirements.setCustomValidity('');
    form.elements.contact.setCustomValidity('');
    preview.hidden = true;
    status.textContent = '';
  });
  async function copyText(value, feedback, fallback) {
    try {
      await navigator.clipboard.writeText(value);
      feedback.textContent = 'Copied.';
    } catch {
      if (fallback) { fallback.focus(); fallback.select(); }
      feedback.textContent = fallback
        ? 'Use your copy shortcut or press and hold to copy the selected enquiry.'
        : 'Select or press and hold the email address to copy it: sales@omindos.ai';
    }
  }
  document.getElementById('enquiry-copy').addEventListener('click', () => copyText(output.value, status, output));
  document.getElementById('copy-sales-email').addEventListener('click', () => copyText('sales@omindos.ai', document.getElementById('copy-sales-status')));
  mail.addEventListener('click', () => {
    status.textContent = 'Review and send the enquiry in your email app. If it does not open, copy the enquiry below and email it to sales@omindos.ai.';
  });
})();
