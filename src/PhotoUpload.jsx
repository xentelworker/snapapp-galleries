import React,{useRef,useState} from 'react';

const MAX_FILE=25*1024*1024;
function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Could not create image preview.")),type,quality));}
async function resizeBlob(source,maxWidth,maxHeight,quality){
 const bitmap=await createImageBitmap(source);
 try{
  const scale=Math.min(1,maxWidth/bitmap.width,maxHeight/bitmap.height);
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Image preview is unavailable in this browser.");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let blob=await canvasBlob(canvas,"image/webp",quality);
  if(blob.type!=="image/webp")blob=await canvasBlob(canvas,"image/jpeg",quality);
  return blob;
 }finally{bitmap.close?.();}
}
async function createVariants(file){
 if(file.type==="image/gif")throw new Error("Animated GIF previews are left as the original.");
 const [thumbnail,cover]=await Promise.all([resizeBlob(file,640,640,.78),resizeBlob(file,1800,1400,.84)]);
 return {thumbnail,cover};
}
async function saveVariants(galleryId,photoId,file){
 const variants=await createVariants(file);
 const form=new FormData();
 form.append("thumbnail",variants.thumbnail,"thumbnail.webp");
 form.append("cover",variants.cover,"cover.webp");
 const response=await fetch("/api/admin/galleries/"+encodeURIComponent(galleryId)+"/photos/"+encodeURIComponent(photoId)+"/variants",{method:"POST",credentials:"same-origin",body:form});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(data?.error||"Could not save optimized previews.");
}
export default function PhotoUpload({galleryId,archived,onBusy,onComplete,onExpired,photos=[]}) {
 const input=useRef(null);
 const [items,setItems]=useState([]),[running,setRunning]=useState(false),[optimizing,setOptimizing]=useState(false),[optimizationStatus,setOptimizationStatus]=useState("");
 const update=(index,patch)=>setItems(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));
 function upload(file,index){return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open("POST","/api/admin/galleries/"+encodeURIComponent(galleryId)+"/photos");
  xhr.withCredentials=true;
  xhr.setRequestHeader("content-type",file.type||"application/octet-stream");xhr.setRequestHeader("x-file-name",encodeURIComponent(file.name));
  xhr.timeout=120000;
  xhr.upload.onprogress=e=>{if(e.lengthComputable)update(index,{progress:Math.round(e.loaded/e.total*100)});};
  xhr.onerror=()=>reject(new Error("Connection interrupted. Try again."));
  xhr.ontimeout=()=>reject(new Error("Upload timed out. Try again."));
  xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{}
   if(xhr.status===401){onExpired();reject(new Error("Please sign in again."));return;}
   if(xhr.status<200||xhr.status>=300)reject(new Error(data?.error||"Upload failed. Try again."));else resolve(data);
  };xhr.send(file);
 });}
 async function run(rows){
  setRunning(true);onBusy(true);
  try{
   let cursor=0;
   const worker=async()=>{while(cursor<rows.length){const i=cursor++;if(["Uploaded","Already uploaded"].includes(rows[i].status))continue;
    const file=rows[i].file;
    if(file.size>MAX_FILE){update(i,{status:"Failed",error:"Each photo must be 25 MB or smaller."});continue;}
    update(i,{status:"Uploading",progress:0,error:"",previewError:""});
    try{
     const data=await upload(file,i);
     if(data.duplicate){update(i,{status:"Already uploaded",progress:100});continue;}
     update(i,{status:"Generating previews",progress:100});
     try{await saveVariants(galleryId,data.photoId,file);update(i,{status:"Uploaded",previewError:""});}
     catch(error){update(i,{status:"Uploaded",previewError:"Preview optimization pending — use Optimize existing photos below."});}
    }catch(error){update(i,{status:"Failed",error:error.message});}
   }};
   await Promise.all(Array.from({length:Math.min(2,rows.length)},worker));
   await onComplete();
  }finally{setRunning(false);onBusy(false);}
 }
 async function optimizeExisting(){
  const pending=photos.filter(p=>p.mime_type!=="image/gif"&&(!p.thumbnail_key||!p.cover_key));
  if(!pending.length)return;
  setOptimizing(true);onBusy(true);setOptimizationStatus("Preparing previews…");
  let completed=0,failed=0;
  try{
   for(const photo of pending){
    setOptimizationStatus("Optimizing "+(completed+failed+1)+" of "+pending.length+": "+photo.original_filename);
    try{
     const response=await fetch("/media/"+encodeURIComponent(photo.id),{credentials:"same-origin",cache:"no-store"});
     if(!response.ok)throw new Error("Could not read original photo.");
     const file=await response.blob();
     if(file.type==="image/gif")throw new Error("Animated GIF skipped.");
     await saveVariants(galleryId,photo.id,file);
     completed++;
    }catch(error){failed++;console.warn("Photo preview optimization failed",photo.id,error);}
   }
   setOptimizationStatus("Optimization complete: "+completed+" updated"+(failed?", "+failed+" skipped or failed":"")+".");
   await onComplete();
  }finally{setOptimizing(false);onBusy(false);}
 }
 function choose(e){const rows=Array.from(e.target.files||[]).map(file=>({file,status:"Waiting",progress:0,error:"",previewError:""}));e.target.value="";if(!rows.length)return;setItems(rows);run(rows);}
 const pendingCount=photos.filter(p=>p.mime_type!=="image/gif"&&(!p.thumbnail_key||!p.cover_key)).length;
 return <div className="portal-upload">
  <p>{archived?"Restore this gallery to upload more photos.":"Upload photos from your computer into Highlights. JPEG, PNG, WebP, or GIF — up to 25 MB each. SnapApp creates smaller previews for faster gallery browsing; original files remain available for downloads."}</p>
  <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={choose} hidden aria-label="Choose photos" disabled={running||optimizing||archived}/>
  <button type="button" className="portal-primary" onClick={()=>input.current?.click()} disabled={running||optimizing||archived}>{running?"Uploading photos…":"Upload photos"}</button>
  {pendingCount>0&&<button type="button" className="portal-secondary" style={{marginLeft:8}} onClick={optimizeExisting} disabled={running||optimizing||archived}>{optimizing?"Optimizing previews…":"Optimize existing photos ("+pendingCount+")"}</button>}
  {optimizationStatus&&<p role="status">{optimizationStatus}</p>}
  {!running&&items.some(row=>row.status==="Failed")&&<button type="button" className="portal-secondary" onClick={()=>run(items)} disabled={archived||optimizing}>Retry failed uploads</button>}
  {!!items.length&&<div className="portal-upload-results" aria-live="polite">{items.map((row,i)=><div key={i}><strong>{row.file.name}</strong><span>{row.status}{row.status==="Uploading"?" "+row.progress+"%":""}{row.error?" — "+row.error:""}{row.previewError?" — "+row.previewError:""}</span>{row.status==="Uploading"&&<progress value={row.progress} max="100" aria-label={"Uploading "+row.file.name}/>}</div>)}</div>}
 </div>;
}
