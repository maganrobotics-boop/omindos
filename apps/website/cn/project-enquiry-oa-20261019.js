(() => {
  'use strict';
  const form=document.getElementById('project-enquiry');
  if(!form)return;
  const output=document.getElementById('enquiry-preview'),preview=document.getElementById('enquiry-preview-group'),status=document.getElementById('enquiry-status'),mail=document.getElementById('enquiry-mail');
  const submit=form.querySelector('button[type="submit"]');
  const fields=['topic','organisation','contact','environment','result','requirements'];
  let requestId='',sending=false;
  form.hidden=false;
  function values(){return Object.fromEntries(fields.map(name=>[name,form.elements[name].value.trim()]));}
  function compose(){
    const v=values();
    output.value=['您好，我想咨询以下项目：','','咨询方向：'+v.topic,'单位与联系人：'+(v.organisation||'待补充'),'联系方式：'+(v.contact||'待补充'),'作业场景：'+(v.environment||'待补充'),'期望结果：'+(v.result||'待补充'),'','项目需求：',v.requirements].join('\n');
    mail.href='mailto:sales@omindos.ai?subject='+encodeURIComponent('OriginMind 项目咨询：'+v.topic)+'&body='+encodeURIComponent(output.value);
    preview.hidden=false;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(sending)return;
    form.elements.requirements.setCustomValidity(form.elements.requirements.value.trim()?'':'请填写具体的项目需求。');
    form.elements.contact.setCustomValidity(form.elements.contact.value.trim()?'':'请填写邮箱或电话号码，方便我们联系您。');
    if(!form.reportValidity())return;
    requestId ||= crypto.randomUUID();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const controls=Array.from(form.querySelectorAll('input,select,textarea,button'));
    sending=true;controls.forEach(control=>{control.disabled=true;});submit.textContent='正在提交…';status.textContent='正在提交项目需求，请稍候。';
    try{
      const response=await fetch('https://oa.omindos.cn/api/public/website-enquiries',{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({...values(),requestId,website:form.elements.website.value,consent:form.elements.consent.checked}),signal:controller.signal});
      const result=await response.json().catch(()=>({error:'服务暂未返回提交确认，请稍后重试或使用邮件咨询。'}));
      if(!response.ok||result.ok!==true||typeof result.reference!=='string')throw Error(result.error||'咨询暂未提交成功，请稍后重试或使用邮件。');
      status.textContent='提交成功，咨询编号：'+result.reference+'。我们将根据您留下的联系方式与您沟通。';
      submit.textContent='已提交';
    }catch(error){
      status.textContent=error.name==='AbortError'?'暂未收到提交确认。您可重试，同一条需求不会重复创建；也可使用邮件咨询。':error.message==='Failed to fetch'?'网络连接失败，请重试或使用邮件咨询。':error.message;
      submit.disabled=false;submit.textContent='重新提交';
    }finally{clearTimeout(timer);sending=false;controls.forEach(control=>{if(control!==submit)control.disabled=false;});}
  });
  form.addEventListener('input',()=>{
    if(sending)return;
    form.elements.requirements.setCustomValidity('');form.elements.contact.setCustomValidity('');
    requestId='';preview.hidden=true;status.textContent='';submit.disabled=false;submit.textContent='提交项目咨询';
  });
  async function copyText(value,feedback,fallback){
    try{await navigator.clipboard.writeText(value);feedback.textContent='已复制。';}
    catch{if(fallback){fallback.focus();fallback.select();}feedback.textContent=fallback?'请长按或使用复制快捷键，复制已选中的需求内容。':'请选中邮箱地址复制：sales@omindos.ai';}
  }
  document.getElementById('enquiry-email-draft').addEventListener('click',()=>{compose();mail.click();});
  document.getElementById('enquiry-copy').addEventListener('click',()=>copyText(output.value,status,output));
  document.getElementById('copy-sales-email').addEventListener('click',()=>copyText('sales@omindos.ai',document.getElementById('copy-sales-status')));
  mail.addEventListener('click',()=>{status.textContent='请在邮件应用中确认发送。若未打开，可复制需求及邮箱后自行发送。';});
})();
