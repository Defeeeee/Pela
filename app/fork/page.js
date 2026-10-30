'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSocialCredit } from '../SocialCreditContext';
import { quienSoy, idAnonimo } from '../lib/sesionCliente';

/**
 * El árbol de pelados — contar los procesos que crea un programa con fork().
 *
 * Cuatro preguntas: cuántos procesos hay en total, cuántas veces se imprime una
 * etiqueta, cuántos son hijos directos del original, y qué profundidad alcanza
 * el árbol.
 *
 * LO QUE **NO** SE MUESTRA, igual que en La pila de palas: el árbol. La pantalla
 * podría dibujarlo creciendo rama por rama y quedaría precioso, pero eso
 * resolvería el puzzle. Lo único que se muestra es el listado.
 *
 * LO QUE SÍ SE EXPLICA es la regla, completa, en el cartel de arriba: `fork()`
 * devuelve 0 en el hijo y el pid del hijo en el padre, y los dos siguen desde la
 * línea siguiente. El puzzle no es adivinar la regla, es aplicarla sin marearse
 * — que es distinto, y mucho más difícil de lo que parece: tres `fork()` seguidos
 * crean ocho procesos.
 */

const CLAVE_ESTADO = 'pela_fork_estado';
const CLAVE_NOMBRE = 'pela_player_name';
const COSTO = 5;

// Sólo para pintar. La verdad sobre qué hace cada línea vive en
// `multiplayer-server/fork.js`, y acá no se simula nada.
const CLAVES = /^(int|void|return|if|else|for|while|static|pid_t)$/;
const FUNCS = /^(fork|printf|exit|wait|setvbuf|main|getpid)$/;

export default function ArbolDePelados() {
  const [meta, setMeta] = useState(null);
  const [fase, setFase] = useState('cargando'); // cargando | listo | jugando | resuelto
  const [resp, setResp] = useState({ total: '', etiqueta: '', hijosDirectos: '', profundidad: '' });
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
        const res = await fetch('/api/fork', { cache: 'no-store' });
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

  const prog = meta?.programa;

  const empezar = () => {
    deductCredit(COSTO, `fork-${meta.puzzle}`);
    setFase('jugando');
  };

  const setCampo = (k, v) => {
    setResp((r) => ({ ...r, [k]: v.replace(/[^0-9]/g, '') }));
  };

  const enviar = async () => {
    const campos = ['total', 'etiqueta', 'hijosDirectos', 'profundidad'];
    if (campos.some((c) => resp[c] === '')) { setError('Faltan respuestas: son cuatro.'); return; }
    setError('');

    const playerId = idAnonimo();
    if (!playerId) { setError('Tu navegador está bloqueando el almacenamiento, así que no se puede guardar el envío.'); return; }

    let nombre = '';
    try { nombre = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) { /* bloqueado */ }

    try {
      const res = await fetch('/api/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          playerName: nombre,
          respuesta: Object.fromEntries(campos.map((c) => [c, Number(resp[c])])),
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
        etiqueta: prog?.etiqueta || null,
        dichas: Object.fromEntries(campos.map((c) => [c, Number(resp[c])])),
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
      const res = await fetch('/api/fork?board=1', { cache: 'no-store' });
      setBoard(await res.json());
    } catch (e) { /* la tabla es accesoria */ }
  }, []);

  useEffect(() => { if (fase === 'resuelto') cargarBoard(); }, [fase, cargarBoard]);

  const ORDEN = ['total', 'etiqueta', 'hijosDirectos', 'profundidad'];

  const compartir = () => {
    if (!resultado) return;
    const grilla = resultado.detalle
      ? ORDEN.map((k) => (resultado.detalle[k] ? '🟩' : '🟥')).join('')
      : '';
    const texto = `El árbol de pelados #${resultado.puzzle}\n${grilla} ${resultado.mal === 0 ? '— las cuatro 🌳' : `— ${4 - resultado.mal}/4`}\npela.signai.ar/fork`;
    navigator.clipboard?.writeText(texto).then(
      () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
      () => {}
    );
  };

  const puedeRankear = sesion?.autenticado && sesion?.nombre;

  const pintar = (linea) => {
    if (!linea.trim()) return ' ';
    // Los #include van sin pintar: `<sys/wait.h>` lleva adentro la palabra
    // `wait`, y el resaltador la marcaba como si fuera la llamada al sistema.
    if (linea.startsWith('#')) return <span className="fk-str">{linea}</span>;
    const partes = linea.split(/(\b[a-z_]+\b|"[^"]*")/);
    return partes.map((t, i) => {
      if (/^"/.test(t)) return <span key={i} className="fk-str">{t}</span>;
      if (CLAVES.test(t)) return <span key={i} className="fk-clave">{t}</span>;
      if (FUNCS.test(t)) return <span key={i} className="fk-fn">{t}</span>;
      return <span key={i}>{t}</span>;
    });
  };

  return (
    <div className="fk-fondo">
      <style>{`
        .fk-fondo {
          min-height: 100vh; background: #0b0b0b; color: #eee;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex; flex-direction: column; align-items: center;
          padding: 1.5rem 1rem 3rem;
        }
        .fk-caja { width: 100%; max-width: 600px; }
        .fk-titulo {
          font-size: 2rem; font-weight: 800; letter-spacing: -0.02em;
          margin: 0 0 0.2rem; text-align: center;
        }
        .fk-sub { color: #888; font-size: 0.85rem; text-align: center; margin: 0 0 1.4rem; }
        .fk-tarjeta {
          background: #141414; border: 1px solid #262626; border-radius: 14px;
          padding: 1.1rem; margin-bottom: 1rem;
        }
        .fk-regla {
          background: #0e1510; border: 1px solid #1f3326; border-radius: 10px;
          padding: 0.8rem 0.9rem; font-size: 0.8rem; line-height: 1.6; color: #ccc;
        }
        .fk-regla b { color: #66bb6a; }
        .fk-regla code {
          font-family: ui-monospace, Menlo, monospace; color: #66bb6a;
          background: #15201a; padding: 0.05rem 0.3rem; border-radius: 4px;
        }
        .fk-etiqueta {
          font-size: 0.72rem; color: #777; text-transform: uppercase;
          letter-spacing: 0.08em; margin-bottom: 0.5rem;
        }
        /* El listado scrollea de costado por su cuenta: el cuerpo de la página
           nunca puede scrollear horizontal. */
        .fk-codigo {
          font-family: ui-monospace, Menlo, monospace; font-size: 0.8rem;
          line-height: 1.7; white-space: pre; overflow-x: auto;
          background: #0e0e0e; border: 1px solid #1f1f1f; border-radius: 8px;
          padding: 0.8rem 0.9rem; color: #bbb;
        }
        .fk-clave { color: #ce93d8; font-weight: 700; }
        .fk-fn { color: #64b5f6; }
        .fk-str { color: #ffb74d; }

        .fk-preg { margin-bottom: 0.9rem; }
        .fk-preg p { margin: 0 0 0.4rem; font-size: 0.88rem; color: #ddd; }
        .fk-preg p b { color: #66bb6a; }
        .fk-input {
          width: 100%; background: #1a1a1a; border: 1px solid #2f2f2f; color: #eee;
          border-radius: 8px; padding: 0.55rem 0.7rem; font-size: 0.95rem;
          font-family: ui-monospace, Menlo, monospace;
        }
        .fk-input:focus { outline: none; border-color: #66bb6a; }
        .fk-btn {
          width: 100%; background: #66bb6a; color: #0b0b0b; border: none; border-radius: 10px;
          padding: 0.8rem 1rem; font-size: 0.95rem; font-weight: 700; cursor: pointer;
          margin-top: 0.6rem;
        }
        .fk-btn.secundario { background: #232323; color: #ddd; }
        .fk-error { color: #e53935; font-size: 0.85rem; text-align: center; margin-top: 0.8rem; }
        .fk-nota { color: #888; font-size: 0.8rem; text-align: center; line-height: 1.5; }
        .fk-resultado { text-align: center; }
        .fk-grilla { font-size: 1.6rem; letter-spacing: 0.15em; margin-bottom: 0.4rem; }
        .fk-puntaje { font-size: 1.2rem; font-weight: 800; margin-bottom: 0.8rem; }
        .fk-repaso {
          font-size: 0.82rem; color: #aaa; line-height: 1.9;
          text-align: left; display: inline-block;
        }
        .fk-seccion {
          font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: #777; margin: 1.6rem 0 0.5rem;
        }
        .fk-tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .fk-tabla td { padding: 0.4rem 0.3rem; border-bottom: 1px solid #1e1e1e; }
        .fk-volver { display: block; text-align: center; color: #777; margin-top: 2rem; font-size: 0.85rem; }
      `}</style>

      <div className="fk-caja">
        <h1 className="fk-titulo">El árbol de pelados</h1>
        <p className="fk-sub">
          {meta ? `Árbol #${meta.puzzle}` : 'Cargando…'} · contá los procesos que quedan
        </p>

        {error && fase === 'cargando' && <p className="fk-error">{error}</p>}

        {fase === 'listo' && (
          <div className="fk-tarjeta">
            <div className="fk-regla">
              Un programa en C que llama a <code>fork()</code>:<br />
              · <code>fork()</code> <b>duplica el proceso</b>. Los dos siguen desde
              la línea de abajo, con la misma memoria.<br />
              · Devuelve <b>0 en el hijo</b> y el pid del hijo en el padre: por eso{' '}
              <code>if (fork() == 0)</code> separa uno de otro.<br />
              · <code>exit(0)</code> termina <b>ese</b> proceso, no a sus hijos.
            </div>
            <p className="fk-nota" style={{ marginTop: '0.9rem' }}>
              Parece fácil hasta que lo contás: tres <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>fork()</code> seguidos
              no crean cuatro procesos, crean <strong>ocho</strong>.
              <br />Una sola entrega por día.
            </p>
            <button className="fk-btn" onClick={empezar}>
              Ver el programa (−{COSTO} de Reserva)
            </button>
          </div>
        )}

        {fase === 'jugando' && prog && (
          <>
            <div className="fk-tarjeta">
              <div className="fk-regla" style={{ marginBottom: '1rem' }}>
                <code>fork()</code> duplica el proceso y los dos siguen desde la
                línea de abajo · devuelve <b>0 en el hijo</b> · <code>exit(0)</code>{' '}
                termina ese proceso pero <b>no a sus hijos</b>
              </div>
              <div className="fk-codigo">
                {prog.lineas.map((l, i) => <div key={i}>{pintar(l)}</div>)}
              </div>
              <p className="fk-nota" style={{ marginTop: '0.7rem', textAlign: 'left', fontSize: '0.76rem' }}>
                El <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>setvbuf</code> de la
                primera línea no es decoración: apaga el buffer de{' '}
                <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>stdout</code>. Sin eso, el
                buffer se copiaría junto con el proceso y habría líneas impresas de
                más — una trampa clásica, y acá está desactivada a propósito.
              </p>
            </div>

            <div className="fk-tarjeta">
              <div className="fk-preg">
                <p>1 · ¿Cuántos procesos existen en total, <b>contando el original</b>?</p>
                <input className="fk-input" value={resp.total} placeholder="?"
                  inputMode="numeric" onChange={(e) => setCampo('total', e.target.value)} />
              </div>
              <div className="fk-preg">
                <p>2 · ¿Cuántas veces se imprime <b>{prog.etiqueta}</b>?</p>
                <input className="fk-input" value={resp.etiqueta} placeholder="?"
                  inputMode="numeric" onChange={(e) => setCampo('etiqueta', e.target.value)} />
              </div>
              <div className="fk-preg">
                <p>3 · ¿Cuántos son <b>hijos directos</b> del original?</p>
                <input className="fk-input" value={resp.hijosDirectos} placeholder="?"
                  inputMode="numeric" onChange={(e) => setCampo('hijosDirectos', e.target.value)} />
              </div>
              <div className="fk-preg">
                <p>4 · ¿Cuántos <b>niveles</b> baja la rama más larga del árbol?</p>
                <input className="fk-input" value={resp.profundidad} placeholder="?"
                  inputMode="numeric" onChange={(e) => setCampo('profundidad', e.target.value)} />
              </div>
              <button className="fk-btn" onClick={enviar}>Entregar</button>
              {error && <p className="fk-error">{error}</p>}
            </div>
          </>
        )}

        {fase === 'resuelto' && resultado && (
          <div className="fk-tarjeta fk-resultado">
            {resultado.detalle && (
              <div className="fk-grilla">
                {ORDEN.map((k) => (resultado.detalle[k] ? '🟩' : '🟥')).join('')}
              </div>
            )}
            <div className="fk-puntaje">
              {resultado.mal === 0 ? '🌳 Las cuatro' : `${4 - resultado.mal} de 4`}
            </div>
            {resultado.detalle && (
              /* Se muestra lo que contestó y si estuvo bien, pero NUNCA el número
                 correcto: si volviera del servidor, el segundo jugador lo copia. */
              <div className="fk-repaso">
                {resultado.detalle.total ? '✅' : '❌'} procesos en total: {resultado.dichas?.total}<br />
                {resultado.detalle.etiqueta ? '✅' : '❌'} veces que se imprime {resultado.etiqueta}: {resultado.dichas?.etiqueta}<br />
                {resultado.detalle.hijosDirectos ? '✅' : '❌'} hijos directos: {resultado.dichas?.hijosDirectos}<br />
                {resultado.detalle.profundidad ? '✅' : '❌'} niveles de profundidad: {resultado.dichas?.profundidad}
              </div>
            )}
            {resultado.yaJugado && (
              <p className="fk-nota" style={{ marginTop: '0.8rem' }}>
                Ya habías entregado el de hoy. Una entrega por día.
              </p>
            )}
            <button className="fk-btn secundario" onClick={compartir}>
              {copiado ? '¡Copiado!' : 'Compartir'}
            </button>
            {!puedeRankear && (
              <p className="fk-nota" style={{ marginTop: '0.8rem' }}>
                Para entrar a la tabla hace falta cuenta y handle. Tu entrega igual quedó guardada.
              </p>
            )}
          </div>
        )}

        {board?.daily?.length > 0 && (
          <>
            <div className="fk-seccion">Ranking de hoy</div>
            <table className="fk-tabla">
              <tbody>
                {board.daily.slice(0, 10).map((e) => (
                  <tr key={e.playerId}>
                    <td style={{ color: '#777', width: '2.5rem' }}>#{e.rank}</td>
                    <td>{e.playerName}</td>
                    <td>{e.attempts === 0 ? '🌳 las cuatro' : `${4 - e.attempts} de 4`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {board?.history?.length > 0 && (
          <>
            <div className="fk-seccion">Los que más veces sacaron las cuatro</div>
            <table className="fk-tabla">
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

        <Link href="/menu" className="fk-volver">← Volver al Menú Principal</Link>
      </div>
    </div>
  );
}
