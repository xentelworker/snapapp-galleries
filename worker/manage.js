import { adminUser } from "./auth.js";
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const fields = `g.id,g.slug,g.title,g.subtitle,g.status,g.visibility,g.downloads_enabled,g.show_branding,g.brand_name,g.accent_color,g.created_at,g.updated_at,
CASE WHEN g.password_hash IS NULL THEN 0 ELSE 1 END AS has_password,
CASE WHEN g.download_pin_hash IS NULL THEN 0 ELSE 1 END AS has_download_pin,
(SELECT COUNT(*) FROM photos p WHERE p.gallery_id=g.id) AS photo_count,
(SELECT COUNT(*) FROM gallery_sets s WHERE s.gallery_id=g.id) AS set_count`;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
export async function manageGalleries(request,env) {
 const path=new URL(request.url).pathname;
 const match=path.match(/^\/api\/admin\/galleries\/([^/]+)$/);
 if(!(path==="/api/admin/galleries"&&request.method==="GET")&&!match)return null;
 if(!await adminUser(request,env))return json({error:"Please sign in again."},401);
 try {
  if(!match){const rows=await env.DB.prepare("SELECT "+fields+" FROM galleries g ORDER BY g.created_at DESC,g.id DESC").all();return json({galleries:rows.results||[]});}
  const galleryId=decodeURIComponent(match[1]);
  const gallery=await env.DB.prepare("SELECT "+fields+" FROM galleries g WHERE g.id=?").bind(galleryId).first();
  if(!gallery)return json({error:"Gallery not found."},404);
  if(request.method==="GET"){
   const photos=await env.DB.prepare("SELECT id,original_filename,mime_type,bytes,created_at FROM photos WHERE gallery_id=? ORDER BY sort_order,created_at").bind(galleryId).all();
   return json({gallery,photos:photos.results||[]});
  }
  if(request.method!=="PATCH")return json({error:"Method not allowed."},405);
  let body;try{body=await request.json();}catch{return json({error:"Invalid gallery details."},400);}
  if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"Invalid gallery details."},400);
  const updates=[],values=[];
  const set=(key,value)=>{updates.push(key+"=?");values.push(value);};
  for(const [key,column,max] of [["title","title",200],["subtitle","subtitle",500],["brandName","brand_name",200],["accentColor","accent_color",7]]){
   if(!(key in body))continue;
   if(typeof body[key]!=="string"||body[key].length>max||(key==="title"&&!body[key].trim())||(key==="accentColor"&&!/^#[a-f0-9]{6}$/i.test(body[key])))return json({error:"Enter valid gallery details."},400);
   set(column,body[key].trim());
  }
  for(const [key,choices] of [["status",["draft","published","archived"]],["visibility",["public","unlisted","private"]]]){
   if(!(key in body))continue;
   if(!choices.includes(body[key]))return json({error:"Choose a valid "+key+"."},400);
   set(key,body[key]);
  }
  for(const [key,column] of [["showBranding","show_branding"],["downloadsEnabled","downloads_enabled"]]){
   if(!(key in body))continue;
   if(typeof body[key]!=="boolean")return json({error:"Invalid gallery settings."},400);
   set(column,body[key]?1:0);
  }
  for(const [key,column] of [["password","password_hash"],["downloadPin","download_pin_hash"]]){
   if(!(key in body))continue;
   if(typeof body[key]!=="string"||body[key].length>256)return json({error:"Invalid access settings."},400);
   set(column,body[key]?await hash(body[key]):null);
  }
  if(!updates.length)return json({error:"No changes to save."},400);
  await env.DB.prepare("UPDATE galleries SET "+updates.join(",")+",updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(...values,galleryId).run();
  const updated=await env.DB.prepare("SELECT "+fields+" FROM galleries g WHERE g.id=?").bind(galleryId).first();
  return json({gallery:updated});
 }catch{return json({error:"Unable to save or load this gallery. Please try again."},500);}
}
