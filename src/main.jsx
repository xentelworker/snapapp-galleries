import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, Download, Share2, X, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import "./styles.css";

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

  async function unlock(e) {
    e.preventDefault(); setError("");
    try {
      const r = await fetch("/api/galleries/" + encodeURIComponent(slug) + "/unlock", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error === "invalid_password" ? "Incorrect password." : "Unable to unlock gallery.");
      setGallery(data.gallery); setPhotos(data.photos || []); setLocked(false); setPassword("");
    } catch (e) { setError(e.message); }
  }

  const photoUrl = p => "/media/" + encodeURIComponent(p.id);
  const toggleFavorite = i => setFavorites(prev => {
    const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next;
  });
  const prev = () => setActive(i => i === 0 ? photos.length - 1 : i - 1);
  const next = () => setActive(i => i === photos.length - 1 ? 0 : i + 1);
  const cover = photos.length ? photoUrl(photos[0]) : "";
  const downloadPhoto = p => {
    const a = document.createElement("a"); a.href = photoUrl(p); a.download = p.original_filename || "photo"; a.click();
  };
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: gallery.title, url: location.href }); else await navigator.clipboard.writeText(location.href); } catch {}
  };

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

      <section className="hero" style={cover ? {backgroundImage:'linear-gradient(rgba(0,0,0,.17),rgba(0,0,0,.28)),url("' + cover + '")'} : {}}>
        <div className="hero-content">
          {gallery.show_branding && <div className="eyebrow">SNAPAPP GALLERIES</div>}
          <h1>{gallery.title}</h1><p>{gallery.subtitle}</p>
          <button className="hero-btn" onClick={()=>document.querySelector("#gallery")?.scrollIntoView({behavior:"smooth"})}>View Gallery</button>
        </div>
      </section>

      <main id="gallery" className="gallery-shell">
        <div className="gallery-heading"><div><div className="eyebrow dark">CLIENT GALLERY</div><h2>{gallery.title}</h2></div>
          <nav className="filters"><button className="active">All</button><button onClick={()=>document.querySelector(".selected")?.scrollIntoView({behavior:"smooth"})}>Favorites ({favorites.size})</button></nav>
        </div>
        {photos.length === 0 ? <p>No photos have been added to this gallery yet.</p> :
        <div className="grid">{photos.map((p,i)=>(
          <article className="photo-card" key={p.id}>
            <img src={photoUrl(p)} alt={p.original_filename || ""} onClick={()=>setActive(i)}/>
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
        <img src={photoUrl(photos[active])} alt={photos[active].original_filename || ""}/>
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
