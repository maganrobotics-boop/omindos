const menuButton=document.querySelector('.menu-toggle');const menu=document.querySelector('.menu-panel');
function setMenu(open){menu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');document.body.classList.toggle('menu-open',open);if(open)menu.querySelector('summary,a')?.focus();else menuButton.focus();}
menuButton?.addEventListener('click',()=>setMenu(menu.hidden));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden)setMenu(false);if(e.key==='Tab'&&!menu.hidden){const f=[menuButton,...menu.querySelectorAll('a,summary,button')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus();}}});
const header=document.querySelector('.header');const scrollHeader=()=>header.classList.toggle('scrolled',scrollY>30||!menu.hidden);addEventListener('scroll',scrollHeader,{passive:true});scrollHeader();
document.querySelectorAll('[data-carousel]').forEach(button=>button.addEventListener('click',()=>{const track=document.querySelector(button.dataset.carousel);track.scrollBy({left:(track.clientWidth*.8)*(+button.dataset.direction),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}));
document.querySelectorAll('[data-accordion-group] details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)d.parentElement.querySelectorAll('details').forEach(other=>{if(other!==d)other.open=false;});}));
const movie=document.querySelector('.hero video');const movieButton=document.querySelector('.video-control');
if(movie&&movieButton){
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const source=movie.querySelector('source[data-src]');
 let userPaused=false,inView=true;
 const label=()=>{movieButton.textContent=movie.paused?'Play film':'Pause film';movieButton.setAttribute('aria-label',movie.paused?'Play background video':'Pause background video');};
 const play=()=>{
  if(reduced.matches||document.hidden||!inView||userPaused)return;
  if(source&&!source.hasAttribute('src')){source.src=source.dataset.src;movie.load();}
  movie.muted=true;movie.play().then(label).catch(label);
 };
 movie.addEventListener('playing',()=>{movie.classList.add('is-playing');label();});
 movie.addEventListener('pause',label);
 movie.addEventListener('error',()=>{movie.classList.remove('is-playing');label();});
 movieButton.addEventListener('click',()=>{if(movie.paused){userPaused=false;play();}else{userPaused=true;movie.pause();}});
 const preference=()=>{movieButton.hidden=reduced.matches;if(reduced.matches)movie.pause();else play();};
 reduced.addEventListener('change',preference);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)movie.pause();else play();});
 if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)play();else movie.pause();},{threshold:0.05}).observe(movie.closest('.hero'));
 preference();
}
document.querySelectorAll('[data-open-dialog]').forEach(b=>b.addEventListener('click',()=>{const d=document.getElementById(b.dataset.openDialog);d.showModal();}));document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d)d.close();});d.addEventListener('close',()=>d.querySelectorAll('video').forEach(v=>v.pause()));});
document.querySelectorAll('[data-video-src]').forEach(b=>b.addEventListener('click',()=>{const d=document.querySelector('#film-dialog'),v=d.querySelector('video');v.src=b.dataset.videoSrc;d.showModal();v.play().catch(()=>{});}));
const resourceCards=[...document.querySelectorAll('[data-resource-card]')],search=document.querySelector('[data-resource-search]'),pager=document.querySelector('[data-pagination]');let page=1;const pageSize=9;
function showResources(){const query=search?.value.trim().toLowerCase()||'';const matched=resourceCards.filter(c=>c.dataset.search.includes(query));const pages=Math.max(1,Math.ceil(matched.length/pageSize));page=Math.min(page,pages);resourceCards.forEach(c=>c.hidden=true);matched.slice((page-1)*pageSize,page*pageSize).forEach(c=>c.hidden=false);if(pager){pager.replaceChildren();for(let i=1;i<=pages;i++){const b=document.createElement('button');b.type='button';b.textContent=String(i);b.setAttribute('aria-label',`Page ${i}`);if(i===page)b.setAttribute('aria-current','page');b.addEventListener('click',()=>{page=i;showResources();document.querySelector('.resource-nav').scrollIntoView({block:'start'});});pager.append(b);}}const empty=document.querySelector('.no-results');if(empty)empty.hidden=matched.length>0;}
if(resourceCards.length){search?.addEventListener('input',()=>{page=1;showResources();});showResources();}
document.querySelectorAll('[role=tab]').forEach(t=>t.addEventListener('click',()=>{const group=t.closest('[role=tablist]');group.querySelectorAll('[role=tab]').forEach(b=>{b.setAttribute('aria-selected',String(b===t));document.getElementById(b.getAttribute('aria-controls')).hidden=b!==t;});}));
document.querySelectorAll('[role=tablist]').forEach(group=>group.addEventListener('keydown',e=>{const tabs=[...group.querySelectorAll('[role=tab]')];const i=tabs.indexOf(document.activeElement);if(i<0)return;let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();tabs[next].focus();tabs[next].click();}));
document.querySelectorAll('form[data-study-form]').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();if(!f.reportValidity())return;const status=f.querySelector('.form-status');status.hidden=false;status.textContent='填写演示已完成。此学习版没有向 Mujin 发送或保存您的信息。需要实际联系，请使用下方原站入口。';status.focus();}));
const routeSearch=document.querySelector('[data-route-search]');routeSearch?.addEventListener('input',()=>document.querySelectorAll('.route-list a').forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(routeSearch.value.toLowerCase())));
