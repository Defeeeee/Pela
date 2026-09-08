"use client";

import { useEffect, useState } from "react";
import { quienSoy } from "./lib/sesionCliente";
import { sincronizarRecords } from "./lib/recordsCliente";

const CLAVE_NOMBRE = "pela_player_name";
const CLAVE_STATS = "pelardle_stats_v1";
// Marca de que ya se subió el progreso local. Sin esto se reenviaría en cada
// carga de página: el servicio lo toleraría (toma el máximo), pero es tráfico
// al pedo en todas las visitas de todos.
const CLAVE_MIGRADO = "pela_progreso_migrado";

/**
 * Misma regla que sanitizarHandle del servidor, aplicada mientras se escribe.
 * No reemplaza a la validación del servidor: está para que no se pueda tipear
 * algo que después va a ser rechazado.
 */
function normalizarHandle(bruto) {
  return String(bruto || "")
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 16);
}

/**
 * Cuadro de primer login: elegir apodo y traerse la racha vieja.
 *
 * Va montado en el layout, no en una página, porque después de Google se
 * vuelve a donde se estaba (/menu, /pelardle, /agarra o /escapecv) y el cuadro
 * tiene que aparecer en cualquiera de esos lugares.
 *
 * El apodo se elige siempre a mano: es lo que le da dueño al nombre, así que
 * adjudicar automáticamente el de Google o el que quedó en el navegador sería
 * regalar algo que nadie pidió.
 */
export default function SesionApodo() {
  const [haceFalta, setHaceFalta] = useState(false);
  const [apodo, setApodo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rachaImportada, setRachaImportada] = useState(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const yo = await quienSoy();
      if (!vivo || !yo.autenticado) return;

      // Sincronizar todos los récords de todos los juegos con la cuenta
      await sincronizarRecords();
      await migrarProgreso();
      if (!vivo) return;

      if (!yo.nombre) {
        try {
          // El nombre guardado puede tener espacios (antes se permitían), así
          // que la sugerencia se normaliza antes de proponerla.
          setApodo(normalizarHandle(localStorage.getItem(CLAVE_NOMBRE) || ""));
        } catch (e) {
          // localStorage bloqueado: se elige desde cero
        }
        setHaceFalta(true);
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  async function migrarProgreso() {
    let stats = null;
    try {
      if (localStorage.getItem(CLAVE_MIGRADO)) return;
      const crudo = localStorage.getItem(CLAVE_STATS);
      if (!crudo) {
        localStorage.setItem(CLAVE_MIGRADO, "1");
        return;
      }
      stats = JSON.parse(crudo);
    } catch (e) {
      return; // sin localStorage no hay nada que migrar
    }

    try {
      // El número de puzzle lo pone el servidor: el servicio lo necesita para
      // saber si la racha que manda el navegador sigue viva.
      const meta = await (await fetch("/api/pelardle")).json();
      const res = await fetch("/api/auth/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleActual: meta?.puzzle, stats }),
      });
      const datos = await res.json();
      if (datos?.ok) {
        localStorage.setItem(CLAVE_MIGRADO, "1");
        if (datos.rachaImportada > 0) setRachaImportada(datos.rachaImportada);
      }
    } catch (e) {
      // Si falla se reintenta en la próxima carga: la marca no se puso.
    }
  }

  async function guardar() {
    const limpio = apodo.trim();
    if (limpio.length < 2) {
      setError("Poné al menos 2 caracteres.");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/auth/apodo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apodo: limpio }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos?.error || "No se pudo guardar.");
        setGuardando(false);
        return;
      }
      try {
        localStorage.setItem(CLAVE_NOMBRE, datos.apodo);
      } catch (e) {}
      // Recarga en vez de setState: la página que está abajo (el lobby del
      // multi, el ranking) ya leyó la sesión sin nombre y tiene que releerla.
      window.location.reload();
    } catch (e) {
      setError("No se pudo guardar. Probá de nuevo.");
      setGuardando(false);
    }
  }

  if (!haceFalta) return null;

  return (
    <div className="apodo-fondo">
      <div className="apodo-caja">
        <h2 className="apodo-titulo">Elegí tu handle</h2>
        <p className="apodo-texto">
          Con este nombre vas a aparecer en el ranking y en los juegos con otra gente, y es la
          dirección de tu legajo. Queda reservado para vos: nadie más lo puede usar.
        </p>
        <p className="apodo-regla">
          Sin espacios, de 2 a 16 caracteres. Tu legajo va a quedar en{" "}
          <span className="apodo-url">/p/{apodo || "tu_handle"}</span>
        </p>

        {rachaImportada !== null && (
          <p className="apodo-racha">
            🔥 Te trajimos tu racha de {rachaImportada} {rachaImportada === 1 ? "día" : "días"} de
            Pelardle.
          </p>
        )}

        <input
          className="apodo-input"
          maxLength={16}
          autoFocus
          placeholder="pelado_sindical"
          value={apodo}
          onChange={(e) => setApodo(normalizarHandle(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && !guardando && guardar()}
        />

        {error && <div className="apodo-error">{error}</div>}

        <button className="apodo-btn" disabled={guardando} onClick={guardar}>
          {guardando ? "GUARDANDO..." : "LISTO"}
        </button>
      </div>

      {/* <style> plano con clases prefijadas, como el resto del proyecto. */}
      <style>{`
        .apodo-fondo {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          /* Por encima de todo: los juegos usan overlays con z-index alto. */
          z-index: 99999;
          padding: 20px;
        }

        .apodo-caja {
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 12px;
          padding: 28px 24px;
          max-width: 380px;
          width: 100%;
          text-align: center;
        }

        .apodo-titulo {
          color: #ffeb3b;
          margin: 0 0 10px;
          font-size: 1.3rem;
        }

        .apodo-texto {
          color: #8b949e;
          font-size: 0.85rem;
          line-height: 1.5;
          margin: 0 0 14px;
        }

        .apodo-regla {
          color: #6e7681;
          font-size: 0.75rem;
          line-height: 1.5;
          margin: 0 0 14px;
        }

        .apodo-url {
          color: #ffeb3b;
          word-break: break-all;
        }

        .apodo-racha {
          color: #7ee787;
          font-size: 0.85rem;
          margin: 0 0 14px;
        }

        .apodo-input {
          width: 100%;
          box-sizing: border-box;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 8px;
          color: #fff;
          padding: 12px;
          font-size: 1rem;
          text-align: center;
        }

        .apodo-error {
          color: #ff5252;
          font-size: 0.8rem;
          margin-top: 8px;
        }

        .apodo-btn {
          width: 100%;
          margin-top: 14px;
          background: #ffeb3b;
          color: #000;
          border: none;
          border-radius: 8px;
          padding: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .apodo-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
