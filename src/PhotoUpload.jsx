import React, {useRef,useState} from 'react';
export default function PhotoUpload({galleryId,archived,onBusy,onComplete,onExpired}) {
 const input=useRef(null);
 const [items,setItems]=useState([]),[running,setRunning]=useState(false);
 const update=(index,patch)=>setItems(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));
 function upload(file,index){return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/admin/galleries/'+encodeURIComponent(galleryId)+'/photos');
  xhr.setRequestHeader('content-type',file.type||'application/octet-stream');xhr.setRequestHeader('x-file-name',encodeURIComponent(file.name));
  xhr.timeout=120000;
  xhr.upload.onprogress=e=>{if(e.lengthComputable)update(index,{progress:Math.round(e.loaded/e.total*100)});};
  xhr.onerror=()=>reject(new Error('Connection interrupted. Try again.'));
  xhr.ontimeout=()=>reject(new Error('Upload timed out. Try again.'));
  xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{}
   if(xhr.status===401){onExpired();reject(new Error('Please sign in again.'));return;}
   if(xhr.status<200||xhr.status>=300)reject(new Error(data?.error||'Upload failed. Try again.'));else resolve(data);
  };xhr.send(file);
 });}
 async function run(rows){setRunning(true);onBusy(true);
  try{for(let i=0;i<rows.length;i++){
   if(['Uploaded','Already uploaded'].includes(rows[i].status))continue;
   const file=rows[i].file;
   if(file.size>25*1024*1024){update(i,{status:'Failed',error:'Each photo must be 25 MB or smaller.'});continue;}
   update(i,{status:'Uploading',progress:0,error:''});
   try{const data=await upload(file,i);update(i,{status:data.duplicate?'Already uploaded':'Uploaded',progress:100});}
   catch(e){update(i,{status:'Failed',error:e.message});}
  }await onComplete();}finally{setRunning(false);onBusy(false);}
 }
 function choose(e){const rows=Array.from(e.target.files||[]).map(file=>({file,status:'Waiting',progress:0,error:''}));e.target.value='';if(!rows.length)return;setItems(rows);run(rows);}
 return <div className="portal-upload">
  <p>{archived?'Restore this gallery to upload more photos.':'Upload photos from your computer into Highlights. JPEG, PNG, WebP, or GIF — up to 25 MB each.'}</p>
  <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={choose} hidden aria-label="Choose photos" disabled={running||archived}/>
  <button type="button" className="portal-primary" onClick={()=>input.current?.click()} disabled={running||archived}>{running?'Uploading photos…':'Upload photos'}</button>
  {!running&&items.some(row=>row.status==='Failed')&&<button type="button" className="portal-secondary" onClick={()=>run(items)} disabled={archived}>Retry failed uploads</button>}
  {!!items.length&&<div className="portal-upload-results" aria-live="polite">{items.map((row,i)=><div key={i}><strong>{row.file.name}</strong><span>{row.status}{row.status==='Uploading'?' '+row.progress+'%':''}{row.error?' — '+row.error:''}</span>{row.status==='Uploading'&&<progress value={row.progress} max="100" aria-label={'Uploading '+row.file.name}/>}</div>)}</div>}
 </div>;
}
