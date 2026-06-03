"use client"

import { useState, useEffect } from "react";
import Link from "next/link";

export default function SitrafoPage() {
  const [step, setStep] = useState(1); // 1: Turno, 2: Formulario, 3: Loader, 4: Resultado
  const [loadingMsg, setLoadingMsg] = useState("");
  const [turnoInfo, setTurnoInfo] = useState(null);
  const [trivia, setTrivia] = useState(null);
  const [rejectionError, setRejectionError] = useState("");
  const [approvedData, setApprovedData] = useState(null);

  // Form State
  const [nombre, setNombre] = useState("");
  const [norwood, setNorwood] = useState(3);
  const [photoName, setPhotoName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const fetchTurno = async (answerIndex = null) => {
    try {
      let url = "/api/sitrafo?action=turno";
      if (answerIndex !== null) {
        url += `&answer=${answerIndex}`;
      }
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === "success") {
        setTurnoInfo(data);
        setTrivia(null);
        setStep(2); // Go to form filling
      } else if (data.status === "no_slots") {
        setTrivia(data.trivia);
        setRejectionError(data.message);
      } else if (data.status === "error") {
        setRejectionError(data.message);
        setTrivia(null);
      }
    } catch (err) {
      setRejectionError("Error de conexión con la base del Registro Nacional.");
    }
  };

  const handleTriviaClick = (idx) => {
    fetchTurno(idx);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setPhotoName(e.dataTransfer.files[0].name);
    }
  };

  const simulatePhotoUpload = () => {
    setPhotoName("foto_scalp_reflejo_" + Math.floor(Math.random() * 1000) + ".jpg");
  };

  const submitTramite = async (e) => {
    e.preventDefault();
    setStep(3); // Loader
    setRejectionError("");

    const loadingSteps = [
      "Generando expediente digital...",
      "Enviando solicitud a Mesa de Entradas...",
      "Marta está firmando las planillas...",
      "Marta se fue a calentar agua para el mate...",
      "Corroborando autenticidad del albedo folicular...",
      "Fiscalizando el timbrado en el Banco Nación..."
    ];

    let currentIdx = 0;
    setLoadingMsg(loadingSteps[currentIdx]);
    
    const interval = setInterval(() => {
      currentIdx++;
      if (currentIdx < loadingSteps.length) {
        setLoadingMsg(loadingSteps[currentIdx]);
      }
    }, 600);

    // Call API
    try {
      const res = await fetch("/api/sitrafo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "tramite",
          nombre,
          norwood,
          photoName: photoName || "default_scalp.png"
        })
      });

      const data = await res.json();
      
      clearInterval(interval);
      setTimeout(() => {
        if (data.status === "approved") {
          setApprovedData(data);
          setStep(4);
        } else {
          setRejectionError(data.message);
          setStep(2); // Go back to form to retry
        }
      }, 3600); // Give player enough time to read funny loading notes
    } catch (err) {
      clearInterval(interval);
      setRejectionError("El servidor rechazó la conexión. Intente cuando vuelva el sistema.");
      setStep(2);
    }
  };

  const resetForm = () => {
    setStep(1);
    setTurnoInfo(null);
    setTrivia(null);
    setNombre("");
    setNorwood(3);
    setPhotoName("");
    setApprovedData(null);
    setRejectionError("");
  };

  return (
    <div className="sitrafo-container">
      <style>{`
        .sitrafo-container {
          min-height: 100vh;
          background: radial-gradient(circle at center, #0a0b0d 0%, #030405 100%);
          color: #ffffff;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
        }
        .sitrafo-card {
          width: 100%;
          max-width: 580px;
          background: rgba(25, 28, 36, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(12px);
          position: relative;
        }
        .sitrafo-header {
          text-align: center;
          margin-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 20px;
        }
        .sitrafo-badge {
          background: #00bcd4;
          color: #000;
          font-size: 0.75rem;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: inline-block;
          margin-bottom: 10px;
        }
        .sitrafo-title {
          font-size: 1.8rem;
          font-weight: 900;
          margin: 0;
          color: #ffffff;
        }
        .sitrafo-subtitle {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.6);
          margin: 6px 0 0 0;
        }
        .info-alert {
          background: rgba(255, 193, 7, 0.06);
          border: 1px solid rgba(255, 193, 7, 0.2);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 0.85rem;
          color: #ffc107;
          margin-bottom: 20px;
          line-height: 1.4;
        }
        .error-alert {
          background: rgba(244, 67, 54, 0.06);
          border: 1px solid rgba(244, 67, 54, 0.2);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 0.85rem;
          color: #f44336;
          margin-bottom: 20px;
          line-height: 1.4;
        }
        .btn-action {
          width: 100%;
          padding: 14px;
          font-weight: 800;
          font-size: 0.95rem;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-action:active {
          transform: scale(0.98);
        }
        .btn-cyan {
          background: #00bcd4;
          color: #000000;
        }
        .btn-cyan:hover {
          background: #00acc1;
        }
        .btn-gray {
          background: rgba(255,255,255,0.06);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .btn-gray:hover {
          background: rgba(255,255,255,0.1);
        }
        .trivia-container {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 16px;
          margin-top: 15px;
          text-align: left;
        }
        .trivia-question {
          font-size: 0.9rem;
          font-weight: 700;
          margin: 0 0 12px 0;
          color: #00bcd4;
        }
        .trivia-option-btn {
          width: 100%;
          text-align: left;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: #ffffff;
          font-size: 0.8rem;
          margin-bottom: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .trivia-option-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: #00bcd4;
        }
        .form-group {
          margin-bottom: 20px;
          text-align: left;
        }
        .form-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 700;
          margin-bottom: 8px;
          color: rgba(255, 255, 255, 0.85);
        }
        .form-input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #ffffff;
          font-size: 0.9rem;
          box-sizing: border-box;
          outline: none;
        }
        .form-input:focus {
          border-color: #00bcd4;
        }
        .norwood-select {
          width: 100%;
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #ffffff;
          font-size: 0.9rem;
          outline: none;
        }
        .norwood-select option {
          background: #191c24;
          color: #fff;
        }
        .upload-zone {
          border: 2px dashed rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          background: rgba(255, 255, 255, 0.01);
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .upload-zone.dragging {
          border-color: #00bcd4;
          background: rgba(0, 188, 212, 0.05);
        }
        .upload-text {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
        }
        .upload-btn-simulate {
          margin-top: 8px;
          display: inline-block;
          font-size: 0.75rem;
          background: rgba(255,255,255,0.08);
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 700;
        }
        .upload-btn-simulate:hover {
          background: rgba(255,255,255,0.15);
        }
        .loading-container {
          text-align: center;
          padding: 40px 10px;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(0, 188, 212, 0.1);
          border-top-color: #00bcd4;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px auto;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .loading-text {
          font-size: 0.95rem;
          color: #ffffff;
          font-weight: 600;
        }
        .dni-card {
          width: 100%;
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          border-radius: 18px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          text-align: left;
          position: relative;
          overflow: hidden;
          margin: 20px 0;
          color: #fff;
          font-family: "Courier New", Courier, monospace;
        }
        .dni-card::before {
          content: "REPÚBLICA ARGENTINA";
          position: absolute;
          top: 10px;
          right: 15px;
          font-size: 0.55rem;
          opacity: 0.6;
          font-weight: 900;
          letter-spacing: 0.05em;
        }
        .dni-logo {
          font-size: 1.4rem;
          margin-bottom: 12px;
          opacity: 0.9;
        }
        .dni-content {
          display: flex;
          gap: 16px;
        }
        .dni-photo {
          width: 100px;
          height: 120px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 2.2rem;
          color: #fff;
        }
        .dni-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .dni-field {
          font-size: 0.65rem;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.7);
        }
        .dni-value {
          font-size: 0.75rem;
          font-weight: bold;
          margin-bottom: 4px;
          color: #fff;
        }
        .dni-footer {
          margin-top: 15px;
          border-top: 1px dashed rgba(255,255,255,0.2);
          padding-top: 8px;
          font-size: 0.55rem;
          color: rgba(255, 255, 255, 0.6);
          display: flex;
          justify-content: space-between;
        }
        .menu-back {
          margin-top: 24px;
          text-align: center;
        }
        .menu-back a {
          color: rgba(255, 255, 255, 0.5);
          text-decoration: none;
          font-size: 0.8rem;
          transition: color 0.2s;
        }
        .menu-back a:hover {
          color: #00bcd4;
        }
      `}</style>

      <div className="sitrafo-card">
        <div className="sitrafo-header">
          <span className="sitrafo-badge">SITRAFO</span>
          <h1 className="sitrafo-title">Registro Folicular Nacional</h1>
          <p className="sitrafo-subtitle">Mesa de Entradas Virtual - Formulario 93-A</p>
        </div>

        {rejectionError && (
          <div className="error-alert">
            <strong>❌ EXPEDIENTE RECHAZADO:</strong> {rejectionError}
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="info-alert">
              <strong>Aviso Legal:</strong> Para iniciar el trámite de Aptitud Capilar y expedición de DNI Folicular, debe contar con un Turno de Ventanilla homologado por la autoridad capilar.
            </div>

            <button className="btn-action btn-cyan" onClick={() => fetchTurno()}>
              Solicitar Turno Administrativo
            </button>

            {trivia && (
              <div className="trivia-container">
                <div className="error-alert" style={{ marginBottom: "12px" }}>
                  <strong>Aviso:</strong> No hay cupos estándar. Complete la trivia gubernamental para calificar para el "Turno VIP Excepcional".
                </div>
                <h4 className="trivia-question">{trivia.q}</h4>
                <div>
                  {trivia.options.map((opt, i) => (
                    <button
                      key={i}
                      className="trivia-option-btn"
                      onClick={() => handleTriviaClick(i)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <form onSubmit={submitTramite}>
            {turnoInfo && (
              <div className="info-alert" style={{ background: "rgba(0,188,212,0.05)", borderColor: "rgba(0,188,212,0.2)", color: "#00bcd4" }}>
                <strong>✅ TURNO VERIFICADO:</strong> {turnoInfo.code} <br />
                Asignado para: {turnoInfo.date} a las {turnoInfo.time} <br />
                Lugar: {turnoInfo.office}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Nombre Completo (como figura en el DNI Físico)</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="Juan Carlos Pelado"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nivel de Calvicie (Escala Norwood)</label>
              <select
                className="norwood-select"
                value={norwood}
                onChange={(e) => setNorwood(parseInt(e.target.value))}
              >
                <option value="1">Grado 1: Frente firme (Sin entradas)</option>
                <option value="2">Grado 2: Entradas moderadas de la Nación</option>
                <option value="3">Grado 3: Pérdida temporal en cúspide</option>
                <option value="4">Grado 4: Herradura en formación</option>
                <option value="5">Grado 5: Puente capilar debilitado</option>
                <option value="6">Grado 6: Herradura despejada (Brillo total)</option>
                <option value="7">Grado 7: Reflectividad Espejo (Calvicie Suprema)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Adjuntar Captura de Cuero Cabelludo (Foto de Scalp)</label>
              <div
                className={`upload-zone ${isDragging ? "dragging" : ""}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={simulatePhotoUpload}
              >
                {photoName ? (
                  <div>
                    <span style={{ fontSize: "2rem" }}>📄</span>
                    <p style={{ margin: "4px 0", fontSize: "0.85rem", color: "#00bcd4", fontWeight: "bold" }}>
                      {photoName}
                    </p>
                    <span className="upload-text">Hacé click para cambiar</span>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontSize: "2rem" }}>📸</span>
                    <p className="upload-text" style={{ margin: "6px 0 0 0" }}>
                      Arrastrá tu foto o hacé click aquí para simular captura de cámara frontal
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className="btn-action btn-cyan" style={{ marginTop: "10px" }}>
              Presentar Expediente de Aptitud Capilar
            </button>
          </form>
        )}

        {step === 3 && (
          <div className="loading-container">
            <div className="spinner" />
            <p className="loading-text">{loadingMsg}</p>
            <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>Procesando en servidores de la Nación...</span>
          </div>
        )}

        {step === 4 && approvedData && (
          <div>
            <div className="info-alert" style={{ background: "rgba(76,175,80,0.06)", borderColor: "rgba(76,175,80,0.25)", color: "#4caf50" }}>
              <strong>🎉 TRÁMITE APROBADO:</strong> El Honorable Consejo Folicular ha homologado su expediente. Su credencial digital se encuentra lista.
            </div>

            {/* DNI Folicular Card Display */}
            <div className="dni-card">
              <div className="dni-logo">🦅 REGISTRO FOLICULAR</div>
              <div className="dni-content">
                <div className="dni-photo">
                  {approvedData.norwood >= 6 ? "🥚" : approvedData.norwood >= 4 ? "👨‍🦲" : "👨"}
                </div>
                <div className="dni-details">
                  <div className="dni-field">Apellido y Nombre</div>
                  <div className="dni-value">{approvedData.nombre}</div>
                  
                  <div className="dni-field">Nro. Trámite / DNI</div>
                  <div className="dni-value">{approvedData.dniNumber}</div>

                  <div className="dni-field">Rango Capilar</div>
                  <div className="dni-value" style={{ color: "#ffeb3b" }}>{approvedData.rank}</div>
                  
                  <div className="dni-field">Expediente Nro</div>
                  <div className="dni-value">{approvedData.fileNumber}</div>
                </div>
              </div>
              <div className="dni-footer">
                <span>FIRMA: Marta (Mesa de Entradas)</span>
                <span>EMISIÓN: {approvedData.timestamp}</span>
              </div>
            </div>

            <button className="btn-action btn-gray" onClick={resetForm}>
              Iniciar Nuevo Trámite Folicular
            </button>
          </div>
        )}

        <div className="menu-back">
          <Link href="/menu">
            ← Volver al Menú Principal
          </Link>
        </div>
      </div>
    </div>
  );
}
