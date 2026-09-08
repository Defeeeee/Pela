"use client"

import Link from "next/link";
import { useState, useEffect } from "react";
import { quienSoy, entrarConGoogle, salir } from "../lib/sesionCliente";
import { mensajeDeLoginError } from "../lib/erroresLogin";
import { cargarRecords } from "../lib/recordsCliente";

const routesConfig = [
  { path: "/", label: "Inicio / Pelado Random", desc: "Carga un pelado aleatorio con tu Reserva de Pala.", icon: "🥚" },
  { path: "/today", label: "¿Qué pelado sos hoy?", desc: "Test de compatibilidad folicular diario.", icon: "📅" },
  { path: "/buckets", label: "El juego del pelado", desc: "Seguí al pelado feliz antes de que se mezclen.", icon: "🪣" },
  { path: "/clicker", label: "Pala Clicker", desc: "Miná palas de trabajo y automatizá tu producción.", icon: "⛏️" },
  { path: "/escapa", label: "Escapá a la pala", desc: "Evitá el trabajo duro haciendo huir a los pelados.", icon: "🏃" },
  { path: "/autista", label: "Modo Autista", desc: "Estímulos visuales y fluctuación de filtros saturados.", icon: "⚡" },
  { path: "/argumento", label: "Pela-AI™ Pro", desc: "Analizador de argumentatividad mediante redes capilares.", icon: "🧠" },
  { path: "/argumentatividad", label: "Amor Argumentativo", desc: "La tierna historia entre Coriglia y Pelado Feliz.", icon: "💖" },
  { path: "/closed", label: "Q.E.P.D.", desc: "Hoy no se labura ni se argumenta. Cerrado.", icon: "🪦" },
  { path: "/health", label: "Estado del Pela", desc: "Monitoreo en tiempo real de la salud del pelado.", icon: "🏥" },
  { path: "/instant", label: "Pelado Instantáneo", desc: "Visualizador directo e inmediato de imágenes.", icon: "📸" },
  { path: "/labura", label: "Ir a Laburar", desc: "Agarrá la pala y recargá tu crédito de folículos.", icon: "🛠️" },
  { path: "/sitrafo", label: "SITRAFO", desc: "Sistema de Trámites Foliculares de la Nación.", icon: "🏛️" },
  { path: "/afipela", label: "AFIP-ela", desc: "Liquidación y Declaración Jurada del Monotributo Folicular.", icon: "🦅" },
  { path: "/marcha", label: "Marcha por la Pala", desc: "Generá tu cartel oficial para la próxima marcha folicular.", icon: "✊" },
  { path: "/pelardle", label: "Pelardle", desc: "La palabra folicular del día. Seis intentos reglamentarios.", icon: "🟩" },
  { path: "/escapecv", label: "Escape a la pala", desc: "Esquivá las palas. Un juego de supervivencia folicular.", icon: "🏃" },
  { path: "/agarra", label: "Agarrá.io", desc: "Comé palas, crecé de tamaño y morfate a otros pelados en vivo.", icon: "🦠" },
  { path: "/video", label: "Pela TV", desc: "Sistema de Radiodifusión Folicular ininterrumpida.", icon: "📺" },
];

export default function MenuPage() {
  const [showSecret, setShowSecret] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [errorLogin, setErrorLogin] = useState("");
  const [records, setRecords] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const active = localStorage.getItem("pela_secret") === "true";
      setShowSecret(active);
    }
  }, []);

  // El callback de Google vuelve a /menu, así que acá es donde se muestra si
  // el ingreso falló. Se lee de la URL y se borra el parámetro para que no
  // quede pegado si la persona recarga o comparte el link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get("loginError");
    if (codigo) {
      setErrorLogin(mensajeDeLoginError(codigo));
      params.delete("loginError");
      const resto = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (resto ? `?${resto}` : ""));
    }

    quienSoy().then((yo) => {
      setSesion(yo);
      cargarRecords().then((res) => {
        if (res?.records) setRecords(res.records);
      });
    });

    const handleSync = (e) => {
      if (e?.detail) setRecords(e.detail);
    };
    window.addEventListener("pela_records_sync", handleSync);
    return () => window.removeEventListener("pela_records_sync", handleSync);
  }, []);

  const handleTitleDoubleClick = () => {
    const next = !showSecret;
    setShowSecret(next);
    localStorage.setItem("pela_secret", next ? "true" : "false");
  };

  const visibleRoutes = routesConfig.filter((route) => {
    if (route.path === "/clicker") return showSecret;
    return true;
  });

  return (
    <div className="menu-container">
      <style>{`
        :root {
          --gold: #ffeb3b;
          --gold-hover: #ffff72;
          --gold-dim: rgba(255, 235, 59, 0.15);
          --gold-glow: rgba(255, 235, 59, 0.05);
          --card-bg: rgba(20, 20, 10, 0.65);
          --card-border: rgba(255, 255, 255, 0.08);
          --card-border-hover: rgba(255, 235, 59, 0.35);
          --text-main: #ffffff;
          --text-muted: rgba(255, 255, 255, 0.65);
        }

        @keyframes fadeInScale {
          from { 
            opacity: 0; 
            transform: scale(0.97) translateY(15px); 
          }
          to { 
            opacity: 1; 
            transform: scale(1) translateY(0); 
          }
        }

        .menu-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at center, #1b1a03 0%, #080802 60%, #000000 100%);
          color: var(--text-main);
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 60px 20px;
          position: relative;
          overflow-x: hidden;
        }

        .menu-content {
          animation: fadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          width: 100%;
          max-width: 1000px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .menu-header {
          text-align: center;
          margin-bottom: 50px;
          max-width: 700px;
        }

        .menu-title {
          font-size: clamp(2.5rem, 6vw, 3.8rem);
          font-weight: 900;
          letter-spacing: -0.03em;
          margin: 0 0 12px;
          text-transform: uppercase;
          background: linear-gradient(135deg, #ffffff 30%, var(--gold) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 10px 40px rgba(255, 235, 59, 0.15);
        }

        .menu-subtitle {
          font-size: clamp(1rem, 2.5vw, 1.25rem);
          color: var(--text-muted);
          margin: 0;
          line-height: 1.5;
        }

        .menu-sesion {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 14px;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .menu-sesion strong { color: var(--gold); }

        .menu-sesion-btn {
          text-decoration: none;
          display: inline-block;
          background: transparent;
          border: 1px solid var(--card-border-hover);
          color: var(--gold);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }

        /* Blanco de Google: es el botón de un tercero y conviene que se lea así. */
        .menu-sesion-google {
          background: #fff;
          border-color: #fff;
          color: #1f1f1f;
        }

        .menu-login-error {
          margin: 14px auto 0;
          max-width: 420px;
          border: 1px solid rgba(255, 82, 82, 0.4);
          background: rgba(255, 82, 82, 0.08);
          color: #ff8a80;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 0.8rem;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
          width: 100%;
          margin-bottom: 40px;
        }

        .menu-card-link {
          text-decoration: none;
          color: inherit;
          display: block;
          outline: none;
        }

        .menu-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 24px;
          height: 100%;
          min-height: 140px;
          box-sizing: border-box;
          backdrop-filter: blur(16px);
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }

        .menu-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at top left, var(--gold-glow), transparent 70%);
          opacity: 0.5;
          transition: opacity 0.3s ease;
        }

        .menu-card:hover {
          transform: translateY(-8px);
          border-color: var(--card-border-hover);
          background: rgba(30, 30, 15, 0.8);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 25px var(--gold-dim);
        }

        .menu-card:hover .menu-card-arrow {
          transform: translateX(4px);
          color: var(--gold);
        }

        .menu-card:hover .menu-card-icon {
          transform: scale(1.1) rotate(5deg);
        }

        .menu-card-top {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 12px;
          position: relative;
          z-index: 1;
        }

        .menu-card-icon {
          font-size: 2rem;
          line-height: 1;
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 50px;
          height: 50px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 12px;
        }

        .menu-card-text {
          flex: 1;
        }

        .menu-card-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 0 0 4px;
          color: #ffffff;
          transition: color 0.2s ease;
        }

        .menu-card:hover .menu-card-title {
          color: var(--gold);
        }

        .menu-card-desc {
          font-size: 0.9rem;
          color: var(--text-muted);
          line-height: 1.4;
          margin: 0;
        }

        .menu-card-bottom {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          margin-top: auto;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--gold);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          position: relative;
          z-index: 1;
        }

        .menu-card-arrow {
          margin-left: 6px;
          transition: transform 0.3s ease;
          font-size: 1rem;
        }

        .menu-footer {
          margin-top: 20px;
          font-size: 0.9rem;
          color: var(--text-muted);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .menu-footer-tagline {
          font-style: italic;
          opacity: 0.8;
        }

        .menu-footer-badge {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 16px;
          border-radius: 99px;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--gold);
        }

        .menu-records-dashboard {
          margin-top: 20px;
          background: rgba(255, 235, 59, 0.04);
          border: 1px solid rgba(255, 235, 59, 0.2);
          border-radius: 14px;
          padding: 14px 18px;
          width: 100%;
          box-sizing: border-box;
          backdrop-filter: blur(8px);
        }

        .menu-records-title {
          color: var(--gold);
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          margin-bottom: 10px;
          text-transform: uppercase;
          text-align: center;
        }

        .menu-records-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 12px 20px;
        }

        .menu-record-item {
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .menu-record-item .rec-label {
          color: #fff;
          font-weight: 600;
        }

        .menu-record-item .rec-val {
          color: var(--gold);
          font-weight: 700;
        }

        .menu-card-badge {
          display: inline-block;
          margin-top: 8px;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(255, 235, 59, 0.1);
          border: 1px solid rgba(255, 235, 59, 0.25);
          color: var(--gold);
          font-size: 0.75rem;
          font-weight: 700;
        }
      `}</style>

      <div className="menu-content">
        <header className="menu-header">
          <h1 className="menu-title" onDoubleClick={handleTitleDoubleClick} style={{ cursor: "pointer", userSelect: "none" }}>Panel de Control</h1>
          <p className="menu-subtitle">
            Seleccioná tu destino dentro del ecosistema folicular de Pelados y Pala.
          </p>

          {errorLogin && <div className="menu-login-error">{errorLogin}</div>}

          {sesion?.loginDisponible && (
            <div className="menu-sesion">
              {sesion.autenticado ? (
                <>
                  <span>
                    Entraste como <strong>{sesion.nombre || "sin apodo"}</strong>
                  </span>
                  {sesion.nombre && (
                    <Link
                      href={`/p/${encodeURIComponent(sesion.nombre)}`}
                      className="menu-sesion-btn"
                    >
                      Mi legajo
                    </Link>
                  )}
                  <button className="menu-sesion-btn" onClick={salir}>Salir</button>
                </>
              ) : (
                <>
                  <span>Jugás sin cuenta: no entrás al ranking ni al multijugador.</span>
                  <button
                    className="menu-sesion-btn menu-sesion-google"
                    onClick={() => entrarConGoogle("/menu")}
                  >
                    Entrar con Google
                  </button>
                </>
              )}
            </div>
          )}

          {records && (
            <div className="menu-records-dashboard">
              <div className="menu-records-title">🏆 TUS PUNTOS Y RÉCORDS EN LA CUENTA</div>
              <div className="menu-records-grid">
                <div className="menu-record-item">
                  <span className="rec-label">🏃 EscapeCV:</span>
                  <span className="rec-val">Chase {records.escapecv?.chase || 0} / Dodge {records.escapecv?.dodge || 0}</span>
                </div>
                <div className="menu-record-item">
                  <span className="rec-label">🟩 Pelardle:</span>
                  <span className="rec-val">{records.pelardle?.wins || 0} vic. (Racha: {records.pelardle?.currentStreak || 0})</span>
                </div>
                <div className="menu-record-item">
                  <span className="rec-label">🦠 Agarrá.io:</span>
                  <span className="rec-val">Masa {records.agarra?.maxMass || 0}</span>
                </div>
                {records.clicker && (
                  <div className="menu-record-item">
                    <span className="rec-label">⛏️ Clicker:</span>
                    <span className="rec-val">
                      {Math.floor(records.clicker.palas || 0).toLocaleString()} palas {records.clicker.brillo ? `(Brillo ${records.clicker.brillo})` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        <div className="menu-grid">
          {visibleRoutes.map((route) => (
            <Link key={route.path} href={route.path} className="menu-card-link">
              <article className="menu-card">
                <div className="menu-card-top">
                  <div className="menu-card-icon">{route.icon}</div>
                  <div className="menu-card-text">
                    <h2 className="menu-card-title">{route.label}</h2>
                    <p className="menu-card-desc">{route.desc}</p>
                    {route.path === "/escapecv" && records?.escapecv && (records.escapecv.chase > 0 || records.escapecv.dodge > 0) && (
                      <div className="menu-card-badge">🏆 Chase: {records.escapecv.chase} | Dodge: {records.escapecv.dodge}</div>
                    )}
                    {route.path === "/pelardle" && records?.pelardle && records.pelardle.played > 0 && (
                      <div className="menu-card-badge">🏆 {records.pelardle.wins} vic. | Racha: {records.pelardle.currentStreak} (Máx: {records.pelardle.maxStreak})</div>
                    )}
                    {route.path === "/agarra" && records?.agarra && records.agarra.maxMass > 0 && (
                      <div className="menu-card-badge">🏆 Récord Masa: {records.agarra.maxMass}</div>
                    )}
                    {route.path === "/clicker" && records?.clicker && (records.clicker.palas > 0 || records.clicker.brillo > 0) && (
                      <div className="menu-card-badge">🏆 {Math.floor(records.clicker.palas || 0).toLocaleString()} palas {records.clicker.brillo ? `| Brillo: ${records.clicker.brillo}` : ""}</div>
                    )}
                  </div>
                </div>
                <div className="menu-card-bottom">
                  <span>Explorar</span>
                  <span className="menu-card-arrow">→</span>
                </div>
              </article>
            </Link>
          ))}
        </div>

        <footer className="menu-footer">
          <span className="menu-footer-tagline">“Nada de descripción, solo decisión.”</span>
          <div className="menu-footer-badge">Pela Reserve System v2.0</div>
        </footer>
      </div>
    </div>
  );
}
