'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSocialCredit } from '../SocialCreditContext';
import { quienSoy, idAnonimo } from '../lib/sesionCliente';

/**
 * ¿Cuántas palas? — el puzzle diario de estimación.
 *
 * La escena se muestra unos segundos y después se tapa. Un solo intento, y se
 * rankea por cercanía al número real.
 *
 * El reloj ES la mecánica, no una restricción técnica. Sin él el juego se vuelve
 * contar con el dedo, que no es divertido y además premia al que tiene más
 * paciencia en vez de al que mira mejor. Y de paso es la única defensa práctica
 * contra contar los elementos en las herramientas del navegador — la escena se
 * dibuja en el cliente, así que quien quiera hacer trampa puede, pero tiene que
 * querer bastante. Queda escrito igual que el agujero de identidad de Pelardle.
 */

const CLAVE_ESTADO = 'pela_palas_estado';
const CLAVE_NOMBRE = 'pela_player_name';
const COSTO = 5;

const TONOS = ['#ffeb3b', '#ffd54f', '#ffca28', '#ffc107', '#ffb300'];

export default function PalasDelDia() {
  const [meta, setMeta] = useState(null);
  const [fase, setFase] = useState('cargando'); // cargando | listo | mirando | respondiendo | resuelto
  const [restante, setRestante] = useState(0);
  const [intento, setIntento] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [board, setBoard] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const lienzo = useRef(null);
  const temporizador = useRef(null);
  const { deductCredit } = useSocialCredit();

  // ── Carga del día ─────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/palas', { cache: 'no-store' });
        const datos = await res.json();
        if (!vivo) return;
        if (!datos.ok) {
          setError(datos.error || 'No se pudo cargar el puzzle de hoy.');
          setFase('listo');
          return;
        }
        setMeta(datos);

        // Si ya se jugó hoy, se restaura el resultado en vez de dejar jugar de
        // nuevo: el intento único se guarda del lado del servidor, pero el
        // cliente tiene que reflejarlo para no ofrecer un botón que va a fallar.
        try {
          const guardado = JSON.parse(localStorage.getItem(CLAVE_ESTADO) || 'null');
          if (guardado && guardado.puzzle === datos.puzzle) {
            setResultado(guardado);
            setFase('resuelto');
            return;
          }
        } catch (e) { /* localStorage bloqueado: se juega de cero */ }

        setFase('listo');
      } catch (e) {
        if (vivo) { setError('No se pudo cargar el puzzle de hoy.'); setFase('listo'); }
      }
    })();
    quienSoy().then((yo) => { if (vivo) setSesion(yo); });
    return () => { vivo = false; };
  }, []);

  // ── Dibujo de la escena ───────────────────────────────────────────────────
  const dibujar = useCallback(() => {
    const cv = lienzo.current;
    if (!cv || !meta?.escena) return;
    const [MW, MH] = meta.escena.mundo;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr;
    cv.height = (cv.clientWidth * MH / MW) * dpr;
    const c = cv.getContext('2d');
    const esc = cv.width / MW;

    c.fillStyle = '#101010';
    c.fillRect(0, 0, cv.width, cv.height);

    for (const [x, y, ang, largo, ancho, tono] of meta.escena.palas) {
      c.save();
      c.translate(x * esc, y * esc);
      c.rotate(ang);
      const L = largo * esc, A = ancho * esc;
      // El mango y la hoja: una pala se reconoce por la silueta, y si fueran
      // rectángulos iguales el conteo sería un ejercicio de rectángulos.
      c.fillStyle = '#6d4c41';
      c.fillRect(-L / 2, -A * 0.18, L * 0.55, A * 0.36);
      c.fillStyle = TONOS[tono % TONOS.length];
      c.beginPath();
      c.ellipse(L * 0.22, 0, L * 0.28, A * 0.62, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = Math.max(1, 1.5 * esc);
      c.stroke();
      c.restore();
    }
  }, [meta]);

  useEffect(() => {
    if (fase === 'mirando') dibujar();
  }, [fase, dibujar]);

  useEffect(() => {
    const alRedimensionar = () => { if (fase === 'mirando') dibujar(); };
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, [fase, dibujar]);

  // ── El reloj ──────────────────────────────────────────────────────────────
  const empezar = () => {
    if (!meta?.escena) return;
    deductCredit(COSTO, `palas-${meta.puzzle}`);
    setFase('mirando');
    setRestante(meta.escena.segundos);

    // Décimas y no segundos: con un tick por segundo la barra salta y no se
    // siente el apuro, que es la mitad del juego.
    const finEn = Date.now() + meta.escena.segundos * 1000;
    temporizador.current = setInterval(() => {
      const quedan = Math.max(0, (finEn - Date.now()) / 1000);
      setRestante(quedan);
      if (quedan <= 0) {
        clearInterval(temporizador.current);
        setFase('respondiendo');
      }
    }, 100);
  };

  useEffect(() => () => clearInterval(temporizador.current), []);

  // ── Envío del intento ─────────────────────────────────────────────────────
  const enviar = async () => {
    const n = parseInt(intento, 10);
    if (!Number.isFinite(n) || n < 0 || n > 999) { setError('Poné un número entre 0 y 999.'); return; }
    setError('');

    // `idAnonimo()` CREA el identificador si no existe. Leerlo del localStorage
    // a mano dejaba sin poder jugar a cualquiera que entrara por primera vez a
    // esta página, porque nada lo crea acá.
    const playerId = idAnonimo();
    if (!playerId) { setError('Tu navegador está bloqueando el almacenamiento, así que no se puede guardar el intento.'); return; }

    let nombre = '';
    try { nombre = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) { /* bloqueado */ }

    try {
      const res = await fetch('/api/palas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, playerName: nombre, intento: n }),
      });
      const datos = await res.json();
      if (datos.error && !datos.yaJugado) { setError(datos.error); return; }

      const r = {
        puzzle: meta.puzzle,
        intento: datos.intento ?? n,
        total: datos.total,
        distancia: datos.distancia,
        exacto: datos.exacto,
        yaJugado: !!datos.yaJugado,
      };
      setResultado(r);
      setFase('resuelto');
      try { localStorage.setItem(CLAVE_ESTADO, JSON.stringify(r)); } catch (e) { /* bloqueado */ }
      cargarBoard();
    } catch (e) {
      setError('No se pudo enviar el intento. Probá de nuevo.');
    }
  };

  const cargarBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/palas?board=1', { cache: 'no-store' });
      setBoard(await res.json());
    } catch (e) { /* la tabla es accesoria */ }
  }, []);

  useEffect(() => { if (fase === 'resuelto') cargarBoard(); }, [fase, cargarBoard]);

  const compartir = () => {
    if (!resultado) return;
    const linea = resultado.exacto
      ? `Conté las ${resultado.total} exactas 🎯`
      : `Dije ${resultado.intento}, eran ${resultado.total} — me colgué por ${resultado.distancia}`;
    const texto = `¿Cuántas palas? #${resultado.puzzle}\n${linea}\npela.signai.ar/palas`;
    navigator.clipboard?.writeText(texto).then(
      () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
      () => {}
    );
  };

  const puedeRankear = sesion?.autenticado && sesion?.nombre;

  return (
    <div className="palas-fondo">
      <style>{`
        .palas-fondo {
          min-height: 100vh; background: #0b0b0b; color: #eee;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex; flex-direction: column; align-items: center;
          padding: 24px 16px 60px;
        }
        .palas-caja { width: 100%; max-width: 760px; }
        .palas-eyebrow {
          font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase;
          color: #777; font-weight: 600;
        }
        .palas-titulo {
          font-size: clamp(1.8rem, 6vw, 2.6rem); font-weight: 900; margin: 6px 0 4px;
          color: #ffeb3b; letter-spacing: -0.02em;
        }
        .palas-bajada { color: #999; font-size: 0.92rem; margin: 0 0 20px; line-height: 1.5; }
        .palas-lienzo-caja { position: relative; background: #101010; border-radius: 10px; overflow: hidden; border: 1px solid #262626; }
        .palas-lienzo-caja canvas { display: block; width: 100%; }
        .palas-tapa {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 14px;
          background: #101010; text-align: center; padding: 20px;
        }
        .palas-barra { height: 6px; background: #262626; border-radius: 3px; overflow: hidden; margin-top: 10px; }
        .palas-barra i { display: block; height: 100%; background: #ffeb3b; transition: width 0.1s linear; }
        .palas-reloj { font-variant-numeric: tabular-nums; font-weight: 700; color: #ffeb3b; font-size: 1.1rem; }
        .palas-btn {
          background: #ffeb3b; color: #111; border: 0; border-radius: 8px;
          padding: 12px 22px; font-size: 1rem; font-weight: 800; cursor: pointer;
          font-family: inherit;
        }
        .palas-btn:disabled { opacity: 0.5; cursor: default; }
        .palas-btn.secundario { background: transparent; color: #bbb; border: 1px solid #3a3a3a; }
        .palas-fila { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 16px; }
        .palas-input {
          background: #171717; color: #eee; border: 1px solid #3a3a3a; border-radius: 8px;
          padding: 12px 14px; font-size: 1.4rem; font-weight: 800; width: 120px;
          text-align: center; font-family: inherit; font-variant-numeric: tabular-nums;
        }
        .palas-error { color: #ff8a80; font-size: 0.85rem; margin-top: 10px; }
        .palas-resultado {
          margin-top: 18px; padding: 18px; border-radius: 10px;
          background: #141414; border: 1px solid #262626; text-align: center;
        }
        .palas-numero { font-size: 3rem; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
        .palas-exacto { color: #4caf50; }
        .palas-cerca { color: #ffeb3b; }
        .palas-lejos { color: #ff8a80; }
        .palas-nota { color: #888; font-size: 0.8rem; margin-top: 10px; line-height: 1.5; }
        .palas-tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 10px; }
        .palas-tabla td { padding: 6px 8px; border-top: 1px solid #222; }
        .palas-tabla td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
        .palas-seccion { font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: #777; margin: 26px 0 6px; font-weight: 600; }
        .palas-volver { color: #888; font-size: 0.85rem; text-decoration: none; display: inline-block; margin-top: 26px; }
        .palas-volver:hover { color: #ffeb3b; }
      `}</style>

      <div className="palas-caja">
        <div className="palas-eyebrow">Puzzle diario {meta ? `#${meta.puzzle}` : ''}</div>
        <h1 className="palas-titulo">¿Cuántas palas?</h1>
        <p className="palas-bajada">
          Mirá la pila unos segundos y decí cuántas hay. Un solo intento por día, y se
          rankea por cercanía: no hace falta acertar exacto para entrar a la tabla.
        </p>

        <div className="palas-lienzo-caja">
          <canvas ref={lienzo} />
          {fase !== 'mirando' && (
            <div className="palas-tapa">
              {fase === 'cargando' && <p style={{ color: '#777' }}>Cargando la pila del día…</p>}

              {fase === 'listo' && !error && (
                <>
                  <p style={{ color: '#bbb', margin: 0 }}>
                    La pila se muestra <strong>{meta?.escena?.segundos ?? 18} segundos</strong> y después se tapa.
                  </p>
                  <button className="palas-btn" onClick={empezar} disabled={!meta?.escena}>
                    Ver la pila (−{COSTO} de Reserva)
                  </button>
                </>
              )}

              {fase === 'respondiendo' && (
                <>
                  <p style={{ color: '#bbb', margin: 0 }}>Se terminó. ¿Cuántas eran?</p>
                  <div className="palas-fila" style={{ justifyContent: 'center' }}>
                    <input
                      className="palas-input"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="999"
                      value={intento}
                      autoFocus
                      onChange={(e) => setIntento(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
                    />
                    <button className="palas-btn" onClick={enviar}>Listo</button>
                  </div>
                </>
              )}

              {fase === 'resuelto' && resultado && (
                <>
                  <div className={`palas-numero ${resultado.exacto ? 'palas-exacto' : resultado.distancia <= 3 ? 'palas-cerca' : 'palas-lejos'}`}>
                    {resultado.total}
                  </div>
                  <p style={{ color: '#bbb', margin: 0 }}>
                    {resultado.exacto
                      ? '¡Exacto! Contaste las justas.'
                      : `Dijiste ${resultado.intento}. Te colgaste por ${resultado.distancia}.`}
                  </p>
                </>
              )}

              {error && <p className="palas-error" style={{ margin: 0 }}>{error}</p>}
            </div>
          )}
        </div>

        {fase === 'mirando' && (
          <>
            <div className="palas-barra">
              <i style={{ width: `${(restante / (meta?.escena?.segundos || 18)) * 100}%` }} />
            </div>
            <div className="palas-fila" style={{ justifyContent: 'space-between' }}>
              <span className="palas-reloj">{restante.toFixed(1)}s</span>
              <button className="palas-btn secundario" onClick={() => { clearInterval(temporizador.current); setFase('respondiendo'); }}>
                Ya conté
              </button>
            </div>
          </>
        )}

        {fase === 'resuelto' && resultado && (
          <div className="palas-resultado">
            {resultado.yaJugado && (
              <p className="palas-nota" style={{ marginTop: 0 }}>
                Ya habías jugado el de hoy. Un intento por día.
              </p>
            )}
            <button className="palas-btn secundario" onClick={compartir}>
              {copiado ? '¡Copiado!' : 'Compartir'}
            </button>
            {!puedeRankear && (
              <p className="palas-nota">
                Para entrar a la tabla hace falta cuenta y handle. Tu intento igual quedó
                guardado.
              </p>
            )}
          </div>
        )}

        {board?.daily?.length > 0 && (
          <>
            <div className="palas-seccion">Ranking de hoy</div>
            <table className="palas-tabla">
              <tbody>
                {board.daily.slice(0, 10).map((e) => (
                  <tr key={e.playerId}>
                    <td style={{ color: '#777', width: '2.5rem' }}>#{e.rank}</td>
                    <td>{e.playerName}</td>
                    <td>{e.attempts === 0 ? '🎯 exacto' : `±${e.attempts}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {board?.history?.length > 0 && (
          <>
            <div className="palas-seccion">Los que más acertaron</div>
            <table className="palas-tabla">
              <tbody>
                {board.history.slice(0, 10).map((e) => (
                  <tr key={e.playerId}>
                    <td style={{ color: '#777', width: '2.5rem' }}>#{e.rank}</td>
                    <td>{e.playerName}</td>
                    <td>{e.gamesWon} de {e.gamesPlayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <Link href="/menu" className="palas-volver">← Volver al Menú Principal</Link>
      </div>
    </div>
  );
}
