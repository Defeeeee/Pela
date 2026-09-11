'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSocialCredit } from '../SocialCreditContext';
import { quienSoy, idAnonimo } from '../lib/sesionCliente';

/**
 * Bit Golf — llegar de un byte a otro en los menos golpes.
 *
 * Te dan un byte inicial, uno objetivo y cinco operaciones. El par está a la
 * vista, como en el golf.
 *
 * ACÁ NO HAY NADA ESCONDIDO, y es una diferencia de fondo con los otros dos
 * juegos diarios. En Pelardle la palabra es secreta; en las palas, el total. Acá
 * el jugador tiene todo: los dos bytes, las operaciones y el par. Puede probar
 * cuanto quiera en la pantalla, porque la simulación corre del lado del cliente
 * y no le pregunta nada al servidor.
 *
 * Eso no lo rompe: el juego es de camino corto, no de adivinanza. Lo único que
 * el servidor guarda es el ENVÍO, que es uno por día — lo que se rankea es en
 * cuántos golpes llegaste, y el desempate es la hora. Igual que en el ajedrez,
 * que se juega con el tablero a la vista.
 */

const CLAVE_ESTADO = 'pela_bitgolf_estado';
const CLAVE_NOMBRE = 'pela_player_name';
const COSTO = 5;

/**
 * Las cinco operaciones, repetidas del lado del cliente para poder simular sin
 * ida y vuelta al servidor.
 *
 * Está duplicado con `multiplayer-server/bitgolf.js` A PROPÓSITO, y conviene
 * saber por qué: el servidor no puede confiar en el cliente, así que igual tiene
 * que corregir con su propia copia; y el cliente no puede pedirle al servidor
 * cada golpe, porque el juego es probar. Como las dos copias son públicas y el
 * servidor es el que puntúa, una divergencia se ve enseguida — el jugador
 * mandaría una solución que en su pantalla llegaba y el servidor la rechazaría.
 */
const OPS = [
  { clave: 'SHL', etiqueta: 'SHL', ayuda: 'corre los bits a la izquierda; el de arriba se pierde', f: (x) => (x << 1) & 0xff },
  { clave: 'SHR', etiqueta: 'SHR', ayuda: 'corre los bits a la derecha; el de abajo se pierde', f: (x) => x >>> 1 },
  { clave: 'NOT', etiqueta: 'NOT', ayuda: 'invierte los ocho bits', f: (x) => ~x & 0xff },
  { clave: 'XOR', etiqueta: 'XOR 0F', ayuda: 'invierte los cuatro bits de abajo', f: (x) => x ^ 0x0f },
  { clave: 'INC', etiqueta: 'ADD 1', ayuda: 'suma uno; de FF vuelve a 00', f: (x) => (x + 1) & 0xff },
];

const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');
const bits = (v) => v.toString(2).padStart(8, '0');

export default function BitGolf() {
  const [meta, setMeta] = useState(null);
  const [fase, setFase] = useState('cargando'); // cargando | listo | jugando | resuelto
  const [jugadas, setJugadas] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [board, setBoard] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const { deductCredit } = useSocialCredit();

  // ── Carga ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/bitgolf', { cache: 'no-store' });
        const datos = await res.json();
        if (!vivo) return;
        if (!datos.ok) { setError(datos.error || 'No se pudo cargar el puzzle.'); return; }
        setMeta(datos);

        // Si ya jugó hoy, se muestra el resultado en vez del puzzle.
        try {
          const guardado = JSON.parse(localStorage.getItem(CLAVE_ESTADO) || 'null');
          if (guardado?.puzzle === datos.puzzle) {
            setResultado(guardado);
            setJugadas(guardado.jugadas || []);
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

  // ── Estado del tablero ────────────────────────────────────────────────────
  // El byte actual es el inicial con todos los golpes aplicados. Se recalcula
  // desde cero en cada render en vez de guardarlo: son cinco operaciones sobre
  // un byte, y así deshacer es sacar un elemento del arreglo y nada más.
  const valores = [];
  let actual = meta?.hoyo?.desde ?? 0;
  valores.push(actual);
  for (const clave of jugadas) {
    const op = OPS.find((o) => o.clave === clave);
    if (op) { actual = op.f(actual); valores.push(actual); }
  }
  const objetivo = meta?.hoyo?.hasta ?? 0;
  const par = meta?.hoyo?.par ?? 0;
  const topeGolpes = meta?.hoyo?.golpesMax ?? 14;
  const llego = fase === 'jugando' && actual === objetivo;

  const empezar = () => {
    deductCredit(COSTO, `bitgolf-${meta.puzzle}`);
    setFase('jugando');
  };

  const golpear = (clave) => {
    if (jugadas.length >= topeGolpes) return;
    setJugadas((j) => [...j, clave]);
  };

  const deshacer = () => setJugadas((j) => j.slice(0, -1));
  const reiniciar = () => setJugadas([]);

  // ── Envío ─────────────────────────────────────────────────────────────────
  const enviar = async () => {
    if (jugadas.length === 0) { setError('Todavía no jugaste ningún golpe.'); return; }
    setError('');

    // `idAnonimo()` CREA el identificador si no existe: leerlo del localStorage
    // a mano dejaría sin jugar a cualquiera que entre por primera vez por acá.
    const playerId = idAnonimo();
    if (!playerId) { setError('Tu navegador está bloqueando el almacenamiento, así que no se puede guardar el envío.'); return; }

    let nombre = '';
    try { nombre = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch (e) { /* bloqueado */ }

    try {
      const res = await fetch('/api/bitgolf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, playerName: nombre, jugadas }),
      });
      const datos = await res.json();
      if (datos.error && !datos.yaJugado) { setError(datos.error); return; }

      const r = {
        puzzle: meta.puzzle,
        golpes: datos.golpes ?? jugadas.length,
        par: datos.par ?? par,
        llego: !!datos.llego,
        enPar: !!datos.enPar,
        sobrePar: datos.sobrePar ?? null,
        yaJugado: !!datos.yaJugado,
        jugadas,
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
      const res = await fetch('/api/bitgolf?board=1', { cache: 'no-store' });
      setBoard(await res.json());
    } catch (e) { /* la tabla es accesoria */ }
  }, []);

  useEffect(() => { if (fase === 'resuelto') cargarBoard(); }, [fase, cargarBoard]);

  const compartir = () => {
    if (!resultado) return;
    // El texto no dice el camino, sólo el puntaje: quien lo lea todavía tiene
    // que encontrarlo. Los bytes son públicos igual, así que no hay spoiler
    // posible más allá de eso.
    const linea = !resultado.llego
      ? 'No llegué 😵'
      : resultado.enPar
        ? `En el par, ${resultado.golpes} golpes ⛳`
        : `${resultado.golpes} golpes (${resultado.sobrePar > 0 ? '+' : ''}${resultado.sobrePar})`;
    const texto = `Bit Golf #${resultado.puzzle}\npar ${resultado.par} · ${linea}\npela.signai.ar/bitgolf`;
    navigator.clipboard?.writeText(texto).then(
      () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
      () => {}
    );
  };

  const puedeRankear = sesion?.autenticado && sesion?.nombre;

  return (
    <div className="bg-fondo">
      <style>{`
        .bg-fondo {
          min-height: 100vh; background: #0b0b0b; color: #eee;
          font-family: system-ui, -apple-system, sans-serif;
          display: flex; flex-direction: column; align-items: center;
          padding: 1.5rem 1rem 3rem;
        }
        .bg-caja { width: 100%; max-width: 580px; }
        .bg-titulo {
          font-size: 2rem; font-weight: 800; letter-spacing: -0.02em;
          margin: 0 0 0.2rem; text-align: center;
        }
        .bg-sub { color: #888; font-size: 0.85rem; text-align: center; margin: 0 0 1.4rem; }
        .bg-tarjeta {
          background: #141414; border: 1px solid #262626; border-radius: 14px;
          padding: 1.1rem; margin-bottom: 1rem;
        }
        .bg-marcador {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 0.8rem; color: #888; margin-bottom: 0.9rem;
        }
        .bg-par { color: #ffc107; font-weight: 700; }

        /* El byte: hexadecimal grande y los ocho bits abajo. Los dos a la vez
           porque el juego se piensa en bits pero se lee en hexa. */
        .bg-byte { text-align: center; }
        .bg-hex {
          font-family: ui-monospace, Menlo, monospace; font-size: 2.6rem;
          font-weight: 700; letter-spacing: 0.04em; line-height: 1.1;
        }
        .bg-bits { display: flex; gap: 3px; justify-content: center; margin-top: 0.5rem; }
        .bg-bit {
          width: 26px; height: 30px; border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          font-family: ui-monospace, Menlo, monospace; font-size: 0.9rem; font-weight: 700;
          background: #1e1e1e; color: #555; border: 1px solid #2a2a2a;
          transition: background 0.15s, color 0.15s;
        }
        .bg-bit.uno { background: #ffc107; color: #111; border-color: #ffc107; }
        /* Un bit que NO coincide con el objetivo se marca: es la información que
           hace jugable el puzzle sin resolverlo, porque no dice qué operación
           usar sino solamente cuánto falta. */
        .bg-bit.difiere { outline: 2px solid #e53935; outline-offset: 1px; }
        .bg-flecha { text-align: center; color: #444; font-size: 1.3rem; margin: 0.5rem 0; }
        .bg-etiqueta { font-size: 0.72rem; color: #777; text-transform: uppercase; letter-spacing: 0.08em; }

        .bg-ops { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
        .bg-op {
          background: #1e1e1e; border: 1px solid #2f2f2f; color: #eee;
          border-radius: 10px; padding: 0.7rem 0.2rem; cursor: pointer;
          font-family: ui-monospace, Menlo, monospace; font-size: 0.85rem; font-weight: 700;
        }
        .bg-op:hover:not(:disabled) { background: #2a2a2a; border-color: #ffc107; }
        .bg-op:disabled { opacity: 0.35; cursor: not-allowed; }
        .bg-ayuda { font-size: 0.72rem; color: #666; margin-top: 0.7rem; line-height: 1.5; }

        .bg-camino {
          display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.9rem;
          font-family: ui-monospace, Menlo, monospace; font-size: 0.78rem;
        }
        .bg-paso {
          background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
          padding: 0.25rem 0.5rem; color: #aaa;
        }
        .bg-fila { display: flex; gap: 0.6rem; margin-top: 1rem; }
        .bg-btn {
          flex: 1; background: #ffc107; color: #111; border: none; border-radius: 10px;
          padding: 0.8rem 1rem; font-size: 0.95rem; font-weight: 700; cursor: pointer;
        }
        .bg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .bg-btn.secundario { background: #232323; color: #ddd; }
        .bg-error { color: #e53935; font-size: 0.85rem; text-align: center; margin-top: 0.8rem; }
        .bg-nota { color: #888; font-size: 0.8rem; text-align: center; line-height: 1.5; }
        .bg-resultado { text-align: center; }
        .bg-puntaje { font-size: 1.5rem; font-weight: 800; margin-bottom: 0.3rem; }
        .bg-seccion {
          font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: #777; margin: 1.6rem 0 0.5rem;
        }
        .bg-tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .bg-tabla td { padding: 0.4rem 0.3rem; border-bottom: 1px solid #1e1e1e; }
        .bg-volver { display: block; text-align: center; color: #777; margin-top: 2rem; font-size: 0.85rem; }
      `}</style>

      <div className="bg-caja">
        <h1 className="bg-titulo">Bit Golf</h1>
        <p className="bg-sub">
          {meta ? `Hoyo #${meta.puzzle}` : 'Cargando…'} · llegá al objetivo en los menos golpes
        </p>

        {error && fase === 'cargando' && <p className="bg-error">{error}</p>}

        {fase === 'listo' && (
          <div className="bg-tarjeta" style={{ textAlign: 'center' }}>
            <p className="bg-nota" style={{ marginTop: 0 }}>
              Un byte de salida, uno de llegada y cinco operaciones. El par de hoy
              son <strong style={{ color: '#ffc107' }}>{par} golpes</strong>.
              <br />Probá todo lo que quieras: se entrega una sola vez.
            </p>
            <button className="bg-btn" onClick={empezar} style={{ marginTop: '0.8rem' }}>
              Jugar el hoyo (−{COSTO} de Reserva)
            </button>
          </div>
        )}

        {(fase === 'jugando' || fase === 'resuelto') && meta && (
          <>
            <div className="bg-tarjeta">
              <div className="bg-marcador">
                <span>golpe {jugadas.length} de {topeGolpes}</span>
                <span className="bg-par">par {par}</span>
              </div>

              <div className="bg-byte">
                <span className="bg-etiqueta">vas</span>
                <div className="bg-hex" style={{ color: llego ? '#66bb6a' : '#eee' }}>0x{hex(actual)}</div>
                <div className="bg-bits">
                  {bits(actual).split('').map((b, i) => (
                    <span
                      key={i}
                      className={`bg-bit${b === '1' ? ' uno' : ''}${b !== bits(objetivo)[i] ? ' difiere' : ''}`}
                    >{b}</span>
                  ))}
                </div>
              </div>

              <div className="bg-flecha">↓</div>

              <div className="bg-byte">
                <span className="bg-etiqueta">objetivo</span>
                <div className="bg-hex" style={{ fontSize: '1.8rem', color: '#888' }}>0x{hex(objetivo)}</div>
                <div className="bg-bits">
                  {bits(objetivo).split('').map((b, i) => (
                    <span key={i} className={`bg-bit${b === '1' ? ' uno' : ''}`} style={{ opacity: 0.55 }}>{b}</span>
                  ))}
                </div>
              </div>

              {jugadas.length > 0 && (
                <div className="bg-camino">
                  <span className="bg-paso">0x{hex(meta.hoyo.desde)}</span>
                  {jugadas.map((c, i) => (
                    <span key={i} className="bg-paso">
                      {OPS.find((o) => o.clave === c)?.etiqueta} → 0x{hex(valores[i + 1])}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {fase === 'jugando' && (
              <div className="bg-tarjeta">
                <div className="bg-ops">
                  {OPS.map((o) => (
                    <button
                      key={o.clave}
                      className="bg-op"
                      disabled={jugadas.length >= topeGolpes}
                      onClick={() => golpear(o.clave)}
                    >{o.etiqueta}</button>
                  ))}
                </div>
                <div className="bg-ayuda">
                  {OPS.map((o) => (
                    <div key={o.clave}><strong>{o.etiqueta}</strong> — {o.ayuda}</div>
                  ))}
                </div>

                <div className="bg-fila">
                  <button className="bg-btn secundario" onClick={deshacer} disabled={jugadas.length === 0}>
                    Deshacer
                  </button>
                  <button className="bg-btn secundario" onClick={reiniciar} disabled={jugadas.length === 0}>
                    Empezar de nuevo
                  </button>
                </div>
                <div className="bg-fila">
                  {/* El que no encuentra el camino TIENE que poder entregar. Sin
                      esta salida se queda sin jugar el día y la racha se le corta
                      sin que nada se lo diga; entregando sin llegar puntúa mal,
                      que es distinto de no puntuar. */}
                  <button className={`bg-btn${llego ? '' : ' secundario'}`} onClick={enviar} disabled={jugadas.length === 0}>
                    {llego ? `Entregar con ${jugadas.length} golpes` : 'Me rindo y entrego así'}
                  </button>
                </div>
                {error && <p className="bg-error">{error}</p>}
              </div>
            )}
          </>
        )}

        {fase === 'resuelto' && resultado && (
          <div className="bg-tarjeta bg-resultado">
            <div className="bg-puntaje">
              {!resultado.llego
                ? 'No llegaste'
                : resultado.enPar
                  ? `⛳ En el par — ${resultado.golpes} golpes`
                  : `${resultado.golpes} golpes, ${resultado.sobrePar > 0 ? `+${resultado.sobrePar}` : resultado.sobrePar} del par`}
            </div>
            {resultado.yaJugado && (
              <p className="bg-nota">Ya habías entregado el de hoy. Una entrega por día.</p>
            )}
            <div className="bg-fila">
              <button className="bg-btn secundario" onClick={compartir}>
                {copiado ? '¡Copiado!' : 'Compartir'}
              </button>
            </div>
            {!puedeRankear && (
              <p className="bg-nota" style={{ marginTop: '0.8rem' }}>
                Para entrar a la tabla hace falta cuenta y handle. Tu entrega igual quedó guardada.
              </p>
            )}
          </div>
        )}

        {board?.daily?.length > 0 && (
          <>
            <div className="bg-seccion">Tarjeta de hoy</div>
            <table className="bg-tabla">
              <tbody>
                {board.daily.slice(0, 10).map((e) => (
                  <tr key={e.playerId}>
                    <td style={{ color: '#777', width: '2.5rem' }}>#{e.rank}</td>
                    <td>{e.playerName}</td>
                    <td>{e.solved ? '⛳ en el par' : `${e.attempts} golpes`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {board?.history?.length > 0 && (
          <>
            <div className="bg-seccion">Los que más veces embocaron el par</div>
            <table className="bg-tabla">
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

        <Link href="/menu" className="bg-volver">← Volver al Menú Principal</Link>
      </div>
    </div>
  );
}
