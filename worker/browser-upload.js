import { adminUser } from './auth.js';
import { archiveDue } from './lifecycle.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const LIMIT=25*1024*1024;
function imageType(b) {
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
  const text=new TextDecoder().decode(b.slice(0,12));
  if(text.startsWith('GIF87a')||text.startsWith('GIF89a'))return 'image/gif';
  if(text.startsWith('RIFF')&&text.slice(8)==='WEBP')return 'image/webp';
  return null;
}
export async function browserUpload(request,env) {
  const match=new URL(request.url).pathname.match(/^\/api\/admin\/galleries\/([^/]+)\/photos$/);
  if(!match)return null;
  if(!await adminUser(request,env))return json({error:'Please sign in again.'},401);
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  try {
    await archiveDue(env);
    const galleryId=decodeURIComponent(match[1]);
    const gallery=await env.DB.prepare('SELECT status FROM galleries WHERE id=?').bind(galleryId).first();
    if(!gallery)return json({error:'Gallery not found.'},404);
    if(gallery.status==='archived')return json({error:'Restore this gallery before uploading photos.'},409);
    if(Number(request.headers.get('content-length'))>LIMIT)return json({error:'Each photo must be 25 MB or smaller.'},413);
    const filename=decodeURIComponent(request.headers.get('x-file-name')||'photo');
    if(!filename.trim()||filename.length>255)return json({error:'Use a filename under 255 characters.'},400);
    const reader=request.body?.getReader();
    if(!reader)return json({error:'Choose a photo to upload.'},400);
    const chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();return json({error:'Each photo must be 25 MB or smaller.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const mime=imageType(bytes);
    if(!mime)return json({error:'Choose a JPEG, PNG, WebP, or GIF image.'},415);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const existing=await env.DB.prepare('SELECT id FROM photos WHERE gallery_id=? AND sha256=?').bind(galleryId,digest).first();
    if(existing)return json({ok:true,duplicate:true,photoId:existing.id});
    const set=await env.DB.prepare('SELECT id FROM gallery_sets WHERE gallery_id=? ORDER BY sort_order,created_at LIMIT 1').bind(galleryId).first();
    if(!set)return json({error:'This gallery has no photo set. Please try another gallery.'},409);
    const photoId='pho_'+crypto.randomUUID().replaceAll('-','');
    const key=`galleries/${galleryId}/originals/${photoId}`;
    await env.PHOTOS.put(key,bytes,{httpMetadata:{contentType:mime}});
    try {
      await env.DB.prepare('INSERT INTO photos (id,gallery_id,set_id,storage_key,original_filename,mime_type,bytes,sha256) VALUES (?,?,?,?,?,?,?,?)').bind(photoId,galleryId,set.id,key,filename,mime,size,digest).run();
    } catch(error) {
      await env.PHOTOS.delete(key);
      const duplicate=await env.DB.prepare('SELECT id FROM photos WHERE gallery_id=? AND sha256=?').bind(galleryId,digest).first();
      if(duplicate)return json({ok:true,duplicate:true,photoId:duplicate.id});
      throw error;
    }
    return json({ok:true,photoId},201);
  }catch{return json({error:'Unable to upload this photo. Please try again.'},500);}
}
