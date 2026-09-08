export const pages=[
 {path:'/',label:'Home'},
 {path:'/mobility',label:'Mobility'},
 {path:'/field-tests',label:'Field validation'},
 {path:'/field-tests/warehouse',label:'Warehouse inspection'},
 {path:'/field-tests/metal-mine',label:'Metal mine field validation'},
 {path:'/task-level-system',label:'Task-level system'},
 {path:'/cooperation',label:'Cooperation'},
 {path:'/about',label:'About OriginMind'},
 {path:'/robot-products',label:'Robot products and pricing'},
 {path:'/contact',label:'Contact OriginMind'}
];
export const clips=[
 {src:'https://omindos.ai/assets/videos/1000087160-web.mp4',start:16,end:24},
 {src:'https://omindos.ai/assets/videos/1000087155-web.mp4',start:2,end:10},
 {src:'https://omindos.ai/assets/videos/1000087153-web.mp4',start:8,end:16}
];
export const demonstrations={
 indoor:{id:'1000087152',title:'Quadruped · Indoor autonomous mobility',poster:'quadruped-indoor.jpg'},
 outdoor:{id:'1000087155',title:'Quadruped · Outdoor autonomous mobility',poster:'quadruped-outdoor.jpg'},
 humanoid:{id:'1000087157',title:'Humanoid · Instruction-guided movement',poster:'humanoid-field.jpg'},
 wheeled:{id:'1000087156',title:'Wheeled robot · Instruction-guided movement',poster:'wheeled-field.jpg'},
 warehouse:{id:'1000087160',title:'China Resources pharmaceutical warehouse · Field validation',poster:'warehouse-field.jpg'},
 mine:{id:'1000087153',title:'Metal mine · Tracked robot field validation',poster:'metal-mine-field.jpg'}
};
export function legacyTarget(path){
 if(path.startsWith('/applications'))return '/mobility';
 if(path==='/technology')return '/task-level-system';
 if(path==='/integrators')return '/cooperation';
 if(path==='/company'||path==='/careers')return '/about';
 if(path==='/download-mujinos'||path==='/truckbot-get-quote')return '/robot-products';
 if(path==='/privacy-policy'||path==='/coming-soon')return '/contact';
 return '/field-tests';
}
