"use client"

import { useState } from "react";
import Link from "next/link";

export default function AfipelaPage() {
  const [nombre, setNombre] = useState("");
  const [hairs, setHairs] = useState("0");
  const [reflectivity, setReflectivity] = useState(60);
  const [caps, setCaps] = useState("0");

  const [categorizedData, setCategorizedData] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [moratoriaMsg, setMoratoriaMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCategorize = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setMoratoriaMsg("");
    setInvoice(null);

    try {
      const res = await fetch("/api/afipela", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "categorizar",
          nombre,
          remainingHairs: hairs,
          headReflectivity: reflectivity,
          capsOwned: caps
        })
      });

      const data = await res.json();
      setLoading(false);

      if (data.status === "success") {
        setCategorizedData(data);
      } else {
        setErrorMsg(data.message);
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg("Error de red con los servidores de AFIP-ELA.");
    }
  };

  const getFactura = async () => {
    if (!categorizedData) return;
    setLoading(true);
    setMoratoriaMsg("");

    try {
      const url = `/api/afipela?action=factura&nombre=${encodeURIComponent(categorizedData.nombre)}&cuit=${categorizedData.cuit}&categoria=${categorizedData.categoria}&totalTax=${categorizedData.totalTax}&baseTax=${categorizedData.baseTax}&glareTax=${categorizedData.glareTax}&capDeduction=${categorizedData.capDeduction}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setLoading(false);
      setInvoice(data);
    } catch (err) {
      setLoading(false);
      setErrorMsg("Error al generar el comprobante fiscal.");
    }
  };

  const applyMoratoria = () => {
    setMoratoriaMsg(
      "🏛️ MORATORIA ACEPTADA (Ley Folicular 27.541): Su deuda se ha refinanciado en 120 cuotas fijas mensuales con tasa subsidiada del 0%. Adicionalmente, califica para el programa nacional 'Minoxidil para Todos' con entrega gratuita en farmacias adheridas."
    );
  };

  const resetForm = () => {
    setNombre("");
    setHairs("0");
    setReflectivity(60);
    setCaps("0");
    setCategorizedData(null);
    setInvoice(null);
    setErrorMsg("");
    setMoratoriaMsg("");
  };

  return (
    <div className="afipela-container">
      <style>{`
        .afipela-container {
          min-height: 100vh;
          background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
          color: #f8fafc;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
        }
        .afipela-card {
          width: 100%;
          max-width: 620px;
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px);
        }
        .afipela-header {
          text-align: center;
          margin-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 20px;
        }
        .afipela-badge {
          background: #f97316;
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
        .afipela-title {
          font-size: 1.8rem;
          font-weight: 900;
          margin: 0;
          color: #ffffff;
        }
        .afipela-subtitle {
          font-size: 0.85rem;
          color: #94a3b8;
          margin: 6px 0 0 0;
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
          color: #cbd5e1;
        }
        .form-input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #ffffff;
          font-size: 0.9rem;
          box-sizing: border-box;
          outline: none;
        }
        .form-input:focus {
          border-color: #f97316;
        }
        .slider-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .form-slider {
          flex: 1;
          accent-color: #f97316;
          cursor: pointer;
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
        .btn-orange {
          background: #f97316;
          color: #ffffff;
        }
        .btn-orange:hover {
          background: #ea580c;
        }
        .btn-gray {
          background: rgba(255,255,255,0.06);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .btn-gray:hover {
          background: rgba(255,255,255,0.1);
        }
        .btn-green {
          background: #22c55e;
          color: #ffffff;
        }
        .btn-green:hover {
          background: #16a34a;
        }
        .tax-alert {
          background: rgba(249, 115, 22, 0.05);
          border: 1px solid rgba(249, 115, 22, 0.2);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
          text-align: left;
        }
        .tax-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 14px;
          font-size: 0.85rem;
        }
        .tax-table th, .tax-table td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .tax-table th {
          color: #94a3b8;
          font-weight: 700;
        }
        .tax-table td.amount {
          text-align: right;
          font-family: monospace;
          font-weight: bold;
        }
        .tax-total {
          font-size: 1.1rem;
          font-weight: 900;
          color: #f97316;
        }
        .invoice-card {
          background: #ffffff;
          color: #000000;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          font-family: "Courier New", Courier, monospace;
          text-align: left;
          font-size: 0.75rem;
          margin: 20px 0;
          border: 1px solid #ddd;
        }
        .invoice-header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
          margin-bottom: 15px;
        }
        .invoice-type {
          font-size: 2.2rem;
          font-weight: 900;
          border: 2px solid #000;
          padding: 0 10px;
          line-height: 1;
        }
        .invoice-details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 15px;
        }
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        .invoice-table th, .invoice-table td {
          padding: 6px;
          border-bottom: 1px solid #ddd;
          text-align: left;
        }
        .invoice-table td.num {
          text-align: right;
        }
        .invoice-cae-box {
          border: 1px solid #000;
          padding: 10px;
          margin-top: 15px;
          text-align: right;
        }
        .alert-moratoria {
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.25);
          border-radius: 12px;
          padding: 14px;
          font-size: 0.85rem;
          color: #4ade80;
          margin: 15px 0;
          line-height: 1.4;
        }
        .menu-back {
          margin-top: 24px;
          text-align: center;
        }
        .menu-back a {
          color: #64748b;
          text-decoration: none;
          font-size: 0.8rem;
          transition: color 0.2s;
        }
        .menu-back a:hover {
          color: #f97316;
        }
        .spinner {
          width: 25px;
          height: 25px;
          border: 3px solid rgba(249, 115, 22, 0.1);
          border-top-color: #f97316;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          display: inline-block;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="afipela-card">
        <div className="afipela-header">
          <span className="afipela-badge">AFIP-ELA</span>
          <h1 className="afipela-title">Liquidación Impositiva Folicular</h1>
          <p className="afipela-subtitle">Declaración Jurada y Categorización - Formulario 460</p>
        </div>

        {errorMsg && (
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "12px", padding: "12px", color: "#f87171", fontSize: "0.85rem", marginBottom: "20px" }}>
            <strong>❌ Error:</strong> {errorMsg}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <div className="spinner" />
            <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "10px" }}>Conectando con servidores de recaudación...</p>
          </div>
        )}

        {!categorizedData && !loading && (
          <form onSubmit={handleCategorize}>
            <div className="form-group">
              <label className="form-label">Nombre Completo del Contribuyente</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="Exequiel Argumentador"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Cantidad Estimada de Cabellos Restantes</label>
              <input
                type="number"
                min="0"
                max="200000"
                className="form-input"
                required
                value={hairs}
                onChange={(e) => setHairs(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Reflectividad Folicular (Albedo del Scalp): {reflectivity}%</label>
              <div className="slider-container">
                <span>Mate 0%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  className="form-slider"
                  value={reflectivity}
                  onChange={(e) => setReflectivity(parseInt(e.target.value))}
                />
                <span>Espejo 100%</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Accesorios de Ocultamiento Declarados (Gorras, Sombreros, Pelucas)</label>
              <input
                type="number"
                min="0"
                max="50"
                className="form-input"
                required
                value={caps}
                onChange={(e) => setCaps(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-action btn-orange">
              Presentar Declaración Jurada
            </button>
          </form>
        )}

        {categorizedData && !loading && (
          <div>
            <div className="tax-alert">
              <h3 style={{ margin: "0 0 10px 0", fontSize: "1.1rem" }}>📋 Detalle de Categorización</h3>
              <p style={{ fontSize: "0.85rem", color: "#cbd5e1", margin: "4px 0" }}>
                <strong>Contribuyente:</strong> {categorizedData.nombre}
              </p>
              <p style={{ fontSize: "0.85rem", color: "#cbd5e1", margin: "4px 0" }}>
                <strong>CUIT:</strong> {categorizedData.cuit}
              </p>
              <p style={{ fontSize: "0.85rem", color: "#cbd5e1", margin: "4px 0" }}>
                <strong>Categoría Monotributo:</strong> <strong style={{ color: "#f97316" }}>Cat. {categorizedData.categoria}</strong> ({categorizedData.desc})
              </p>

              <table className="tax-table">
                <thead>
                  <tr>
                    <th>Concepto Impositivo</th>
                    <th style={{ textAlign: "right" }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Tasa Folicular Básica (según cabellos)</td>
                    <td className="amount">${categorizedData.baseTax}</td>
                  </tr>
                  <tr>
                    <td>Impuesto al Reflejo Lumínico en Vía Pública</td>
                    <td className="amount">${categorizedData.glareTax}</td>
                  </tr>
                  <tr>
                    <td>Crédito Deductivo por Cobertura Física (Gorra)</td>
                    <td className="amount" style={{ color: "#ef4444" }}>-${categorizedData.capDeduction}</td>
                  </tr>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.15)" }}>
                    <td className="tax-total">Saldo Total a Recaudar</td>
                    <td className="amount tax-total">${categorizedData.totalTax}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {moratoriaMsg && (
              <div className="alert-moratoria">
                {moratoriaMsg}
              </div>
            )}

            {invoice && (
              <div className="invoice-card">
                <div className="invoice-header">
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 900 }}>FACTURA</h3>
                    <span style={{ fontSize: "0.6rem" }}>ORIGINAL</span>
                  </div>
                  <div className="invoice-type">C</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: "bold" }}>Nro Comp: {invoice.compNumero}</div>
                    <div>Fecha: {invoice.fecha}</div>
                  </div>
                </div>

                <div className="invoice-details-grid">
                  <div>
                    <strong>Emisor:</strong> <br />
                    {invoice.cuitResponsable} <br />
                    AFIP-ELA NACIÓN <br />
                    Mesa de Entradas Central
                  </div>
                  <div>
                    <strong>Receptor:</strong> <br />
                    {invoice.contribuyente.nombre} <br />
                    CUIT: {invoice.contribuyente.cuit} <br />
                    {invoice.contribuyente.condicion}
                  </div>
                </div>

                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Descripción Servicio</th>
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.desc}</td>
                        <td className="num">${item.precio}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid #000", fontWeight: "bold" }}>
                      <td>TOTAL A PAGAR:</td>
                      <td className="num">${invoice.total}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="invoice-cae-box">
                  <div>CAE Nro: {invoice.cae}</div>
                  <div>Fecha Vto CAE: {invoice.caeVto}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {!invoice && (
                <button className="btn-action btn-green" onClick={getFactura}>
                  📄 Generar Factura Oficial AFIP-ELA
                </button>
              )}
              {!moratoriaMsg && (
                <button className="btn-action btn-orange" onClick={applyMoratoria}>
                  🏛️ Adherirse al Plan de Moratoria Folicular
                </button>
              )}
              <button className="btn-action btn-gray" onClick={resetForm}>
                Volver a Categorizar
              </button>
            </div>
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
