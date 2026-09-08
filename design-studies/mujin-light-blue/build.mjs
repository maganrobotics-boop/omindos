import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {render} from './src/render.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(root,'../../apps/website/design-study');
const pages=JSON.parse(await fs.readFile(path.join(root,'src/pages.json'),'utf8'));
// Keep every study route beneath its own prefix so existing website URLs remain intact.
const scope=html=>html.replace(/\b(href|src|poster|data-video-src)="\/(?!\/)/g,'$1="/design-study/');
await fs.mkdir(out,{recursive:true});
await fs.cp(path.join(root,'public'),out,{recursive:true});
for(const p of [...pages,{path:'/404',label:'Page not found',type:'404'}]){
 const dir=p.path==='/'||p.path==='/404'?out:path.join(out,p.path.slice(1));
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,p.path==='/404'?'404.html':'index.html'),scope(render(p,pages)));
}
console.log(`Rendered ${pages.length} study routes plus 404 into apps/website/design-study.`);
