import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function Admin() {
  const [token, setToken] = useState(sessionStorage.getItem("snapapp_admin_token") || "");
  const [form, setForm] = useState({ title:"", subtitle:"", visibility:"unlisted", password:"", downloadPin:"", showBranding:true, downloadsEnabled:true, brandName:"SnapApp" });
  const [result, setResult] = useState(null);
  const change = e => setForm({...form, [e.target.name]: e.target.type==="checkbox" ? e.target.checked : e.target.value});
  async function create(e) {
    e.preventDefault();
    sessionStorage.setItem("snapapp_admin_token", token);
    const r = await fetch("/api/admin/galleries", {method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${token}`},body:JSON.stringify(form)});
    setResult(await r.json());
  }
  return <main className="admin-shell">
    <div className="admin-head"><div><div className="eyebrow dark">SNAPAPP GALLERIES</div><h1>New Gallery</h1></div></div>
    <form className="admin-card" onSubmit={create}>
      <label>Admin token<input type="password" value={token} onChange={e=>setToken(e.target.value)} required /></label>
      <div className="form-grid">
        <label>Gallery title<input name="title" value={form.title} onChange={change} required /></label>
        <label>Subtitle / date<input name="subtitle" value={form.subtitle} onChange={change} /></label>
        <label>Visibility<select name="visibility" value={form.visibility} onChange={change}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label>
        <label>Gallery password<input name="password" value={form.password} onChange={change} /></label>
        <label>Download PIN<input name="downloadPin" value={form.downloadPin} onChange={change} /></label>
        <label>Brand name<input name="brandName" value={form.brandName} onChange={change} /></label>
      </div>
      <label className="check"><input type="checkbox" name="showBranding" checked={form.showBranding} onChange={change}/> Show branding</label>
      <label className="check"><input type="checkbox" name="downloadsEnabled" checked={form.downloadsEnabled} onChange={change}/> Allow downloads</label>
      <button className="primary">Create Gallery</button>
      {result && <pre className="result">{JSON.stringify(result,null,2)}</pre>}
    </form>
  </main>
}
createRoot(document.getElementById("root")).render(<Admin/>);