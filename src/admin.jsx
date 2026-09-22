import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function Admin() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    sessionStorage.removeItem("snapapp_admin_token");
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async r => { if (r.ok) setUser((await r.json()).user); })
      .catch(() => setError("Unable to check your session. Please sign in again."))
      .finally(() => setChecking(false));
  }, []);
  async function login(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await r.json();
      setPassword("");
      if (!r.ok) { setError(data.error || "Unable to sign in."); return; }
      setUser(data.user);
    } catch { setError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!r.ok) throw new Error();
      setUser(null); setResult(null); setPassword("");
    } catch { setError("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }
  const [form, setForm] = useState({ title:"", subtitle:"", visibility:"unlisted", password:"", downloadPin:"", showBranding:true, downloadsEnabled:true, brandName:"SnapApp" });
  const [result, setResult] = useState(null);
  const change = e => setForm({...form, [e.target.name]: e.target.type==="checkbox" ? e.target.checked : e.target.value});
  async function create(e) {
    e.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const r = await fetch("/api/admin/galleries", {method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(form)});
      if (r.status === 401) { setUser(null); setError("Your session has expired. Please sign in again."); return; }
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Unable to create the gallery."); return; }
      setResult(data);
    } catch { setError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  if (checking) return <main className="login-page"><p role="status">Checking your session…</p></main>;
  if (!user) return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-logo" aria-hidden="true">S</div>
      <div className="eyebrow dark">SNAPAPP GALLERIES</div>
      <h1 id="login-title">Welcome back</h1>
      <p className="login-subtitle">Sign in to manage your galleries.</p>
      <form onSubmit={login}>
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="login-hint">Use your Audio Guestbook account.</p>
    </section>
  </main>;
  return <main className="admin-shell">
    <div className="admin-head"><div><div className="eyebrow dark">SNAPAPP GALLERIES</div><h1>New Gallery</h1></div><button className="signout" onClick={logout} disabled={busy}>Sign out</button></div>
    {error && <p className="login-error" role="alert">{error}</p>}
    <form className="admin-card" onSubmit={create}>
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
      <button className="primary" disabled={busy}>{busy ? "Creating…" : "Create Gallery"}</button>
      {result && <pre className="result">{JSON.stringify(result,null,2)}</pre>}
    </form>
  </main>
}
createRoot(document.getElementById("root")).render(<Admin/>);