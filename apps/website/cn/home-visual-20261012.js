(() => {
  const menuToggle=document.querySelector('.menu-toggle');
  const menu=document.getElementById('mobile-menu');
  const setMenu=open=>{menu.hidden=!open;document.body.classList.toggle('menu-open',open);menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'关闭菜单':'打开菜单');if(open)menu.querySelector('a')?.focus();};
  menuToggle.addEventListener('click',()=>setMenu(menu.hidden));
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){setMenu(false);menuToggle.focus();}});
  document.addEventListener('keydown',e=>{if(menu.hidden||e.key!=='Tab')return;const items=[menuToggle,...menu.querySelectorAll('a')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
  window.matchMedia('(min-width:1100px)').addEventListener('change',e=>{if(e.matches)setMenu(false);});

  const descriptions={map:['地图与孪生','组织环境地图、巡检点位与机器人位置。'],task:['任务与调度','编排巡检路线、动作与采集步骤。'],data:['数据与反馈','查看机器人状态与任务执行记录。'],api:['接口与集成','适配感知、导航和控制接口，支持部署验证。']};
  const featureButtons=[...document.querySelectorAll('.function')];
  const featureDetail=document.getElementById('function-detail');
  let activeFeature=null;
  const closeFeature=()=>{featureDetail.hidden=true;featureButtons.forEach(b=>{b.setAttribute('aria-pressed','false');b.setAttribute('aria-expanded','false');});activeFeature=null;};
  featureButtons.forEach(button=>button.addEventListener('click',()=>{
    if(activeFeature===button){closeFeature();return;}
    activeFeature=button;featureButtons.forEach(b=>{b.setAttribute('aria-pressed',String(b===button));b.setAttribute('aria-expanded',String(b===button));});
    const [title,copy]=descriptions[button.dataset.mode];document.getElementById('detail-title').textContent=title;document.getElementById('detail-copy').textContent=copy;featureDetail.hidden=false;
  }));
  document.querySelector('.detail-close').addEventListener('click',()=>{const trigger=activeFeature;closeFeature();if(trigger)trigger.focus();});

  const dialog=document.getElementById('video-dialog');
  const video=document.getElementById('field-video');
  const error=document.getElementById('video-error');
  let lastVideoTrigger=null;
  document.querySelectorAll('[data-video]').forEach(button=>button.addEventListener('click',()=>{
    if(typeof dialog.showModal!=='function'){window.open(button.dataset.video,'_blank','noopener');return;}
    lastVideoTrigger=button;error.hidden=true;video.pause();video.src=button.dataset.video;video.poster=button.querySelector('img').src;
    document.getElementById('video-title').textContent=button.dataset.title;document.getElementById('video-direct').href=button.dataset.video;
    dialog.showModal();video.load();const playing=video.play();if(playing)playing.catch(()=>{});
  }));
  video.addEventListener('error',()=>{error.hidden=false;});
  video.addEventListener('playing',()=>{error.hidden=true;});
  document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
  dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();if(lastVideoTrigger)lastVideoTrigger.focus();});

})();
