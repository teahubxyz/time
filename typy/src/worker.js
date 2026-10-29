import { renderPage } from './page.js';
import { ASSETS } from './assets.js';
import { ApiError, QuotaGate, saveResult, getResult, leaderboard } from './store.js';
import { dailyPassage, topicPassage, normalizeTopic } from './passages.js';
import { scorePNG } from './og.js';
export { QuotaGate };

const SECURITY = {
 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const response = (body,status=200,headers={}) => new Response(body,{status,headers:{...SECURITY,...headers}});
const json = (body,status=200,headers={}) => response(JSON.stringify(body),status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
async function bodyJSON(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw new ApiError(415,'Send this run as JSON.','invalid_content_type');
 const declared=Number(request.headers.get('Content-Length'));
 if(Number.isFinite(declared)&&declared>1500000)throw new ApiError(413,'This replay is too large to share.','request_too_large');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'A completed run is required.','invalid_json');
 const chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1500000){await reader.cancel();throw new ApiError(413,'This replay is too large to share.','request_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'This run could not be read.','invalid_json');}
}
function checkOrigin(request,url){const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)throw new ApiError(403,'Please share your result from typy.','wrong_origin');if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new ApiError(403,'Please share your result from typy.','wrong_origin');}
async function route(request,env){
 const url=new URL(request.url), path=url.pathname;
 if(request.method==='OPTIONS')return response(null,204,{'Allow':'GET, HEAD, POST'});
 if(!['GET','HEAD','POST'].includes(request.method))return json({error:'Method not allowed.',code:'method_not_allowed'},405,{'Allow':'GET, HEAD, POST'});
 if(path==='/api/health')return json({ok:Boolean(env.KV&&env.QUOTA),rev:env.REV||'development',source_sha:env.SOURCE_SHA||'development',storage:env.KV?'ready':'unavailable',quotas:env.QUOTA?'ready':'unavailable',topics:Boolean(env.VENICE_API_KEY)},env.KV&&env.QUOTA?200:503);
 if(path==='/api/results'&&request.method==='POST'){checkOrigin(request,url);return json(await saveResult(request,env,await bodyJSON(request)),201);}
 if(request.method==='POST')throw new ApiError(405,'Method not allowed.','method_not_allowed');
 if(path==='/api/daily')return json(dailyPassage(),200,{'Cache-Control':'no-cache'});
 if(path==='/api/board')return json(await leaderboard(env,url.searchParams.get('day')||undefined));
 if(path==='/api/passage'){if(request.method==='HEAD')return response(null,405,{'Allow':'GET'});checkOrigin(request,url);return json(await topicPassage(request,env,url.searchParams.get('topic')));}
 let match=path.match(/^\/api\/results\/([a-f0-9]{24})$/);
 if(match)return json(await getResult(env,match[1]));
 match=path.match(/^\/api\/og\/(default|[a-f0-9]{24})\.png$/);
 if(match){const record=match[1]==='default'?null:await getResult(env,match[1]);return response(await scorePNG(record),200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400, immutable'});}
 if(path==='/robots.txt')return response('User-agent: *\nDisallow: /api/\n',200,{'Content-Type':'text/plain; charset=utf-8'});
 if(path==='/favicon.ico')return response(null,302,{'Location':'/favicon.svg'});
 if(ASSETS[path]){const asset=ASSETS[path];return response(asset.body,200,{'Content-Type':asset.type,'Cache-Control':'public, max-age=300'});}
 if(path.startsWith('/api/'))throw new ApiError(404,'This endpoint does not exist.','not_found');
 let meta={url:url.origin+path};
 match=path.match(/^\/(r|race)\/([a-f0-9]{24})$/);
 if(match){
  let record;
  try{record=await getResult(env,match[2]);}
  catch(error){
   if(error instanceof ApiError&&error.status===404)return response(renderPage(meta),404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
   throw error;
  }
  meta={...meta,title:`${Math.round(record.run.stats.wpm)} wpm · typy`,description:`${record.name?record.name+' found':'Find'} a rhythm: ${record.run.stats.accuracy}% accuracy and a ${record.run.stats.bestStreak}-word streak. Watch the replay or race the ghost.`,image:`${url.origin}/api/og/${record.id}.png`};
 }else if(path==='/'||path==='/daily'){
  if(path==='/daily')meta.title='The daily passage · typy';
 }else if(/^\/[a-z0-9][a-z0-9-]{0,63}$/.test(path)){
  // A topic path is a page, not an endpoint: a rejected slug still renders the
  // app, which asks /api/passage and shows that refusal in its own words.
  let topic;
  try{topic=normalizeTopic(path.slice(1));}
  catch(error){
   if(error instanceof ApiError&&error.status<500)return response(renderPage(meta),error.status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
   throw error;
  }
  meta.title=`${topic.replace(/-/g,' ')} · typy`;
 }else throw new ApiError(404,'This page does not exist.','not_found');
 return response(renderPage(meta),200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
}
export default {
 async fetch(request,env,ctx){
  try{const res=await route(request,env,ctx);return request.method==='HEAD'?new Response(null,{status:res.status,headers:res.headers}):res;}
  catch(error){
   const known=error instanceof ApiError;
   // Never log passages, key events, request bodies, IP addresses, or provider keys.
   const result=json({error:known?error.message:'Something went wrong. Please try again shortly.',code:known?error.code:'service_error'},known?error.status:503,error.retryAfter?{'Retry-After':String(error.retryAfter)}:{});
   return request.method==='HEAD'?new Response(null,{status:result.status,headers:result.headers}):result;
  }
 }
};
