const menuButton=document.querySelector('.menu-toggle');const menu=document.querySelector('.menu-panel');
function setMenu(open){menu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');document.body.classList.toggle('menu-open',open);header.classList.toggle('scrolled',scrollY>30||open);if(open)menu.querySelector('summary,a')?.focus();else menuButton.focus();}
menuButton?.addEventListener('click',()=>setMenu(menu.hidden));
menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden)setMenu(false);if(e.key==='Tab'&&!menu.hidden){const f=[menuButton,...menu.querySelectorAll('a,summary,button')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus();}}});
const header=document.querySelector('.header');const scrollHeader=()=>header.classList.toggle('scrolled',scrollY>30||!menu.hidden);addEventListener('scroll',scrollHeader,{passive:true});scrollHeader();
const movie=document.querySelector('.hero video');const movieButton=document.querySelector('.video-control');
if(movie&&movieButton){
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const source=movie.querySelector('source[data-src]');
 const clips=JSON.parse(movie.dataset.clips||'[]');
 let userPaused=false,inView=true,clipIndex=0,changingClip=false;
 const hero=movie.closest('.hero');
 // Fit the inspected, caption-free source rectangle into the full hero viewport.
 // Cropping happens in the browser; the original remote videos remain untouched.
 const frameClip=()=>{
  const crop=clips[clipIndex]?.crop;if(!crop)return;
  const width=movie.videoWidth||960,height=movie.videoHeight||540;
  const left=crop.left||0,right=crop.right||0,top=crop.top||0,bottom=crop.bottom||0;
  const usableWidth=width*(1-left-right),usableHeight=height*(1-top-bottom);
  const scale=Math.max(hero.clientWidth/usableWidth,hero.clientHeight/usableHeight);
  Object.assign(movie.style,{
   maxWidth:'none',width:width*scale+'px',height:height*scale+'px',
   left:(hero.clientWidth-usableWidth*scale)/2-left*width*scale+'px',
   top:(hero.clientHeight-usableHeight*scale)/2-top*height*scale+'px',right:'auto',bottom:'auto'
  });
 };
 if('ResizeObserver' in window)new ResizeObserver(frameClip).observe(hero);
 else addEventListener('resize',frameClip,{passive:true});
 frameClip();
 const label=()=>{movieButton.textContent=movie.paused?'Play film':'Pause film';movieButton.setAttribute('aria-label',movie.paused?'Play background video':'Pause background video');};
 const loadClip=index=>{
  clipIndex=index;changingClip=true;
  movie.classList.remove('is-playing');
  frameClip();
  source.src=clips[index].src;movie.load();
 };
 const play=()=>{
  if(reduced.matches||document.hidden||!inView||userPaused)return;
  if([...document.querySelectorAll('[data-field-video]')].some(v=>!v.paused))return;
  if(source&&clips.length&&!source.hasAttribute('src')){loadClip(0);return;}
  if(changingClip)return;
  if(source&&!source.hasAttribute('src')){source.src=source.dataset.src;movie.load();}
  movie.muted=true;movie.play().then(label).catch(label);
 };
 movie.addEventListener('loadedmetadata',()=>{
  if(!clips.length||!changingClip)return;
  frameClip();
  if(clips[clipIndex].start===0){changingClip=false;play();}
  else movie.currentTime=clips[clipIndex].start;
 });
 movie.addEventListener('seeked',()=>{if(changingClip){changingClip=false;play();}});
 movie.addEventListener('timeupdate',()=>{
  if(clips.length&&!changingClip&&!movie.paused&&movie.currentTime>=clips[clipIndex].end)loadClip((clipIndex+1)%clips.length);
 });
 // End a selected interval on the displayed frame, before later captions appear.
 if('requestVideoFrameCallback' in movie){
  const followFrame=()=>{if(clips.length&&!changingClip&&!movie.paused&&movie.currentTime>=clips[clipIndex].end)loadClip((clipIndex+1)%clips.length);movie.requestVideoFrameCallback(followFrame);};
  movie.requestVideoFrameCallback(followFrame);
 }
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
document.querySelectorAll('.video-fold').forEach(details=>details.addEventListener('toggle',()=>{if(!details.open)details.querySelectorAll('video').forEach(v=>v.pause());}));
document.addEventListener('play',e=>{if(e.target.matches?.('[data-field-video]'))document.querySelectorAll('video').forEach(v=>{if(v!==e.target)v.pause();});},true);
