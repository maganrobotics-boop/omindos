import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {cleanCourseEntryResources} from './course-entry-resources.mjs';

export const PUBLIC_ORIGIN = 'https://omindos.cn';
export const UPSTREAM_ORIGIN = 'https://chat.omindos.cn';
export const PREFIX = '/chat';
const SAFE = new Set(['GET', 'HEAD']);
const ROOTS = /^(?:api|assets|learning|learning-media|arena|TA|ta|manage|technology|research|originmind|ius|newbie[^/]*|orientation[^/]*|platform-[^/]*|manifest\.webmanifest|service-worker\.js|zip-import-addon\.js|favicon\.svg|LICENSES\.md|_health|gold-vault)(?:[/?#]|$)/;
const isIndependent = value => /^\/(?:learning|arena)(?:[/?#]|$)/.test(value);
const publicPath = value => isIndependent(value) ? value : PREFIX + value;
const rewriteOrigins = value => value.replaceAll(UPSTREAM_ORIGIN, PUBLIC_ORIGIN + PREFIX)
  .replace(/https:\/\/omindos\.cn\/chat\/(learning|arena)(?=[/?#\s"'`<>]|$)/g, PUBLIC_ORIGIN + '/$1');

export function publicUrl(value) {
  if (value.startsWith(UPSTREAM_ORIGIN + '/')) return PUBLIC_ORIGIN + publicPath(value.slice(UPSTREAM_ORIGIN.length));
  if (value === UPSTREAM_ORIGIN) return PUBLIC_ORIGIN + PREFIX + '/';
  if (value.startsWith('/') && !value.startsWith('//') && (value === '/' || ROOTS.test(value.slice(1)))) return publicPath(value);
  return value;
}

// Rewrite only application-owned URL tokens in static code, never chat answers,
// API JSON, uploaded documents or event streams.
export function rewriteStatic(text, type, pathname) {
  text = cleanCourseEntryResources(text, type, pathname);
  if (pathname === '/manifest.webmanifest') {
    const manifest = JSON.parse(text);
    manifest.id = PREFIX + '/';
    manifest.start_url = PREFIX + '/';
    manifest.scope = PREFIX + '/';
    for (const icon of manifest.icons || []) icon.src = publicUrl(icon.src);
    return JSON.stringify(manifest);
  }
  text = rewriteOrigins(text);
  text = text.replace(/(["'`])\/(?!\/)([a-zA-Z_][^"'`\s<>]*)/g, (match, quote, value) => ROOTS.test(value) ? quote + publicPath('/' + value) : match);
  text = text.replace(/(\b(?:href|src|action)\s*=\s*["'])\/(?=["'])/g, '$1' + PREFIX + '/');
  text = text.replace(/(\bnew URL\s*\(\s*["'])\/(?=["'])/g, '$1' + PREFIX + '/');
  text = text.replace(/(\b(?:href|start_url|scope)\s*:\s*["'])\/(?=["'])/g, '$1' + PREFIX + '/');
  if (/css/.test(type)) text = text.replace(/url\(\s*\/(?!\/)([^\s)]+)/g, (match, value) => ROOTS.test(value) ? 'url(' + publicPath('/' + value) : match);
  if (pathname === '/service-worker.js') text = text.replaceAll('^\\/assets\\/', '^\\/chat\\/assets\\/');
  return text;
}

export function upstreamHeaders(input, clientIp = '') {
  const headers = new Headers();
  for (const name of ['accept', 'accept-language', 'content-type', 'cookie', 'range', 'if-range', 'user-agent']) {
    const value = input.get(name);
    if (value !== null) headers.set(name, value);
  }
  // A comparison guard, not an identity assertion: the backend still resolves
  // the account from its own session and rejects a different expected account.
  const expectedAccount = input.get('x-omindos-expected-account');
  if (/^[A-Za-z0-9_-]{16,160}$/.test(expectedAccount || '')) headers.set('x-omindos-expected-account', expectedAccount);
  const origin = input.get('origin');
  if (origin) headers.set('origin', origin === PUBLIC_ORIGIN ? UPSTREAM_ORIGIN : origin);
  const referer = input.get('referer');
  if (referer?.startsWith(PUBLIC_ORIGIN + PREFIX + '/')) headers.set('referer', UPSTREAM_ORIGIN + referer.slice((PUBLIC_ORIGIN + PREFIX).length));
  else if (referer?.startsWith(PUBLIC_ORIGIN + '/') && isIndependent(referer.slice(PUBLIC_ORIGIN.length))) headers.set('referer', UPSTREAM_ORIGIN + referer.slice(PUBLIC_ORIGIN.length));
  headers.set('accept-encoding', 'identity');
  headers.set('x-omindos-chat-entry', '1');
  if (/^[0-9a-f:.]+$/i.test(clientIp)) headers.set('x-omindos-client-ip', clientIp);
  return headers;
}

export function scopedCookie(cookie) {
  // __Host- cookies require Path=/; keep their browser-enforced restrictions.
  const hostCookie = cookie.startsWith('__Host-');
  cookie = cookie.replace(/;\s*Domain=[^;]*/ig, '');
  if (!hostCookie) cookie = cookie.replace(/;\s*Path=\/([^;]*)/i, (_, rest) => '; Path=' + publicPath('/' + rest));
  return cookie;
}

export async function handle(request, fetchUpstream = fetch, clientIp = '') {
  const url = new URL(request.url);
  const independent = isIndependent(url.pathname);
  if (url.origin !== PUBLIC_ORIGIN || (!independent && !url.pathname.startsWith(PREFIX + '/'))) return new Response('Not found', {status:404});
  if (!independent && isIndependent(url.pathname.slice(PREFIX.length)) && SAFE.has(request.method)) {
    return new Response(null,{status:302,headers:{Location:url.pathname.slice(PREFIX.length)+url.search,'Cache-Control':'no-store'}});
  }
  if (!SAFE.has(request.method) && request.headers.get('origin') !== PUBLIC_ORIGIN) return new Response('Forbidden', {status:403, headers:{'Cache-Control':'no-store'}});
  const target = new URL(UPSTREAM_ORIGIN);
  target.pathname = independent ? url.pathname : url.pathname.slice(PREFIX.length);
  target.search = url.search;
  const headers = upstreamHeaders(request.headers, clientIp);
  const response = await fetchUpstream(target, {
    method: request.method, headers, redirect:'manual', signal:request.signal,
    ...(!SAFE.has(request.method) ? {body:request.body, duplex:'half'} : {}),
  });
  const output = new Headers(response.headers);
  for (const name of ['content-encoding','content-length','transfer-encoding','connection','set-cookie','server','alt-svc']) output.delete(name);
  for (const cookie of response.headers.getSetCookie()) {
    output.append('set-cookie', scopedCookie(cookie));
    // Share the existing account across the three disjoint application paths.
    // Keep cookies off the rest of the website; __Host- already requires Path=/.
    if (!cookie.startsWith('__Host-') && /;\s*Path=\/(?:;|$)/i.test(cookie)) {
      for (const scope of ['/learning', '/arena']) output.append('set-cookie', cookie.replace(/;\s*Domain=[^;]*/ig,'').replace(/;\s*Path=\/(?=;|$)/i,'; Path=' + scope));
    }
  }
  const location = output.get('location');
  if (location) output.set('location', publicUrl(location));
  for (const name of ['content-security-policy', 'content-security-policy-report-only']) {
    const policy = output.get(name);
    if (policy) output.set(name, rewriteOrigins(policy));
  }
  if (output.get('access-control-allow-origin') === UPSTREAM_ORIGIN) output.set('access-control-allow-origin', PUBLIC_ORIGIN);
  output.set('X-Content-Type-Options', 'nosniff');
  const entry = independent ? url.pathname.split('/')[1] : 'chat';
  output.set('Service-Worker-Allowed', '/' + entry + '/');
  output.set('X-OmindOS-Entry', entry);
  const type = output.get('content-type') || '';
  const isStatic = !target.pathname.startsWith('/api/') && !target.pathname.startsWith('/arena/api/');
  const transform = isStatic && /(?:text\/html|(?:application|text)\/(?:javascript|x-javascript)|text\/css|application\/manifest\+json)/i.test(type);
  if (transform && response.status === 200 && request.method !== 'HEAD') {
    const text = rewriteStatic(await response.text(), type, target.pathname);
    output.delete('etag'); output.delete('last-modified');
    output.set('Cache-Control','no-cache');
    return new Response(text,{status:response.status,headers:output});
  }
  // Private API and SSE responses are streamed unchanged and never cached.
  if (!isStatic) output.set('Cache-Control','no-store');
  return new Response(request.method === 'HEAD' ? null : response.body,{status:response.status,headers:output});
}

export function start(port = Number(process.env.CHAT_ENTRY_PORT || 18887)) {
  const server = http.createServer(async (incoming, outgoing) => {
    const abort = new AbortController();
    outgoing.on('close',()=>{if(!outgoing.writableFinished)abort.abort();});
    try {
      if (incoming.headers.host !== 'omindos.cn') { outgoing.writeHead(421);outgoing.end();return; }
      const headers = new Headers();
      for (const [key,value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key,Array.isArray(value)?value.join(', '):value);
      const request = new Request(PUBLIC_ORIGIN + incoming.url, {
        method:incoming.method,headers,signal:abort.signal,
        ...(!SAFE.has(incoming.method) ? {body:Readable.toWeb(incoming),duplex:'half'} : {}),
      });
      const response = await handle(request,fetch,String(incoming.headers['x-real-ip'] || ''));
      const result = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) result['set-cookie'] = cookies;
      outgoing.writeHead(response.status,result);
      if (response.body) await pipeline(Readable.fromWeb(response.body),outgoing);
      else outgoing.end();
    } catch (error) {
      if (!outgoing.headersSent) {outgoing.writeHead(502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});outgoing.end('服务暂时不可用，请稍后重试。');}
      else outgoing.destroy();
      if (!abort.signal.aborted) console.error('Chat entry upstream failure:',error.name);
    }
  });
  server.listen(port,'127.0.0.1');
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
