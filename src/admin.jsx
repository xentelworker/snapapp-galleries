import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import Dashboard from "./Dashboard";

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
      setUser(null); setPassword("");
    } catch { setError("Unable to sign out. Please try again."); }
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
  return <Dashboard user={user} onLogout={logout} onExpired={()=>setUser(null)} />;
}
createRoot(document.getElementById("root")).render(<Admin/>);
