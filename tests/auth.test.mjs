import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAuth, adminUser } from '../worker/auth.js';
import worker from '../worker/index.js';
const env = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key',ADMIN_USER_ID:'owner'};
const request = (path, body, origin='https://gallery.snapapp.ca') => new Request('https://gallery.snapapp.ca'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('login uses provider, issues secure cookie, and never returns credentials', async () => {
 globalThis.fetch = async (url,opts) => {assert.match(url,/token\?grant_type=password$/); assert.equal(JSON.parse(opts.body).password,'test-password'); return Response.json({access_token:'valid.jwt.token',expires_in:3600,user:{id:'owner',email:'owner@example.com'}});};
 const r=await handleAuth(request('/api/auth/login',{email:'owner@example.com',password:'test-password'}),env);
 assert.equal(r.status,200); const c=r.headers.get('set-cookie'); for(const flag of ['__Host-snapapp_admin=','Secure','HttpOnly','SameSite=Strict','Path=/','Max-Age=3600']) assert.ok(c.includes(flag)); assert.ok(!(await r.text()).includes('valid.jwt.token'));
});
test('rejects other users, bad credentials, rate limits, malformed data and foreign origins',async()=>{
 globalThis.fetch=async()=>Response.json({access_token:'a.b.c',expires_in:3600,user:{id:'other'}});
 assert.equal((await handleAuth(request('/api/auth/login',{email:'other@example.com',password:'x'}),env)).status,403);
 for(const status of [401,429]){globalThis.fetch=async()=>new Response('',{status});assert.equal((await handleAuth(request('/api/auth/login',{email:'a',password:'b'}),env)).status,status);}
 globalThis.fetch=async()=>{throw Error('must not call provider');};
 assert.equal((await handleAuth(request('/api/auth/login',{},'https://evil.example'),env)).status,403);
 assert.equal((await handleAuth(request('/api/auth/login',{}),env)).status,400);
 assert.equal((await handleAuth(request('/api/auth/login',{email:'a',password:'b'}),{})).status,503);
});
test('validates every session remotely and rejects bearer-only legacy tokens',async()=>{
 globalThis.fetch=async(url)=>{assert.ok(url.endsWith('/user'));return Response.json({id:'owner',email:'owner@example.com'});};
 const req=new Request('https://gallery.snapapp.ca/api/auth/session',{headers:{cookie:'__Host-snapapp_admin=a.b.c'}});
 assert.equal((await adminUser(req,env)).id,'owner');
 const legacy=new Request(req.url,{headers:{authorization:'Bearer old-token'}});
 assert.equal(await adminUser(legacy,{...env,ADMIN_TOKEN:'old-token'}),null);
 globalThis.fetch=async()=>new Response('',{status:401});assert.equal(await adminUser(req,env),null);
 globalThis.fetch=async()=>Response.json({id:'other'});assert.equal(await adminUser(req,env),null);
});
test('protects gallery reads and writes, clears cookies on logout',async()=>{
 const r=await worker.fetch(new Request('https://gallery.snapapp.ca/api/admin/galleries'),env);assert.equal(r.status,401);
 assert.equal((await worker.fetch(request('/api/admin/galleries',{},'https://evil.example'),env)).status,401);
 const logout=await handleAuth(request('/api/auth/logout',{}),env);assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await handleAuth(request('/api/auth/logout',{},'https://evil.example'),env)).status,403);
});

