'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSocialCredit } from '../SocialCreditContext';
import { quienSoy, idAnonimo } from '../lib/sesionCliente';

/**
 * La pila de palas — seguir el puntero por una secuencia de PUSH y POP.
 *
 * LA DECISIÓN DE DISEÑO IMPORTANTE ES QUÉ **NO** SE MUESTRA. La pantalla podría
 * ir dibujando la pila operación por operación, y quedaría lindísimo — pero eso
 * resolvería el puzzle. Lo único que se muestra es el punto de partida y la
 * lista de operaciones; la memoria arranca vacía y se queda vacía. Trazarla es
 * el juego, y se traza en la cabeza o en un papel, como en la materia.
 *
 * Lo que sí se muestra es la convención, completa y sin vueltas, en el cartel de
 * arriba. El puzzle no es adivinar la regla: es aplicarla sin marearse. Esconder
 * la regla lo volvería un juego de adivinanza y lo haría peor.
 */

const CLAVE_ESTADO = 'pela_pila_estado';
const CLAVE_NOMBRE = 'pela_player_name';
const COSTO = 5;

const hex = (v) => '0x' + v.toString(16).toUpperCase().padStart(2, '0');

export default function PilaDePalas() {
  const [meta, setMeta] = useState(null);
  const [fase, setFase] = useState('cargando'); // cargando | listo | jugando | resuelto
  const [r7, setR7] = useState('');
  const [arriba, setArriba] = useState('');
  const [cuantas, setCuantas] = useState('');
  const [enConsulta, setEnConsulta] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [board, setBoard] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const { deductCredit } = useSocialCredit();

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/pila', { cache: 'no-store' });
        const datos = await res.json();
        if (!vivo) return;
        if (!datos.ok) { setError(datos.error || 'No se pudo cargar el puzzle.'); return; }
        setMeta(datos);

        try {
          const guardado = JSON.parse(localStorage.getItem(CLAVE_ESTADO) || 'null');
          if (guardado?.puzzle === datos.puzzle) {
            setResultado(guardado);
            setFase('resuelto');
            return;
          }
        } catch (e) { /* bloqueado o basura: se juega igual */ }
        setFase('listo');
      } catch (e) {
        if (vivo) setError('No se pudo cargar el puzzle de hoy.');
      }
    })();
    quienSoy().then((s) => { if (vivo) setSesion(s); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const sec = meta?.secuencia;

  // Las palas que aparecen en la secuencia, para ofrecerlas como opciones. Salen
  // de los PUSH, así que es la lista exacta de las que existen: nadie puede
  // contestar una pala que nunca se apiló.
  const palas = sec ? sec.ops.filter((o) => o[0] === 'PUSH').map((o) => o[1]) : [];

  const empezar = () => {
    deductCredit(COSTO, `pila-${meta.puzzle}`);
    setFase('jugando');
  };

  const enviar = async () => {
    if (r7 === '' || arriba === '' || cuantas === '' || enConsulta === '') {
      setError('Faltan respuestas: son cuatro.');
      return;
    }
    setError('');

    const playerId = idAnonimo();
    if (!playerId) { setError('Tu navegador está bloqueando el almacenamiento, así que no se puede guardar el envío.'); return; }

    let nombre = '';
    try { nombre = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) { /* bloqueado */ }

    try {
      const res = await fetch('/api/pila', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          playerName: nombre,
          respuesta: {
            // `r7` se escribe en hexa porque es una dirección y así se lee en la
            // materia; se manda en decimal, que es lo que corrige el servidor.
            r7: parseInt(r7, 16),
            arriba: Number(arriba),
            cuantas: Number(cuantas),
            enConsulta: enConsulta === 'nada' ? null : Number(enConsulta),
          },
        }),
      });
      const datos = await res.json();
      if (datos.error && !datos.yaJugado) { setError(datos.error); return; }

      const r = {
        puzzle: meta.puzzle,
        mal: datos.mal,
        detalle: datos.detalle || null,
        perfecto: !!datos.perfecto,
        yaJugado: !!datos.yaJugado,
      };
      setResultado(r);
      setFase('resuelto');
      try { localStorage.setItem(CLAVE_ESTADO, JSON.stringify(r)); } catch (e) { /* bloqueado */ }
    } catch (e) {
      setError('No se pudo enviar. Probá de nuevo.');
    }
  };

  const cargarBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/pila?board=1', { cache: 'no-store' });
      setBoard(await res.json());
    } catch (e) { /* la tabla es accesoria */ }
  }, []);

  useEffect(() => { if (fase === 'resuelto') cargarBoard(); }, [fase, cargarBoard]);

  const compartir = () => {
    if (!resultado) return;
    // Los cuadraditos dicen cuáles acertó y en qué orden, sin decir las
    // respuestas: es la misma idea que la grilla de Wordle.
    const orden = ['r7', 'arriba', 'cuantas', 'enConsulta'];
    const grilla = resultado.detalle
      ? orden.map((k) => (resultado.detalle[k] ? '🟩' : '🟥')).join('')
      : '';
    const texto = `La pila de palas #${resultado.puzzle}\n${grilla} ${resultado.mal === 0 ? '— perfecto 🏆' : `— ${4 - resultado.mal}/4`}\npela.signai.ar/pila`;
    navigator.clipboard?.writeText(texto).then(
      () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
      () => {}
    );
  };

  const puedeRankear = sesion?.autenticado && sesion?.nombre;

  return (
    <div className="pila-fondo">
      <style>{`
        .pila-fondo {
          min-height: 100vh; background: #0b0b0b; color: #eee;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex; flex-direction: column; align-items: center;
          padding: 1.5rem 1rem 3rem;
        }
        .pila-caja { width: 100%; max-width: 580px; }
        .pila-titulo {
          font-size: 2rem; font-weight: 800; letter-spacing: -0.02em;
          margin: 0 0 0.2rem; text-align: center;
        }
        .pila-sub { color: #888; font-size: 0.85rem; text-align: center; margin: 0 0 1.4rem; }
        .pila-tarjeta {
          background: #141414; border: 1px solid #262626; border-radius: 14px;
          padding: 1.1rem; margin-bottom: 1rem;
        }
        .pila-regla {
          background: #17150c; border: 1px solid #3a3320; border-radius: 10px;
          padding: 0.8rem 0.9rem; font-size: 0.8rem; line-height: 1.6; color: #ccc;
        }
        .pila-regla b { color: #ffc107; }
        .pila-etiqueta {
          font-size: 0.72rem; color: #777; text-transform: uppercase;
          letter-spacing: 0.08em; margin-bottom: 0.5rem;
        }
        .pila-r7 {
          font-family: ui-monospace, Menlo, monospace; font-size: 1.8rem;
          font-weight: 700; color: #ffc107; text-align: center;
        }
        /* Dos columnas para que entren las catorce sin scrollear, pero con el
           flujo POR COLUMNA: la primera mitad de arriba a abajo y después la
           segunda. Con el flujo por fila —que es el que sale solo— la secuencia
           se lee 1, 2 / 3, 4 zigzagueando, y en un puzzle cuyo único trabajo es
           trazar en orden, ese zigzag causa errores que no son del jugador. */
        .pila-ops {
          display: grid; grid-auto-flow: column; gap: 0.3rem 0.8rem;
          grid-template-columns: repeat(2, 1fr);
          font-family: ui-monospace, Menlo, monospace; font-size: 0.85rem;
        }
        .pila-op {
          display: flex; gap: 0.6rem; padding: 0.3rem 0.5rem;
          background: #1a1a1a; border-radius: 6px; align-items: baseline;
        }
        .pila-n { color: #555; font-size: 0.75rem; min-width: 1.4rem; }
        .pila-push { color: #66bb6a; font-weight: 700; }
        .pila-pop { color: #ef5350; font-weight: 700; }
        .pila-pala { color: #ffc107; }

        .pila-pregunta { margin-bottom: 1rem; }
        .pila-pregunta p { margin: 0 0 0.45rem; font-size: 0.88rem; color: #ddd; }
        .pila-input, .pila-select {
          width: 100%; background: #1a1a1a; border: 1px solid #2f2f2f; color: #eee;
          border-radius: 8px; padding: 0.6rem 0.7rem; font-size: 0.95rem;
          font-family: ui-monospace, Menlo, monospace;
        }
        .pila-input:focus, .pila-select:focus { outline: none; border-color: #ffc107; }
        .pila-prefijo { display: flex; align-items: center; gap: 0.4rem; }
        .pila-prefijo span { font-family: ui-monospace, Menlo, monospace; color: #777; }
        .pila-btn {
          width: 100%; background: #ffc107; color: #111; border: none; border-radius: 10px;
          padding: 0.8rem 1rem; font-size: 0.95rem; font-weight: 700; cursor: pointer;
        }
        .pila-btn.secundario { background: #232323; color: #ddd; }
        .pila-error { color: #e53935; font-size: 0.85rem; text-align: center; margin-top: 0.8rem; }
        .pila-nota { color: #888; font-size: 0.8rem; text-align: center; line-height: 1.5; }
        .pila-resultado { text-align: center; }
        .pila-grilla { font-size: 1.6rem; letter-spacing: 0.15em; margin-bottom: 0.4rem; }
        .pila-puntaje { font-size: 1.2rem; font-weight: 800; margin-bottom: 0.6rem; }
        .pila-detalle { font-size: 0.82rem; color: #aaa; line-height: 1.9; text-align: left; display: inline-block; }
        .pila-seccion {
          font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: #777; margin: 1.6rem 0 0.5rem;
        }
        .pila-tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .pila-tabla td { padding: 0.4rem 0.3rem; border-bottom: 1px solid #1e1e1e; }
        .pila-volver { display: block; text-align: center; color: #777; margin-top: 2rem; font-size: 0.85rem; }
      `}</style>

      <div className="pila-caja">
        <h1 className="pila-titulo">La pila de palas</h1>
        <p className="pila-sub">
          {meta ? `Pila #${meta.puzzle}` : 'Cargando…'} · seguí el puntero hasta el final
        </p>

        {error && fase === 'cargando' && <p className="pila-error">{error}</p>}

        {fase === 'listo' && (
          <div className="pila-tarjeta">
            <div className="pila-regla">
              Una pila de palas en memoria, con la convención de la materia:<br />
              · La pila <b>crece hacia abajo</b>: apilar baja la dirección.<br />
              · <b>R7 apunta al próximo lugar libre</b>, no al tope. La pala de
              arriba está en <b>R7 + 1</b>.<br />
              · <b>Popear no borra nada</b>: la pala se queda en memoria hasta que
              otra la pise.
            </div>
            <p className="pila-nota" style={{ marginTop: '0.9rem' }}>
              Vas a ver la secuencia de operaciones y cuatro preguntas. Una sola
              entrega por día.
            </p>
            <button className="pila-btn" onClick={empezar} style={{ marginTop: '0.6rem' }}>
              Ver la secuencia (−{COSTO} de Reserva)
            </button>
          </div>
        )}

        {fase === 'jugando' && sec && (
          <>
            <div className="pila-tarjeta">
              <div className="pila-regla" style={{ marginBottom: '1rem' }}>
                La pila <b>crece hacia abajo</b> · <b>R7</b> apunta al próximo
                lugar <b>libre</b>, el tope está en <b>R7 + 1</b> · <b>popear no
                borra</b>.
              </div>
              <div className="pila-etiqueta">R7 al empezar (la memoria arranca vacía)</div>
              <div className="pila-r7">{hex(sec.r7Inicial)}</div>
            </div>

            <div className="pila-tarjeta">
              <div className="pila-etiqueta">Las operaciones, en orden</div>
              <div
                className="pila-ops"
                style={{ gridTemplateRows: `repeat(${Math.ceil(sec.ops.length / 2)}, auto)` }}
              >
                {sec.ops.map((o, i) => (
                  <div key={i} className="pila-op">
                    <span className="pila-n">{i + 1}</span>
                    {o[0] === 'PUSH'
                      ? <><span className="pila-push">PUSH</span><span className="pila-pala">pala {o[1]}</span></>
                      : <span className="pila-pop">POP</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="pila-tarjeta">
              <div className="pila-pregunta">
                <p>1 · ¿En qué dirección queda <strong>R7</strong>?</p>
                <div className="pila-prefijo">
                  <span>0x</span>
                  <input
                    /* El placeholder NO puede ser un hexa que parezca una
                       respuesta ya puesta: decía "1E", que es justo el valor
                       inicial de R7 y una de las respuestas más plausibles. */
                    className="pila-input" value={r7} maxLength={2} placeholder="??"
                    onChange={(e) => setR7(e.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase())}
                  />
                </div>
              </div>

              <div className="pila-pregunta">
                <p>2 · ¿Qué pala queda <strong>arriba de todo</strong>?</p>
                <select className="pila-select" value={arriba} onChange={(e) => setArriba(e.target.value)}>
                  <option value="">Elegí una pala…</option>
                  {palas.map((p) => <option key={p} value={p}>pala {p}</option>)}
                </select>
              </div>

              <div className="pila-pregunta">
                <p>3 · ¿<strong>Cuántas palas</strong> quedan en la pila?</p>
                <select className="pila-select" value={cuantas} onChange={(e) => setCuantas(e.target.value)}>
                  <option value="">Elegí…</option>
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="pila-pregunta">
                <p>4 · ¿Qué hay en <strong>{hex(sec.consulta)}</strong> cuando termina todo?</p>
                <select className="pila-select" value={enConsulta} onChange={(e) => setEnConsulta(e.target.value)}>
                  <option value="">Elegí…</option>
                  <option value="nada">nada, nunca se escribió</option>
                  {palas.map((p) => <option key={p} value={p}>pala {p}</option>)}
                </select>
              </div>

              <button className="pila-btn" onClick={enviar}>Entregar</button>
              {error && <p className="pila-error">{error}</p>}
            </div>
          </>
        )}

        {fase === 'resuelto' && resultado && (
          <div className="pila-tarjeta pila-resultado">
            {resultado.detalle && (
              <div className="pila-grilla">
                {['r7', 'arriba', 'cuantas', 'enConsulta']
                  .map((k) => (resultado.detalle[k] ? '🟩' : '🟥')).join('')}
              </div>
            )}
            <div className="pila-puntaje">
              {resultado.mal === 0 ? '🏆 Las cuatro' : `${4 - resultado.mal} de 4`}
            </div>
            {resultado.detalle && (
              <div className="pila-detalle">
                {resultado.detalle.r7 ? '✅' : '❌'} dónde queda R7<br />
                {resultado.detalle.arriba ? '✅' : '❌'} qué pala quedó arriba<br />
                {resultado.detalle.cuantas ? '✅' : '❌'} cuántas quedan<br />
                {resultado.detalle.enConsulta ? '✅' : '❌'} qué hay en la dirección
              </div>
            )}
            {resultado.yaJugado && (
              <p className="pila-nota" style={{ marginTop: '0.8rem' }}>
                Ya habías entregado el de hoy. Una entrega por día.
              </p>
            )}
            <button className="pila-btn secundario" onClick={compartir} style={{ marginTop: '1rem' }}>
              {copiado ? '¡Copiado!' : 'Compartir'}
            </button>
            {!puedeRankear && (
              <p className="pila-nota" style={{ marginTop: '0.8rem' }}>
                Para entrar a la tabla hace falta cuenta y handle. Tu entrega igual quedó guardada.
              </p>
            )}
          </div>
        )}

        {board?.daily?.length > 0 && (
          <>
            <div className="pila-seccion">Ranking de hoy</div>
            <table className="pila-tabla">
              <tbody>
                {board.daily.slice(0, 10).map((e) => (
                  <tr key={e.playerId}>
                    <td style={{ color: '#777', width: '2.5rem' }}>#{e.rank}</td>
                    <td>{e.playerName}</td>
                    <td>{e.attempts === 0 ? '🏆 las cuatro' : `${4 - e.attempts} de 4`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {board?.history?.length > 0 && (
          <>
            <div className="pila-seccion">Los que más veces sacaron las cuatro</div>
            <table className="pila-tabla">
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

        <Link href="/menu" className="pila-volver">← Volver al Menú Principal</Link>
      </div>
    </div>
  );
}
