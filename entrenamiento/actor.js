import fs from "node:fs";
import { EntornoVectorial, REPETIR_ACCION } from "./entorno.js";
import { TAM_OBS } from "./observacion.js";
import { NUM_ACCIONES } from "./acciones.js";

/**
 * Un worker de simulación. Lo lanza el aprendiz de Python, uno por core.
 *
 * El protocolo es binario y de tamaño fijo, no JSON por línea. Es la
 * diferencia entre 1.267 transiciones por segundo en toda la máquina y ~38.000
 * por core: con JSON, parsear y serializar costaba más que simular el juego.
 *
 * Ciclo, una vez por paso de decisión:
 *   Python -> actor:  nAgentes * int32   (una acción por agente)
 *   actor  -> Python:  observaciones (float32) + recompensas (float32)
 *                      + terminados (uint8) + máscaras (uint8) + stats (float32)
 *
 * Se usan fs.readSync/writeSync sobre los descriptores 0 y 1 en vez de los
 * streams de Node: los streams bufferean y aplican contrapresión asincrónica,
 * y acá lo que se quiere es justamente bloquear hasta tener el lote completo.
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

const arenas = Number(args.arenas || 24);
const porArena = Number(args.agentes || 4);
const semilla = Number(args.semilla || 1);
const rutaEspectador = args.espectador || null;
const cadaMsEspectador = Number(args.espectadorMs || 400);

const env = new EntornoVectorial({ arenas, agentesPorArena: porArena, semilla });
const N = env.nAgentes;

const N_STATS = 16;
const bytesAcciones = N * 4;
const bytesSalida = N * TAM_OBS * 4 + N * 4 + N + N * NUM_ACCIONES + N_STATS * 4;

const bufAcciones = Buffer.allocUnsafe(bytesAcciones);
const acciones = new Int32Array(bufAcciones.buffer, bufAcciones.byteOffset, N);

const bufSalida = Buffer.allocUnsafe(bytesSalida);
let off = 0;
const salObs = new Float32Array(bufSalida.buffer, bufSalida.byteOffset + off, N * TAM_OBS); off += N * TAM_OBS * 4;
const salRec = new Float32Array(bufSalida.buffer, bufSalida.byteOffset + off, N);          off += N * 4;
const salFin = new Uint8Array(bufSalida.buffer, bufSalida.byteOffset + off, N);            off += N;
const salMsc = new Uint8Array(bufSalida.buffer, bufSalida.byteOffset + off, N * NUM_ACCIONES); off += N * NUM_ACCIONES;
const salSta = new Float32Array(bufSalida.buffer, bufSalida.byteOffset + off, N_STATS);

/** Lee exactamente `n` bytes de stdin, reintentando ante lecturas parciales. */
function leerExacto(buf, n) {
  let leido = 0;
  while (leido < n) {
    let r;
    try {
      r = fs.readSync(0, buf, leido, n - leido, null);
    } catch (e) {
      if (e.code === "EAGAIN") continue;   // pipe sin datos todavía
      if (e.code === "EOF") return false;
      throw e;
    }
    if (r === 0) return false;             // el aprendiz cerró: se termina
    leido += r;
  }
  return true;
}

function escribirExacto(buf) {
  let escrito = 0;
  while (escrito < buf.length) {
    try {
      escrito += fs.writeSync(1, buf, escrito, buf.length - escrito);
    } catch (e) {
      if (e.code === "EAGAIN") continue;
      throw e;
    }
  }
}

function empaquetar() {
  salObs.set(env.obs);
  salRec.set(env.recompensas);
  salFin.set(env.terminados);
  salMsc.set(env.mascaras);
  const s = env.drenarStats();
  salSta[0] = s.episodios;
  salSta[1] = s.muertes;
  salSta[2] = s.porTiempo;
  salSta[3] = s.masaFinalSuma;
  salSta[4] = s.masaPico;
  salSta[5] = s.pasosSuma;
  salSta[6] = s.killsTotales;
  salSta[7] = s.divisiones;
  salSta[8] = s.divisionesLegales;
  salSta[9] = s.picoEpisodioSuma;
  salSta[10] = s.crecimientoSuma;
  salSta[11] = s.episodiosChicos;
  salSta[12] = s.picoChicosSuma;
  salSta[13] = s.episodiosDivisibles;
  salSta[14] = s.reciclajes;
  salSta[15] = s.ticks;
}

/**
 * Vuelca el estado de la arena donde está el agente más grande de este worker.
 *
 * Sólo una arena y sólo cada 400 ms de reloj: a 600x tiempo real, volcar todo
 * sería escribir cientos de megabytes por segundo para mirar una ventanita.
 * El panel junta lo que escribió cada worker y muestra el mejor de todos.
 */
let proximoVolcado = 0;
function volcarEspectador() {
  if (!rutaEspectador) return;
  const ahora = Date.now();
  if (ahora < proximoVolcado) return;
  proximoVolcado = ahora + cadaMsEspectador;

  let mejorMasa = -1;
  let mejorArena = -1;
  let mejorId = null;
  for (let i = 0; i < env.nAgentes; i++) {
    const a = (i / env.porArena) | 0;
    const p = env.arenas[a].players.get(env.ids[i]);
    if (!p || !p.alive) continue;
    if (p.mass > mejorMasa) { mejorMasa = p.mass; mejorArena = a; mejorId = env.ids[i]; }
  }
  if (mejorArena < 0) return;

  const arena = env.arenas[mejorArena];
  const estado = {
    ts: ahora,
    mejorMasa: Math.round(mejorMasa),
    estrella: mejorId,
    mundo: [4000, 4000],
    jugadores: [...arena.players.values()].filter((p) => p.alive).map((p) => ({
      id: p.id,
      nombre: p.name,
      color: p.color,
      esAgente: !p.isBot,
      esEstrella: p.id === mejorId,
      masa: Math.round(p.mass),
      celulas: p.cells.map((c) => [Math.round(c.x), Math.round(c.y), Math.round(c.radius)]),
    })),
    palas: [...arena.palas.values()].map((p) => [p.x, p.y]),
  };

  // Escritura atómica: el panel puede estar leyendo justo ahora, y un JSON a
  // medio escribir le rompe el parseo.
  const tmp = `${rutaEspectador}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(estado));
    fs.renameSync(tmp, rutaEspectador);
  } catch (e) { /* si falla, se reintenta en el próximo volcado */ }
}

// Cabecera: el aprendiz la usa para dimensionar sus buffers sin suponer nada.
const cab = Buffer.alloc(20);
cab.writeInt32LE(0x50454c41, 0); // "PELA"
cab.writeInt32LE(N, 4);
cab.writeInt32LE(TAM_OBS, 8);
cab.writeInt32LE(NUM_ACCIONES, 12);
cab.writeInt32LE(REPETIR_ACCION, 16);
escribirExacto(cab);

// Primer estado, antes de recibir ninguna acción.
empaquetar();
escribirExacto(bufSalida);

while (leerExacto(bufAcciones, bytesAcciones)) {
  env.paso(acciones);
  volcarEspectador();
  empaquetar();
  escribirExacto(bufSalida);
}
