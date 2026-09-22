import React, { useEffect, useState } from "react";
import { LayoutDashboard, Images, Archive, Plus, Search, ArrowLeft, Image, LogOut, RefreshCw } from "lucide-react";
import "./dashboard.css";
import PhotoUpload from './PhotoUpload.jsx';
const blank={title:"",subtitle:"",eventDate:"",autoArchiveEnabled:true,visibility:"unlisted",status:"draft",brandName:"SnapApp",accentColor:"#171717",showBranding:true,downloadsEnabled:true,password:"",downloadPin:""};
const date=value=>new Date(value.replace(" ","T")+"Z").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
export default function Dashboard({user,onLogout,onExpired}) {
 const [galleries,setGalleries]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [page,setPage]=useState("dashboard"),[query,setQuery]=useState(""),[status,setStatus]=useState("all");
 const [selected,setSelected]=useState(null),[photos,setPhotos]=useState([]),[form,setForm]=useState({...blank});
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[removePassword,setRemovePassword]=useState(false),[removePin,setRemovePin]=useState(false);
 async function api(path,options={}) {
  const r=await fetch("/api/admin/galleries"+path,{credentials:"same-origin",cache:"no-store",...options,headers:{"content-type":"application/json",...options.headers}});
  const data=await r.json().catch(()=>null);
  if(r.status===401){onExpired();throw new Error("Your session has expired. Please sign in again.");}
  if(!r.ok||!data)throw new Error(data?.error||"Unable to complete the request. Please try again.");
  return data;
 }
 async function load(){setLoading(true);setError("");try{setGalleries((await api("")).galleries);}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 function navigate(next){setPage(next);setSelected(null);setQuery("");setStatus("all");setError("");setNotice("");}
 function newGallery(){setForm({...blank});setSelected(null);setPhotos([]);setRemovePassword(false);setRemovePin(false);setPage("edit");setError("");setNotice("");}
 async function open(g){setBusy(true);setError("");setNotice("");try{
  const data=await api("/"+encodeURIComponent(g.id));const row=data.gallery;
  setSelected(row);setPhotos(data.photos);setForm({title:row.title,subtitle:row.subtitle||"",eventDate:row.event_date||"",autoArchiveEnabled:!!row.auto_archive_enabled,visibility:row.visibility,status:row.status,brandName:row.brand_name||"",accentColor:row.accent_color||"#171717",showBranding:!!row.show_branding,downloadsEnabled:!!row.downloads_enabled,password:"",downloadPin:""});
  setRemovePassword(false);setRemovePin(false);setPage("edit");
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 async function changeStatus(g,next){setBusy(true);setError("");setNotice("");try{
  const data=await api("/"+encodeURIComponent(g.id),{method:"PATCH",body:JSON.stringify({status:next})});
  setGalleries(rows=>rows.map(row=>row.id===g.id?data.gallery:row));setNotice(next==="archived"?"Gallery archived.":next==="draft"?"Gallery moved to drafts.":"Gallery published.");
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 async function save(e){e.preventDefault();setBusy(true);setError("");setNotice("");try{
  const body={...form};
  if(selected){if(!form.password&&!removePassword)delete body.password;if(!form.downloadPin&&!removePin)delete body.downloadPin;if(removePassword)body.password="";if(removePin)body.downloadPin="";}
  await api(selected?"/"+encodeURIComponent(selected.id):"",{method:selected?"PATCH":"POST",body:JSON.stringify(body)});
  const rows=(await api("")).galleries;setGalleries(rows);setPage("galleries");setSelected(null);setNotice(selected?"Gallery updated.":"Gallery created.");
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const change=e=>setForm({...form,[e.target.name]:e.target.type==="checkbox"?e.target.checked:e.target.value});
 const counts={all:galleries.length,published:galleries.filter(g=>g.status==="published").length,draft:galleries.filter(g=>g.status==="draft").length,archived:galleries.filter(g=>g.status==="archived").length};
 const visible=galleries.filter(g=>(page==="archive"?g.status==="archived":status==="all"?g.status!=="archived":g.status===status)&&[g.title,g.subtitle,g.slug].join(" ").toLowerCase().includes(query.toLowerCase()));
 const title=page==="edit"?(selected?"Manage gallery":"New gallery"):page==="archive"?"Archived galleries":page==="galleries"?"All galleries":"Dashboard";
 return <div className="portal">
  <aside className="portal-sidebar">
   <div className="portal-brand"><div className="portal-mark"><Images size={24}/></div><div><strong>SnapApp Galleries</strong><small>Client portal</small></div></div>
   <nav aria-label="Admin navigation">{[["dashboard",LayoutDashboard,"Dashboard"],["galleries",Images,"Galleries"],["archive",Archive,"Archive"]].map(([key,Icon,label])=><button key={key} className={page===key?"active":""} onClick={()=>navigate(key)} disabled={busy}><Icon size={18}/>{label}{key==="archive"&&counts.archived>0&&<span>{counts.archived}</span>}</button>)}</nav>
   <div className="portal-account"><small>Signed in as</small><span>{user.email}</span><button onClick={onLogout} disabled={busy}><LogOut size={16}/>Sign out</button></div>
  </aside>
  <main className="portal-main">
   <header className="portal-header"><div><div className="portal-eyebrow">YOUR PHOTO GALLERIES</div><h1>{title}</h1><p>{page==="edit"?"Keep every detail ready for your clients.":"A home for every event and every captured moment."}</p></div>{page!=="edit"&&<button className="portal-primary" onClick={newGallery} disabled={busy}><Plus size={18}/>New gallery</button>}</header>
   {error&&<div role="alert" className="portal-error">{error}</div>}{notice&&<div role="status" className="portal-success">{notice}</div>}
   {page!=="edit"&&<>
    {page==="dashboard"&&<section className="portal-stats" aria-label="Gallery overview">{[["All galleries",counts.all,"all"],["Published",counts.published,"published"],["Drafts",counts.draft,"draft"],["Photos",galleries.reduce((n,g)=>n+g.photo_count,0),"photos"]].map(([label,count,key])=><div className="portal-stat" key={key}><span>{label}</span><strong>{loading?"—":count}</strong><small>{key==="photos"?"Across all your galleries":key==="published"?"Ready for your clients":key==="draft"?"Work in progress":"Your collection"}</small></div>)}</section>}
    <section className="portal-panel">
     <div className="portal-list-heading"><div><h2>{page==="archive"?"Archive":page==="dashboard"?"Recent galleries":"Your galleries"}</h2><p>{page==="archive"?"Restore a gallery to drafts whenever you need it.":"Open a gallery to manage its settings and photos."}</p></div><button className="portal-secondary" onClick={load} disabled={loading||busy} aria-label="Refresh galleries"><RefreshCw size={16}/></button></div>
     <div className="portal-tools"><label className="portal-search"><Search size={18}/><input aria-label="Search galleries" placeholder="Search galleries…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{page!=="archive"&&<select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All active galleries</option><option value="published">Published</option><option value="draft">Drafts</option><option value="archived">Archived</option></select>}</div>
     {loading?<div className="portal-empty" role="status">Loading galleries…</div>:visible.length===0?<div className="portal-empty"><Images size={36}/><h3>{query?"No matching galleries":"No galleries here yet"}</h3><p>{query?"Try another title or change the filter.":"Create a gallery to start organizing your photos."}</p>{!query&&page!=="archive"&&<button onClick={newGallery} className="portal-primary">Create your first gallery</button>}</div>:
      <div className="portal-list">{visible.map(g=><article key={g.id} className="portal-row">
       <div className="portal-thumb"><Image size={25}/></div>
       <button className="portal-row-name" onClick={()=>open(g)} disabled={busy}><strong>{g.title}</strong><span>{g.subtitle||"No subtitle"} · {g.photo_count} photos · {g.set_count} sets</span><small>Created {date(g.created_at)} · {g.slug}</small><small>{g.status==="archived"?"Archived — photos retained":g.auto_archive_enabled?(g.expires_at?"Auto-archive: "+new Date(g.expires_at).toLocaleDateString(undefined,{timeZone:"UTC"}):"Auto-archive: set an event date"):"Automatic archive off"}</small></button>
       <span className={"portal-badge "+g.status}>{g.status}</span>
       <div className="portal-row-actions"><button onClick={()=>open(g)} disabled={busy}>Manage</button><button disabled={busy} onClick={()=>changeStatus(g,g.status==="archived"?"draft":"archived")}>{g.status==="archived"?"Restore":"Archive"}</button></div>
      </article>)}</div>}
     {!loading&&<div className="portal-list-footer">{visible.length} {visible.length===1?"gallery":"galleries"} shown</div>}
    </section>
   </>}
   {page==="edit"&&<>
    <button className="portal-back" onClick={()=>navigate("galleries")} disabled={busy}><ArrowLeft size={16}/>Back to galleries</button>
    <form className="portal-panel portal-editor" onSubmit={save}>
     <div><h2>Gallery details</h2>{selected&&<p>Gallery address: <strong>{selected.slug}</strong></p>}</div>
     <div className="portal-form-grid">
      <label>Gallery title<input name="title" value={form.title} onChange={change} required maxLength={200}/></label>
      <label>Subtitle<input name="subtitle" value={form.subtitle} onChange={change} maxLength={500}/></label>
      <label>Status<select name="status" value={form.status} onChange={change}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      <label>Visibility<select name="visibility" value={form.visibility} onChange={change}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label>
      <label>Brand name<input name="brandName" value={form.brandName} onChange={change} maxLength={200}/></label>
      <label>Accent color<input name="accentColor" type="color" value={form.accentColor} onChange={change}/></label>
     </div>
     <h2>Automatic archive</h2><div className="portal-form-grid"><label>Event date<input type="date" name="eventDate" value={form.eventDate} onChange={change}/></label></div><label className="portal-check"><input type="checkbox" name="autoArchiveEnabled" checked={form.autoArchiveEnabled} onChange={change}/>Automatically archive after 3 months</label><p className="portal-muted">The cycle starts on the event date. Archived photos stay stored and can be restored. Restoring turns automatic archive off.</p>{selected?.expires_at&&<p>Scheduled archive: {new Date(selected.expires_at).toLocaleDateString(undefined,{timeZone:"UTC"})} (UTC). Save changes to update the schedule.</p>}<h2>Access and downloads</h2>
     <div className="portal-form-grid">
      <label>Gallery password<input name="password" type="password" autoComplete="new-password" value={form.password} onChange={change} disabled={removePassword} maxLength={256} placeholder={selected?.has_password?"Leave blank to keep current password":"Optional"}/></label>
      <label>Download PIN<input name="downloadPin" type="password" autoComplete="new-password" value={form.downloadPin} onChange={change} disabled={removePin} maxLength={256} placeholder={selected?.has_download_pin?"Leave blank to keep current PIN":"Optional"}/></label>
     </div>
     {selected?.has_password===1&&<label className="portal-check"><input type="checkbox" checked={removePassword} onChange={e=>setRemovePassword(e.target.checked)}/>Remove existing gallery password</label>}
     {selected?.has_download_pin===1&&<label className="portal-check"><input type="checkbox" checked={removePin} onChange={e=>setRemovePin(e.target.checked)}/>Remove existing download PIN</label>}
     <label className="portal-check"><input type="checkbox" name="showBranding" checked={form.showBranding} onChange={change}/>Show branding</label>
     <label className="portal-check"><input type="checkbox" name="downloadsEnabled" checked={form.downloadsEnabled} onChange={change}/>Allow downloads</label>
     <div className="portal-save"><button className="portal-primary" disabled={busy}>{busy?"Saving…":selected?"Save changes":"Create gallery"}</button><button type="button" className="portal-secondary" onClick={()=>navigate("galleries")} disabled={busy}>Cancel</button></div>
    </form>
    {selected&&<section className="portal-panel portal-editor"><h2>Photos <span className="portal-muted">({photos.length})</span></h2><PhotoUpload key={selected.id} galleryId={selected.id} archived={selected.status==="archived"} onBusy={setBusy} onExpired={onExpired} onComplete={async()=>{try{const data=await api("/"+encodeURIComponent(selected.id));setPhotos(data.photos);setGalleries(rows=>rows.map(g=>g.id===selected.id?data.gallery:g));}catch(e){setError(e.message);}}}/>{photos.length?<div className="portal-photos">{photos.map(p=><a key={p.id} href={"/media/"+encodeURIComponent(p.id)} target="_blank" rel="noreferrer"><img src={"/media/"+encodeURIComponent(p.id)} alt={p.original_filename} loading="lazy"/><span>{p.original_filename}</span></a>)}</div>:<div className="portal-empty"><Image size={32}/><h3>No photos yet</h3><p>Use Upload photos above to add your first images.</p></div>}</section>}
   </>}
  </main>
 </div>;
}


