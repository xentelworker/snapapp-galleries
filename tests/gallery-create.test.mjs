import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url),'utf8'));
const env = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',ADMIN_USER_ID:'owner',DB:{
 prepare(sql){return {bind(...args){return {sql,args};}};},
 async batch(stmts){db.exec('BEGIN');try {for(const s of stmts)db.prepare(s.sql).run(...s.args);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
}};
db.exec(readFileSync(new URL('../migrations/0002_gallery_lifecycle.sql',import.meta.url),'utf8'));
globalThis.fetch=async()=>Response.json({id:'owner'});
const create=body=>worker.fetch(new Request('https://gallery.snapapp.ca/api/admin/galleries',{method:'POST',headers:{origin:'https://gallery.snapapp.ca',cookie:'__Host-snapapp_admin=a.b.c','content-type':'application/json'},body:JSON.stringify(body)}),env);
test('same title creates distinct addresses and default sets',async()=>{
 for(let i=0;i<2;i++){const r=await create({title:'Test'});assert.equal(r.status,201);assert.equal((await r.json()).title,'Test');}
 const rows=db.prepare('SELECT slug FROM galleries').all();assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.slug)).size,2);
 assert.equal(db.prepare('SELECT count(*) AS n FROM gallery_sets').get().n,2);
});
test('explicit duplicate address gives readable conflict',async()=>{
 const r=await create({title:'Another',slug:'test'});assert.equal(r.status,409);assert.match((await r.json()).error,/already in use/);
});
test('invalid title and visibility are rejected',async()=>{
 assert.equal((await create({title:' '})).status,400);
 assert.equal((await create({title:'Invalid',visibility:'wrong'})).status,400);
});
test('set failure rolls back gallery and returns JSON',async()=>{
 db.exec("CREATE TRIGGER fail_set BEFORE INSERT ON gallery_sets BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
 const r=await create({title:'Rollback'});assert.equal(r.status,500);assert.ok((await r.json()).error);
 assert.equal(db.prepare("SELECT count(*) AS n FROM galleries WHERE slug='rollback'").get().n,0);
});


