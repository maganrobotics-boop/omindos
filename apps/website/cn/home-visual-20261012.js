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

  const hero=document.querySelector('.hero');const toggle=document.querySelector('.hero-motion-toggle');const reduced=window.matchMedia('(prefers-reduced-motion:reduce)');let paused=false;let visible=true;
  const updateMotion=()=>{hero.dataset.heroMotion=paused||reduced.matches||document.hidden||!visible?'paused':'running';toggle.hidden=reduced.matches;toggle.textContent=paused?'播放动效':'暂停动效';toggle.setAttribute('aria-label',paused?'播放首页背景动效':'暂停首页背景动效');};
  toggle.addEventListener('click',()=>{paused=!paused;updateMotion();});reduced.addEventListener('change',updateMotion);document.addEventListener('visibilitychange',updateMotion);
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;updateMotion();});observer.observe(hero);}updateMotion();
})();


(() => {
 const section=document.querySelector('.scroll-products');if(!section)return;
 const slides=[...section.querySelectorAll('.product-slide')];
 const staticMode=matchMedia('(prefers-reduced-motion:reduce)');
 const mobileMode=matchMedia('(max-width:760px)');
 let mobileIndex=0;
 let frame=0,active=-1;
 section.classList.add('is-scroll-ready');
 const updateProducts=()=>{
  frame=0;
  if(staticMode.matches){slides.forEach(slide=>{slide.inert=false;slide.removeAttribute('aria-hidden');slide.style.removeProperty('opacity');slide.style.removeProperty('transform');});return;}
  const header=document.querySelector('.site-header').getBoundingClientRect().height;
  const rect=section.getBoundingClientRect();
  const viewport=section.querySelector(':scope > .wrap').offsetHeight;
  const travel=Math.max(1,section.offsetHeight-viewport);
  const targetRaw=Math.max(0,Math.min(3.5,(header-rect.top)/travel*3.5));
  // Select a complete state; animation time is independent of wheel position.
  let index=Math.min(3,Math.round(targetRaw));
  if(active>=0&&Math.abs(targetRaw-active)<.6)index=active;
  if(mobileMode.matches)index=mobileIndex;
  slides.forEach((slide,i)=>{
    slide.classList.toggle('is-current',i===index);
    slide.inert=i!==index;slide.setAttribute('aria-hidden',String(i!==index));
  });
  if(index!==active){active=index;section.querySelectorAll('.product-segments > button').forEach((segment,i)=>{segment.classList.toggle('is-active',i===index);if(i===index)segment.setAttribute('aria-current','step');else segment.removeAttribute('aria-current');});section.querySelector('.scroll-product-hint').firstChild.textContent=mobileMode.matches?'也可点击上方型号，直接切换 ':(index===3?'继续滚动，走进应用现场 ':'向下滚动，探索下一款 ');}
 };
 section.querySelectorAll('.product-segments > button').forEach((button,index)=>{
  button.addEventListener('click',()=>{
   if(mobileMode.matches){mobileIndex=index;updateProducts();return;}
   const header=document.querySelector('.site-header').getBoundingClientRect().height;
   const viewport=section.querySelector(':scope > .wrap').offsetHeight;
   const travel=Math.max(1,section.offsetHeight-viewport);
   const top=window.scrollY+section.getBoundingClientRect().top-header+travel*(index+.15)/3.5;
   // A direct selection must not animate back through intermediate products.
   if(frame)cancelAnimationFrame(frame);
   frame=0;active=-1;
   window.scrollTo({top,behavior:'instant'});
   updateProducts();
  });
 });
 // Horizontal gestures select products; vertical gestures remain native page scrolling.
 const track=section.querySelector('.product-track');
 let touchStart=null;
 track.addEventListener('touchstart',event=>{
  touchStart=mobileMode.matches&&event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
 },{passive:true});
 track.addEventListener('touchend',event=>{
  if(!touchStart||!event.changedTouches.length)return;
  const dx=event.changedTouches[0].clientX-touchStart.x;
  const dy=event.changedTouches[0].clientY-touchStart.y;touchStart=null;
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){
   mobileIndex=Math.max(0,Math.min(slides.length-1,mobileIndex+(dx<0?1:-1)));updateProducts();
  }
 },{passive:true});
 track.addEventListener('touchcancel',()=>{touchStart=null;},{passive:true});
 mobileMode.addEventListener('change',()=>{active=-1;updateProducts();});
 section.querySelectorAll('[data-product-view]').forEach(button=>{
  button.addEventListener('click',()=>{
   const figure=button.closest('.slide-visual');
   figure.classList.toggle('is-detail',button.dataset.productView==='detail');
   figure.querySelectorAll('[data-product-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  });
 });
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(updateProducts);};
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);staticMode.addEventListener('change',()=>{active=-1;schedule();});updateProducts();
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const hero = document.querySelector('.hero');
  hero.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType !== 'mouse' || hero.dataset.heroMotion !== 'running' || innerWidth <= 760) return;
    const box = hero.getBoundingClientRect();
    hero.style.setProperty('--pointer-x',`${(event.clientX-box.left)/box.width*12-6}px`);
    hero.style.setProperty('--pointer-y',`${(event.clientY-box.top)/box.height*8-4}px`);
  });
  hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--pointer-x','0px');hero.style.setProperty('--pointer-y','0px');});
  if ('IntersectionObserver' in window && !reduced.matches) {
    const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}
    }),{threshold:.08});
    document.querySelectorAll('.section:not(.scroll-products) .section-heading,.scene-card,.field-card,.team-grid').forEach((element,index)=>{
      element.classList.add('reveal-item');element.style.setProperty('--reveal-delay',`${element.matches('.scene-card,.field-card') ? index%3*90 : 0}ms`);observer.observe(element);
    });
    document.documentElement.classList.add('motion-ready');
  }
})();
