import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, Download, Share2, X, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import "./styles.css";

const sampleImages = [
  "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=1200&q=85"
];

function App() {
  const [active, setActive] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const gallery = useMemo(() => ({
    brandName: "SNAPAPP",
    title: "Jessica & Michael",
    subtitle: "September 19, 2026",
    cover: sampleImages[0],
    showBranding: true,
    passwordProtected: false,
    photos: sampleImages
  }), []);

  const toggleFavorite = (i) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const prev = () => setActive(i => i === 0 ? gallery.photos.length - 1 : i - 1);
  const next = () => setActive(i => i === gallery.photos.length - 1 ? 0 : i + 1);

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">{gallery.showBranding ? gallery.brandName : gallery.title}</div>
        <div className="top-actions">
          <button className="icon-btn" title="Gallery access"><Lock size={18} /></button>
          <button className="favorites-count"><Heart size={17} /> {favorites.size}</button>
        </div>
      </header>

      <section className="hero" style={{backgroundImage:`linear-gradient(rgba(0,0,0,.17),rgba(0,0,0,.28)),url("${gallery.cover}")`}}>
        <div className="hero-content">
          {gallery.showBranding && <div className="eyebrow">SNAPAPP GALLERIES</div>}
          <h1>{gallery.title}</h1>
          <p>{gallery.subtitle}</p>
          <button className="hero-btn" onClick={() => document.querySelector("#gallery")?.scrollIntoView({behavior:"smooth"})}>
            View Gallery
          </button>
        </div>
      </section>

      <main id="gallery" className="gallery-shell">
        <div className="gallery-heading">
          <div>
            <div className="eyebrow dark">CLIENT GALLERY</div>
            <h2>{gallery.title}</h2>
          </div>
          <nav className="filters">
            <button className="active">All</button>
            <button>Photo Booth</button>
            <button>360 Booth</button>
            <button>Favorites</button>
          </nav>
        </div>

        <div className="grid">
          {gallery.photos.map((src, i) => (
            <article className="photo-card" key={src}>
              <img src={src} alt="" onClick={() => setActive(i)} />
              <div className="photo-actions">
                <button onClick={() => toggleFavorite(i)} className={favorites.has(i) ? "selected" : ""}>
                  <Heart size={18} fill={favorites.has(i) ? "currentColor" : "none"} />
                </button>
                <button><Download size={18} /></button>
              </div>
            </article>
          ))}
        </div>
      </main>

      <footer>
        <span>{gallery.showBranding ? "Powered by SnapApp Galleries" : ""}</span>
        <span>Private event gallery</span>
      </footer>

      {active !== null && (
        <div className="lightbox">
          <button className="close" onClick={() => setActive(null)}><X /></button>
          <button className="nav left" onClick={prev}><ChevronLeft /></button>
          <img src={gallery.photos[active]} alt="" />
          <button className="nav right" onClick={next}><ChevronRight /></button>
          <div className="lightbox-actions">
            <button onClick={() => toggleFavorite(active)}><Heart size={18} /> Favorite</button>
            <button><Download size={18} /> Download</button>
            <button><Share2 size={18} /> Share</button>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);