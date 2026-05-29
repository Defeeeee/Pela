import Link from "next/link";

const routesConfig = [
  { path: "/", label: "Inicio / Pelado Random", desc: "Carga un pelado aleatorio con tu Reserva de Pala.", icon: "🥚" },
  { path: "/today", label: "¿Qué pelado sos hoy?", desc: "Test de compatibilidad folicular diario.", icon: "📅" },
  { path: "/buckets", label: "El juego del pelado", desc: "Seguí al pelado feliz antes de que se mezclen.", icon: "🪣" },
  { path: "/escapa", label: "Escapá a la pala", desc: "Evitá el trabajo duro haciendo huir a los pelados.", icon: "🏃" },
  { path: "/autista", label: "Modo Autista", desc: "Estímulos visuales y fluctuación de filtros saturados.", icon: "⚡" },
  { path: "/argumento", label: "Pela-AI™ Pro", desc: "Analizador de argumentatividad mediante redes capilares.", icon: "🧠" },
  { path: "/argumentatividad", label: "Amor Argumentativo", desc: "La tierna historia entre Coriglia y Pelado Feliz.", icon: "💖" },
  { path: "/closed", label: "Q.E.P.D.", desc: "Hoy no se labura ni se argumenta. Cerrado.", icon: "🪦" },
  { path: "/health", label: "Estado del Pela", desc: "Monitoreo en tiempo real de la salud del pelado.", icon: "🏥" },
  { path: "/instant", label: "Pelado Instantáneo", desc: "Visualizador directo e inmediato de imágenes.", icon: "📸" },
  { path: "/labura", label: "Ir a Laburar", desc: "Agarrá la pala y recargá tu crédito de folículos.", icon: "🛠️" },
];

export default function MenuPage() {
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
      `}</style>

      <div className="menu-content">
        <header className="menu-header">
          <h1 className="menu-title">Panel de Control</h1>
          <p className="menu-subtitle">
            Seleccioná tu destino dentro del ecosistema folicular de Pelados y Pala.
          </p>
        </header>

        <div className="menu-grid">
          {routesConfig.map((route) => (
            <Link key={route.path} href={route.path} className="menu-card-link">
              <article className="menu-card">
                <div className="menu-card-top">
                  <div className="menu-card-icon">{route.icon}</div>
                  <div className="menu-card-text">
                    <h2 className="menu-card-title">{route.label}</h2>
                    <p className="menu-card-desc">{route.desc}</p>
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
