// Keep the reference English copy intact; only replace homepage media.
const images=['fleet-hero','robot-integration','quadruped-field','warehouse-transport','quadruped-field','humanoid-task','robot-integration','tracked-inspection','fleet-hero','robot-integration','warehouse-transport','fleet-hero','quadruped-field','tracked-inspection'];
const descriptions={
 'fleet-hero':'autonomous mobile robots in a warehouse',
 'robot-integration':'a manipulator on a wheeled mobile base',
 'quadruped-field':'a quadruped moving across uneven outdoor terrain',
 'warehouse-transport':'wheeled mobile robots transporting totes',
 'humanoid-task':'a humanoid robot carrying a tote',
 'tracked-inspection':'a tracked robot inspecting an underground tunnel'
};
const clips=[
 {src:'https://omindos.ai/assets/videos/1000087160-web.mp4',start:16,end:24},
 {src:'https://omindos.ai/assets/videos/1000087155-web.mp4',start:2,end:10},
 {src:'https://omindos.ai/assets/videos/1000087153-web.mp4',start:8,end:16}
];
export function replaceHomeMedia(html){
 let index=0;
 html=html.replace('class="hero full"','class="hero full mobile-hero"');
 html=html.replace(/<img\b[^>]*>/g,tag=>{
  if(tag.includes('Robot OEM brand'))return tag; // Logos are not background/scenario photos.
  const name=images[index++];
  if(!name)throw new Error('Homepage image map needs an explicit entry');
  return tag.replace(/src="[^"]*"/,`src="/assets/${name}.webp"`).replace(/alt="[^"]*"/,`alt="AI concept: ${descriptions[name]}"`);
 });
 if(index!==images.length)throw new Error(`Homepage image count changed: ${index}`);
 html=html.replace(/<video class="hero-media"[^>]*><\/video>/,`<video class="hero-media" data-hero-film data-clips="${JSON.stringify(clips).replace(/"/g,'&quot;')}" muted loop playsinline preload="none" poster="/assets/operations-poster.webp" aria-label="OriginMind and ARTS Robotics mobile robot field demonstrations"><source data-src="${clips[0].src}" type="video/mp4"></video>`);
 html=html.replace('<button class="video-control" type="button">Pause film</button>','<p class="hero-credit">Field footage: OriginMind / ARTS Robotics</p><button class="video-control" type="button" aria-label="Play background video">Play film</button>');
 return html+'<aside class="media-provenance wrap"><p>Homepage scene images are AI-generated concepts. The background film uses separate OriginMind / ARTS Robotics field footage. These visuals do not document the Mujin products or customer cases described in the reference text.</p></aside>';
}
