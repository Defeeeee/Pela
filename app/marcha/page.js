"use client"

import { useState, useEffect } from "react";
import Link from "next/link";

const CONSIGNAS_CHIPS = [
  "¡Pelados unidos jamás serán vencidos!",
  "Basta de discriminación capilar",
  "Subsidio YA para el minoxidil",
  "Ni un pelado menos",
  "Paro general folicular ¡ya!",
  "Gorra libre y gratuita para el pueblo"
];

export default function MarchaPage() {
  const [convocatoria, setConvocatoria] = useState(null);
  const [consigna, setConsigna] = useState("");
  const [gremio, setGremio] = useState("");
  const [cartelUrl, setCartelUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("/api/marcha?action=convocatoria")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setConvocatoria(data);
          setGremio(data.gremioSugerido);
        }
      })
      .catch(() => {});
  }, []);

  const handleGenerar = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/marcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consigna, gremio })
      });

      if (!res.ok) throw new Error("bad response");

      const blob = await res.blob();
      setCartelUrl(URL.createObjectURL(blob));
    } catch (err) {
      setErrorMsg("Error al imprimir el cartel en la fotocopiadora sindical.");
    } finally {
      setLoading(false);
    }
  };

  const resetCartel = () => {
    setCartelUrl(null);
    setErrorMsg("");
  };

  return (
    <div className="marcha-container">
      <style>{`
        .marcha-container {
          min-height: 100vh;
          background: radial-gradient(circle at center, #1f1108 0%, #0a0503 100%);
          color: #f8fafc;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
        }
        .marcha-card {
          width: 100%;
          max-width: 640px;
          background: rgba(41, 25, 21, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px);
        }
        .marcha-header {
          text-align: center;
          margin-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 20px;
        }
        .marcha-badge {
          background: #dc2626;
          color: #ffffff;
          font-size: 0.75rem;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: inline-block;
          margin-bottom: 10px;
        }
        .marcha-title {
          font-size: 1.8rem;
          font-weight: 900;
          margin: 0;
          color: #ffffff;
        }
        .marcha-subtitle {
          font-size: 0.85rem;
          color: #d6b98c;
          margin: 6px 0 0 0;
        }
        .convocatoria-box {
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.25);
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 24px;
          text-align: left;
          font-size: 0.85rem;
          line-height: 1.6;
        }
        .convocatoria-box strong {
          color: #f87171;
        }
        .form-group {
          margin-bottom: 18px;
          text-align: left;
        }
        .form-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 700;
          margin-bottom: 8px;
          color: #eaddc7;
        }
        .form-input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(15, 10, 8, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #ffffff;
          font-size: 0.9rem;
          box-sizing: border-box;
          outline: none;
        }
        .form-input:focus {
          border-color: #dc2626;
        }
        .chips-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .chip {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #eaddc7;
          font-size: 0.75rem;
          padding: 6px 12px;
          border-radius: 20px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .chip:hover {
          background: rgba(220, 38, 38, 0.2);
          border-color: rgba(220, 38, 38, 0.4);
        }
        .btn-action {
          width: 100%;
          padding: 14px;
          font-weight: 800;
          font-size: 0.95rem;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: transform 0.1s, background-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-action:active {
          transform: scale(0.98);
        }
        .btn-red {
          background: #dc2626;
          color: #ffffff;
        }
        .btn-red:hover {
          background: #b91c1c;
        }
        .btn-gray {
          background: rgba(255,255,255,0.06);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.1);
          margin-top: 10px;
        }
        .btn-gray:hover {
          background: rgba(255,255,255,0.1);
        }
        .cartel-preview {
          width: 100%;
          border-radius: 12px;
          margin: 10px 0 20px 0;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .error-box {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 12px;
          padding: 12px;
          color: #f87171;
          font-size: 0.85rem;
          margin-bottom: 20px;
        }
        .menu-back {
          margin-top: 24px;
          text-align: center;
        }
        .menu-back a {
          color: #a8927a;
          text-decoration: none;
          font-size: 0.8rem;
          transition: color 0.2s;
        }
        .menu-back a:hover {
          color: #dc2626;
        }
        .spinner {
          width: 25px;
          height: 25px;
          border: 3px solid rgba(220, 38, 38, 0.1);
          border-top-color: #dc2626;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          display: inline-block;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="marcha-card">
        <div className="marcha-header">
          <span className="marcha-badge">Marcha por la Pala</span>
          <h1 className="marcha-title">Generador Oficial de Carteles</h1>
          <p className="marcha-subtitle">Bloque Folicular Combativo · Vía Pública</p>
        </div>

        {convocatoria && !cartelUrl && (
          <div className="convocatoria-box">
            <div><strong>📢 Convocatoria:</strong> {convocatoria.motivo}</div>
            <div><strong>📍 Lugar:</strong> {convocatoria.lugar}</div>
            <div><strong>🕐 Horario:</strong> {convocatoria.horario}</div>
            <div><strong>📣 Cántico sugerido:</strong> "{convocatoria.cantito}"</div>
          </div>
        )}

        {errorMsg && <div className="error-box">❌ {errorMsg}</div>}

        {loading && (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <div className="spinner" />
            <p style={{ fontSize: "0.85rem", color: "#d6b98c", marginTop: "10px" }}>
              Imprimiendo cartel en la fotocopiadora del gremio...
            </p>
          </div>
        )}

        {!cartelUrl && !loading && (
          <form onSubmit={handleGenerar}>
            <div className="form-group">
              <label className="form-label">Tu consigna</label>
              <input
                type="text"
                className="form-input"
                maxLength={90}
                placeholder="Escribí tu reclamo folicular..."
                value={consigna}
                onChange={(e) => setConsigna(e.target.value)}
              />
              <div className="chips-row">
                {CONSIGNAS_CHIPS.map((c) => (
                  <span key={c} className="chip" onClick={() => setConsigna(c)}>
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Gremio / Bloque que adhiere</label>
              <input
                type="text"
                className="form-input"
                maxLength={60}
                placeholder="Sindicato de la Pala"
                value={gremio}
                onChange={(e) => setGremio(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-action btn-red">
              ✊ Generar Cartel
            </button>
          </form>
        )}

        {cartelUrl && !loading && (
          <div>
            <img src={cartelUrl} alt="Cartel de protesta" className="cartel-preview" />
            <a href={cartelUrl} download="cartel-pela.png" className="btn-action btn-red" style={{ textDecoration: "none" }}>
              ⬇️ Descargar Cartel
            </a>
            <button className="btn-action btn-gray" onClick={resetCartel}>
              Generar Otro
            </button>
          </div>
        )}

        <div className="menu-back">
          <Link href="/menu">← Volver al Menú Principal</Link>
        </div>
      </div>
    </div>
  );
}
