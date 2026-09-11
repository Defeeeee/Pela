'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSocialCredit } from '../SocialCreditContext';
import { quienSoy, idAnonimo } from '../lib/sesionCliente';

/**
 * ¿Qué devuelve? — el puzzle diario de leer código ajeno.
 *
 * Diez líneas de x86-64 y cuatro entradas. Decís qué devuelve cada una.
 *
 * ES EL PRIMER JUEGO DIARIO DEL SITIO QUE MIDE INGENIERÍA INVERSA. Los otros
 * cuatro son percepción (palas), deducción (Pelardle), búsqueda (bit golf) y
 * trazado (la pila); leer código de otro y entender qué hace no lo toca ninguno.
 *
 * LO QUE NO SE DEFIENDE, y queda escrito como el agujero de identidad de Pelardle
 * y el conteo por consola de las palas: el código es público, así que quien lo
 * pegue en un compilador tiene las cuatro respuestas sin pensar. No se tapa
 * porque hacer la trampa cuesta lo mismo que jugar — armar el archivo, compilar y
 * correr son los mismos minutos que trazarlo a mano. Es distinto del caso de las
 * palas, donde contar por consola es diez veces más rápido que contar con el ojo,
 * y por eso allá hizo falta un reloj y acá no.
 */

const CLAVE_ESTADO = 'pela_asm_estado';
const CLAVE_NOMBRE = 'pela_player_name';
const COSTO = 5;

// Para pintar el listado. Es sólo presentación: la fuente de verdad de qué
// instrucciones existen está en `multiplayer-server/asm.js`, y acá no se evalúa
// nada — a diferencia de bit golf, donde el cliente sí simula.
const MNEMONICOS = /^(mov|add|sub|imul|shl|sar|and|or|xor|neg|not|lea|cmp|test|ret|jl|jge|jg|jle|je|jne|js|jns|jz|jnz)$/;

export default function QueDevuelve() {
  const [meta, setMeta] = useState(null);
  const [fase, setFase] = useState('cargando'); // cargando | listo | jugando | resuelto
  const [respuestas, setRespuestas] = useState(['', '', '', '']);
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
        const res = await fetch('/api/asm', { cache: 'no-store' });
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

  const fn = meta?.funcion;

  const empezar = () => {
    deductCredit(COSTO, `asm-${meta.puzzle}`);
    setFase('jugando');
  };

  const setResp = (i, v) => {
    // Se permite el menos: los resultados negativos son la mitad del juego.
    const limpio = v.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '');
    setRespuestas((r) => r.map((x, k) => (k === i ? limpio : x)));
  };

  const enviar = async () => {
    if (respuestas.some((x) => x === '' || x === '-')) { setError('Faltan respuestas: son cuatro.'); return; }
    setError('');

    const playerId = idAnonimo();
    if (!playerId) { setError('Tu navegador está bloqueando el almacenamiento, así que no se puede guardar el envío.'); return; }

    let nombre = '';
    try { nombre = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) { /* bloqueado */ }

    try {
      const res = await fetch('/api/asm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, playerName: nombre, respuestas: respuestas.map(Number) }),
      });
      const datos = await res.json();
      if (datos.error && !datos.yaJugado) { setError(datos.error); return; }

      const r = {
        puzzle: meta.puzzle,
        mal: datos.mal,
        detalle: datos.detalle || null,
        perfecto: !!datos.perfecto,
        yaJugado: !!datos.yaJugado,
        entradas: fn?.entradas || null,
        dichas: respuestas.map(Number),
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
      const res = await fetch('/api/asm?board=1', { cache: 'no-store' });
      setBoard(await res.json());
    } catch (e) { /* la tabla es accesoria */ }
  }, []);

  useEffect(() => { if (fase === 'resuelto') cargarBoard(); }, [fase, cargarBoard]);

  const compartir = () => {
    if (!resultado) return;
    // Los cuadraditos dicen cuáles acertó y en qué orden, sin decir los números.
    const grilla = resultado.detalle ? resultado.detalle.map((ok) => (ok ? '🟩' : '🟥')).join('') : '';
    const texto = `¿Qué devuelve? #${resultado.puzzle}\n${grilla} ${resultado.mal === 0 ? '— las cuatro 🔬' : `— ${4 - resultado.mal}/4`}\npela.signai.ar/asm`;
    navigator.clipboard?.writeText(texto).then(
      () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
      () => {}
    );
  };

  const puedeRankear = sesion?.autenticado && sesion?.nombre;

  const pintar = (linea) => {
    if (!linea.startsWith(' ')) return <span className="asm-etiq">{linea}</span>;
    const m = linea.match(/^(\s+)(\S+)(\s*)(.*)$/);
    if (!m) return linea;
    const [, sangria, mnem, hueco, resto] = m;
    return (
      <>
        {sangria}
        <span className={MNEMONICOS.test(mnem) ? 'asm-mnem' : ''}>{mnem}</span>
        {hueco}
        <span className="asm-ops">{resto}</span>
      </>
    );
  };

  return (
    <div className="asm-fondo">
      <style>{`
        .asm-fondo {
          min-height: 100vh; background: #0b0b0b; color: #eee;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex; flex-direction: column; align-items: center;
          padding: 1.5rem 1rem 3rem;
        }
        .asm-caja { width: 100%; max-width: 580px; }
        .asm-titulo {
          font-size: 2rem; font-weight: 800; letter-spacing: -0.02em;
          margin: 0 0 0.2rem; text-align: center;
        }
        .asm-sub { color: #888; font-size: 0.85rem; text-align: center; margin: 0 0 1.4rem; }
        .asm-tarjeta {
          background: #141414; border: 1px solid #262626; border-radius: 14px;
          padding: 1.1rem; margin-bottom: 1rem;
        }
        .asm-regla {
          background: #17150c; border: 1px solid #3a3320; border-radius: 10px;
          padding: 0.8rem 0.9rem; font-size: 0.8rem; line-height: 1.6; color: #ccc;
        }
        .asm-regla b { color: #ffc107; }
        .asm-regla code {
          font-family: ui-monospace, Menlo, monospace; color: #ffc107;
          background: #241f10; padding: 0.05rem 0.3rem; border-radius: 4px;
        }
        .asm-etiqueta {
          font-size: 0.72rem; color: #777; text-transform: uppercase;
          letter-spacing: 0.08em; margin-bottom: 0.5rem;
        }
        /* El listado. Scrollea horizontal por su cuenta si hace falta: el cuerpo
           de la página nunca puede scrollear de costado. */
        .asm-codigo {
          font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem;
          line-height: 1.75; white-space: pre; overflow-x: auto;
          background: #0e0e0e; border: 1px solid #1f1f1f; border-radius: 8px;
          padding: 0.8rem 0.9rem; color: #999;
        }
        .asm-mnem { color: #64b5f6; font-weight: 700; }
        .asm-ops { color: #e6e6e6; }
        .asm-etiq { color: #ce93d8; font-weight: 700; }

        .asm-preguntas { display: grid; gap: 0.6rem; }
        .asm-pregunta {
          display: flex; align-items: center; gap: 0.7rem;
          font-family: ui-monospace, Menlo, monospace; font-size: 0.9rem;
        }
        .asm-llamada { color: #aaa; min-width: 8.5rem; }
        .asm-llamada b { color: #ffc107; }
        .asm-input {
          flex: 1; background: #1a1a1a; border: 1px solid #2f2f2f; color: #eee;
          border-radius: 8px; padding: 0.55rem 0.7rem; font-size: 0.95rem;
          font-family: ui-monospace, Menlo, monospace; min-width: 0;
        }
        .asm-input:focus { outline: none; border-color: #ffc107; }
        .asm-input.bien { border-color: #66bb6a; }
        .asm-input.mal { border-color: #e53935; }
        .asm-btn {
          width: 100%; background: #ffc107; color: #111; border: none; border-radius: 10px;
          padding: 0.8rem 1rem; font-size: 0.95rem; font-weight: 700; cursor: pointer;
          margin-top: 1rem;
        }
        .asm-btn.secundario { background: #232323; color: #ddd; }
        .asm-error { color: #e53935; font-size: 0.85rem; text-align: center; margin-top: 0.8rem; }
        .asm-nota { color: #888; font-size: 0.8rem; text-align: center; line-height: 1.5; }
        .asm-resultado { text-align: center; }
        .asm-grilla { font-size: 1.6rem; letter-spacing: 0.15em; margin-bottom: 0.4rem; }
        .asm-puntaje { font-size: 1.2rem; font-weight: 800; margin-bottom: 0.8rem; }
        .asm-repaso {
          font-family: ui-monospace, Menlo, monospace; font-size: 0.82rem;
          color: #aaa; line-height: 1.9; text-align: left; display: inline-block;
        }
        .asm-seccion {
          font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: #777; margin: 1.6rem 0 0.5rem;
        }
        .asm-tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .asm-tabla td { padding: 0.4rem 0.3rem; border-bottom: 1px solid #1e1e1e; }
        .asm-volver { display: block; text-align: center; color: #777; margin-top: 2rem; font-size: 0.85rem; }
      `}</style>

      <div className="asm-caja">
        <h1 className="asm-titulo">¿Qué devuelve?</h1>
        <p className="asm-sub">
          {meta ? `Función #${meta.puzzle}` : 'Cargando…'} · leé el código y decí qué sale
        </p>

        {error && fase === 'cargando' && <p className="asm-error">{error}</p>}

        {fase === 'listo' && (
          <div className="asm-tarjeta">
            <div className="asm-regla">
              Una función en <b>x86-64</b>, convención System V:<br />
              · El entero que recibe llega en <code>edi</code>.<br />
              · Lo que devuelve queda en <code>eax</code>.<br />
              · Todo es aritmética de <b>32 bits con signo</b>, así que hay
              negativos y hay complemento a dos.
            </div>
            <p className="asm-nota" style={{ marginTop: '0.9rem' }}>
              Vas a ver el listado y cuatro entradas. Una sola entrega por día.
            </p>
            <button className="asm-btn" onClick={empezar}>
              Ver la función (−{COSTO} de Reserva)
            </button>
          </div>
        )}

        {fase === 'jugando' && fn && (
          <>
            <div className="asm-tarjeta">
              <div className="asm-regla" style={{ marginBottom: '1rem' }}>
                Entra por <code>edi</code>, sale por <code>eax</code> · enteros de{' '}
                <b>32 bits con signo</b>
              </div>
              <div className="asm-codigo">
                {fn.lineas.map((l, i) => (
                  <div key={i}>{pintar(l)}</div>
                ))}
              </div>
            </div>

            <div className="asm-tarjeta">
              <div className="asm-etiqueta">¿Qué devuelve para cada una?</div>
              <div className="asm-preguntas">
                {fn.entradas.map((e, i) => (
                  <div key={i} className="asm-pregunta">
                    <span className="asm-llamada">pela(<b>{e}</b>) =</span>
                    <input
                      className="asm-input"
                      value={respuestas[i]}
                      onChange={(ev) => setResp(i, ev.target.value)}
                      placeholder="?"
                      inputMode="numeric"
                    />
                  </div>
                ))}
              </div>
              <button className="asm-btn" onClick={enviar}>Entregar</button>
              {error && <p className="asm-error">{error}</p>}
            </div>
          </>
        )}

        {fase === 'resuelto' && resultado && (
          <div className="asm-tarjeta asm-resultado">
            {resultado.detalle && (
              <div className="asm-grilla">
                {resultado.detalle.map((ok) => (ok ? '🟩' : '🟥')).join('')}
              </div>
            )}
            <div className="asm-puntaje">
              {resultado.mal === 0 ? '🔬 Las cuatro' : `${4 - resultado.mal} de 4`}
            </div>
            {resultado.detalle && resultado.entradas && (
              /* Se muestra qué contestó y si estuvo bien, pero NUNCA el número
                 correcto: si volviera del servidor, el segundo jugador lo copia
                 del primero. */
              <div className="asm-repaso">
                {resultado.entradas.map((e, i) => (
                  <div key={i}>
                    {resultado.detalle[i] ? '✅' : '❌'} pela({e}) = {resultado.dichas?.[i]}
                  </div>
                ))}
              </div>
            )}
            {resultado.yaJugado && (
              <p className="asm-nota" style={{ marginTop: '0.8rem' }}>
                Ya habías entregado el de hoy. Una entrega por día.
              </p>
            )}
            <button className="asm-btn secundario" onClick={compartir}>
              {copiado ? '¡Copiado!' : 'Compartir'}
            </button>
            {!puedeRankear && (
              <p className="asm-nota" style={{ marginTop: '0.8rem' }}>
                Para entrar a la tabla hace falta cuenta y handle. Tu entrega igual quedó guardada.
              </p>
            )}
          </div>
        )}

        {board?.daily?.length > 0 && (
          <>
            <div className="asm-seccion">Ranking de hoy</div>
            <table className="asm-tabla">
              <tbody>
                {board.daily.slice(0, 10).map((e) => (
                  <tr key={e.playerId}>
                    <td style={{ color: '#777', width: '2.5rem' }}>#{e.rank}</td>
                    <td>{e.playerName}</td>
                    <td>{e.attempts === 0 ? '🔬 las cuatro' : `${4 - e.attempts} de 4`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {board?.history?.length > 0 && (
          <>
            <div className="asm-seccion">Los que más veces sacaron las cuatro</div>
            <table className="asm-tabla">
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

        <Link href="/menu" className="asm-volver">← Volver al Menú Principal</Link>
      </div>
    </div>
  );
}
