import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, Download, Share2, X, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import "./styles.css";
import { validateZipBlob } from "./zip-validation.js";

const slugFromPath = () => decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ""));

function App() {
  const slug = slugFromPath();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [active, setActive] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockedPassword, setUnlockedPassword] = useState("");
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipJob, setZipJob] = useState(null);

  async function load() {
    if (!slug) { setError("Gallery not found."); setLoading(false); return; }
    try {
      const r = await fetch("/api/galleries/" + encodeURIComponent(slug), { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error === "gallery_not_found" ? "Gallery not found." : "Unable to load this gallery.");
      setGallery(data.gallery);
      setLocked(!!data.gallery.locked);
      setPhotos(data.photos || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!zipJob || !["queued", "processing"].includes(zipJob.status)) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/zip-jobs/" + encodeURIComponent(zipJob.id) + "?token=" + encodeURIComponent(zipJob.token), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to check ZIP preparation status.");
        if (!stopped) {
          setZipJob(current => current?.id === zipJob.id ? { ...current, ...data } : current);
          if (data.status === "failed") setError(data.error || "ZIP preparation failed. Please try again or contact the gallery owner.");
        }
      } catch (e) {
        if (!stopped) setError(e.message || "Unable to check ZIP preparation status.");
      }
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [zipJob?.id, zipJob?.token, zipJob?.status]);

  async function unlock(e) {
    e.preventDefault(); setError("");
    try {
      const r = await fetch("/api/galleries/" + encodeURIComponent(slug) + "/unlock", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error === "invalid_password" ? "Incorrect password." : "Unable to unlock gallery.");
      setGallery(data.gallery); setPhotos(data.photos || []); setLocked(false); setUnlockedPassword(password); setPassword("");
    } catch (e) { setError(e.message); }
  }

  const photoUrl = (p, size) => "/media/" + encodeURIComponent(p.id) + (size ? "?size=" + encodeURIComponent(size) : "");
  const toggleFavorite = i => setFavorites(prev => {
    const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next;
  });
  const prev = () => setActive(i => i === 0 ? photos.length - 1 : i - 1);
  const next = () => setActive(i => i === photos.length - 1 ? 0 : i + 1);
  const coverPhoto = photos.find(p => p.id === gallery?.cover_photo_id) || photos[0];
  const cover = coverPhoto ? photoUrl(coverPhoto, "cover") : "";
  const downloadPhoto = p => {
    const a = document.createElement("a"); a.href = photoUrl(p); a.download = p.original_filename || "photo"; a.click();
  };
  const downloadAll = async () => {
    if (downloadingZip || ["queued", "processing"].includes(zipJob?.status)) return;
    const email = window.prompt("Where should we email the download link when your ZIP is ready?");
    if (email === null) return;
    if (!email.trim()) { window.alert("Enter an email address so we can send the download link."); return; }
    const downloadPin = gallery.has_download_pin
      ? window.prompt("Enter the download PIN to download this gallery.")
      : "";
    if (gallery.has_download_pin && downloadPin === null) return;
    setDownloadingZip(true); setError(""); setZipJob(null);
    try {
      const response = await fetch("/api/galleries/" + encodeURIComponent(slug) + "/zip-jobs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: unlockedPassword, downloadPin })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to start ZIP preparation. Please try again.");
      setZipJob({ id: data.jobId, token: data.accessToken, email: email.trim(), status: "queued" });
    } catch (e) {
      setError(e.message || "Unable to start ZIP preparation. Please try again.");
      window.alert(e.message || "Unable to start ZIP preparation. Please try again.");
    } finally { setDownloadingZip(false); }
  };
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: gallery.title, url: location.href }); else await navigator.clipboard.writeText(location.href); } catch {}
  };

  if (!slug) return <div className="app"><header className="topbar"><div className="wordmark">SNAPAPP GALLERIES</div></header><main className="gallery-shell" style={{textAlign:"center",paddingTop:"12vh",paddingBottom:"12vh"}}><div className="eyebrow dark">WELCOME</div><h1>SnapApp Galleries</h1><p>Beautiful event galleries for sharing your favorite moments.</p><p>Open the private gallery link you received to view your event photos.</p></main><footer><span>SnapApp Galleries</span><span>Event photo sharing</span></footer></div>;

  if (loading) return <div className="app"><main className="gallery-shell"><h2>Loading gallery…</h2></main></div>;
  if (error && !gallery) return <div className="app"><main className="gallery-shell"><h2>{error}</h2><p>This gallery may be unpublished, archived, or the address may be incorrect.</p></main></div>;

  if (locked) return (
    <div className="app">
      <header className="topbar"><div className="wordmark">{gallery.brandName || "SnapApp"}</div></header>
      <main className="gallery-shell">
        <div className="gallery-heading"><div><div className="eyebrow dark">PRIVATE GALLERY</div><h2>{gallery.title}</h2><p>{gallery.subtitle}</p></div></div>
        <form onSubmit={unlock}>
          <label>Gallery password<br/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoFocus /></label>
          <button className="hero-btn" type="submit"><Lock size={16}/> View Gallery</button>
          {error && <p>{error}</p>}
        </form>
      </main>
    </div>
  );

  return (
    <div className="app" style={{"--accent": gallery.accent_color || "#171717"}}>
      <header className="topbar">
        <div className="wordmark">{gallery.show_branding ? (gallery.brand_name || "SNAPAPP") : gallery.title}</div>
        <div className="top-actions"><button className="favorites-count"><Heart size={17}/> {favorites.size}</button></div>
      </header>

      <section className="hero" style={cover ? {backgroundImage:'linear-gradient(rgba(0,0,0,.17),rgba(0,0,0,.28)),url("' + cover + '")',backgroundPosition:"center "+(gallery.cover_position_y??50)+"%"} : {}}>
        <div className="hero-content">
          {gallery.show_branding && <div className="eyebrow">SNAPAPP GALLERIES</div>}
          <h1>{gallery.title}</h1><p>{gallery.subtitle}</p>
          <button className="hero-btn" onClick={()=>document.querySelector("#gallery")?.scrollIntoView({behavior:"smooth"})}>View Gallery</button>
        </div>
      </section>

      <main id="gallery" className="gallery-shell">
        <div className="gallery-heading"><div><div className="eyebrow dark">CLIENT GALLERY</div><h2>{gallery.title}</h2></div>
          <nav className="filters"><button className="active">All</button><button onClick={()=>document.querySelector(".selected")?.scrollIntoView({behavior:"smooth"})}>Favorites ({favorites.size})</button>{gallery.downloads_enabled !== 0 && photos.length>0 && (zipJob?.status === "ready" ? <button onClick={()=>window.location.assign(zipJob.downloadUrl)}><Download size={16}/> Download ZIP</button> : <button onClick={downloadAll} disabled={downloadingZip || ["queued","processing"].includes(zipJob?.status)}><Download size={16}/> {downloadingZip || ["queued","processing"].includes(zipJob?.status) ? "Preparing ZIP…" : zipJob?.status === "failed" ? "Try ZIP again" : "Prepare ZIP"}</button>)}</nav>
        </div>
        {zipJob?.status === "queued" || zipJob?.status === "processing" ? <p role="status">Your ZIP is being prepared. You can leave this page; we’ll email the download link to {zipJob.email} when it’s ready.</p> : null}
        {zipJob?.status === "ready" ? <p role="status">{zipJob.emailStatus === "sent" ? "Your ZIP is ready. We emailed you a secure download link." : "Your ZIP is ready. The email could not be sent, so download it here now."} The link expires in 48 hours.</p> : null}
        {error && <p role="status">{error}</p>}
        {photos.length === 0 ? <p>No photos have been added to this gallery yet.</p> :
        <div className="grid">{photos.map((p,i)=>(
          <article className="photo-card" key={p.id}>
            <img src={photoUrl(p,"thumb")} alt={p.original_filename || ""} loading={i<4?"eager":"lazy"} decoding="async" fetchPriority={i===0?"high":"auto"} onClick={()=>setActive(i)}/>
            <div className="photo-actions">
              <button onClick={()=>toggleFavorite(i)} className={favorites.has(i)?"selected":""}><Heart size={18} fill={favorites.has(i)?"currentColor":"none"}/></button>
              {gallery.downloads_enabled !== 0 && <button onClick={()=>downloadPhoto(p)}><Download size={18}/></button>}
            </div>
          </article>
        ))}</div>}
      </main>

      <footer><span>{gallery.show_branding ? "Powered by SnapApp Galleries" : ""}</span><span>{photos.length} {photos.length===1?"photo":"photos"}</span></footer>

      {active !== null && photos[active] && <div className="lightbox">
        <button className="close" onClick={()=>setActive(null)}><X/></button>
        {photos.length>1 && <button className="nav left" onClick={prev}><ChevronLeft/></button>}
        <img src={photoUrl(photos[active])} alt={photos[active].original_filename || ""} decoding="async" fetchPriority="high"/>
        {photos.length>1 && <button className="nav right" onClick={next}><ChevronRight/></button>}
        <div className="lightbox-actions">
          <button onClick={()=>toggleFavorite(active)}><Heart size={18}/> Favorite</button>
          {gallery.downloads_enabled !== 0 && <button onClick={()=>downloadPhoto(photos[active])}><Download size={18}/> Download</button>}
          <button onClick={share}><Share2 size={18}/> Share</button>
        </div>
      </div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
