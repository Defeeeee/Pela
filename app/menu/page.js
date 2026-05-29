import Link from "next/link";

const routes = [
  "/",
  "/health",
  "/instant",
  "/closed",
  "/argumentatividad",
  "/autista",
  "/escapa",
  "/argumento",
  "/today",
  "/labura",
  "/buckets",
];

const formatLabel = (route) => (route === "/" ? "Home" : route.replace("/", ""));

export default function MenuPage() {
  return (
    <div className="menu-stage">
      <style>{`
        :root {
          --ink: #f5efe6;
          --muted: rgba(245, 239, 230, 0.65);
          --accent: #ffb454;
          --accent-dark: #b85d2f;
          --card: rgba(16, 10, 9, 0.72);
          --border: rgba(255, 255, 255, 0.08);
        }
        .menu-stage {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 15% 20%, #2c1a12 0%, #130b07 35%, #050303 70%, #020202 100%);
          color: var(--ink);
          font-family: "Bebas Neue", "Space Grotesk", "Helvetica Neue", sans-serif;
          padding: 48px 18px 70px;
          position: relative;
          overflow: hidden;
        }
        .menu-stage::before,
        .menu-stage::after {
          content: "";
          position: absolute;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          filter: blur(16px);
          opacity: 0.35;
          background: radial-gradient(circle, rgba(255, 180, 84, 0.38), rgba(255, 180, 84, 0));
          z-index: 0;
        }
        .menu-stage::before {
          top: -160px;
          left: -120px;
        }
        .menu-stage::after {
          bottom: -170px;
          right: -120px;
        }
        .menu-grain {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
          background-size: 4px 4px;
          opacity: 0.18;
          pointer-events: none;
          z-index: 0;
        }
        .menu-card {
          width: min(960px, 100%);
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 32px 26px 36px;
          position: relative;
          z-index: 1;
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55);
        }
        .menu-title {
          font-size: clamp(2.2rem, 4vw, 3.5rem);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin: 0 0 6px;
          text-align: center;
        }
        .menu-subtitle {
          font-family: "Space Grotesk", "Helvetica Neue", sans-serif;
          font-size: clamp(0.9rem, 2vw, 1.1rem);
          text-align: center;
          color: var(--muted);
          margin: 0 0 28px;
        }
        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 16px;
        }
        .menu-link {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px 14px;
          border-radius: 18px;
          background: linear-gradient(140deg, rgba(255, 180, 84, 0.2), rgba(184, 93, 47, 0.2));
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--ink);
          text-decoration: none;
          font-size: 1.1rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease;
        }
        .menu-link::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.18), transparent 60%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .menu-link:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .menu-link:hover::after {
          opacity: 1;
        }
        .menu-label {
          position: relative;
          z-index: 1;
        }
        .menu-footer {
          margin-top: 26px;
          display: flex;
          justify-content: center;
          font-family: "Space Grotesk", "Helvetica Neue", sans-serif;
          font-size: 0.9rem;
          color: var(--muted);
        }
      `}</style>

      <div className="menu-grain" />

      <div className="menu-card">
        <h1 className="menu-title">Menu</h1>
        <p className="menu-subtitle">Elegi una ruta y entra directo.</p>

        <div className="menu-grid">
          {routes.map((route) => (
            <Link key={route} href={route} className="menu-link">
              <span className="menu-label">{formatLabel(route)}</span>
            </Link>
          ))}
        </div>

        <div className="menu-footer">Nada de descripcion, solo decision.</div>
      </div>
    </div>
  );
}
