import fs from "node:fs";
import { EntornoVectorial, REPETIR_ACCION } from "./entorno.js";
import { TAM_OBS } from "../multiplayer-server/observacion-escape.js";
import { NUM_ACCIONES } from "../multiplayer-server/acciones-escape.js";

/**
 * Un worker de simulación de escapecv. Lo lanza el aprendiz de Python.
 *
 * Mismo protocolo binario de tamaño fijo que el del Agarrá, por la misma razón:
 * con JSON por línea, serializar y parsear cuesta más que simular el juego. Y
 * acá pesa todavía más, porque este entorno da 460.000 transiciones por segundo
 * por core contra las 35.000 del Agarrá — cualquier sobrecosto por transición se
 * multiplica por trece.
 *
 * Ciclo, una vez por paso de decisión:
 *   Python -> actor:  nAgentes * int32   (una acción por agente)
 *   actor  -> Python:  observaciones (float32) + recompensas (float32)
 *                      + terminados (uint8) + máscaras (uint8) + stats (float32)
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

const salas = Number(args.salas || 24);
const porSala = Number(args.agentes || 4);
const semilla = Number(args.semilla || 1);
const rutaEspectador = args.espectador || null;
const cadaMsEspectador = Number(args.espectadorMs || 400);

const env = new EntornoVectorial({
  salas,
  agentesPorSala: porSala,
  semilla,
  ...(args.maxPasos ? { maxPasos: Number(args.maxPasos) } : {}),
  ...(args.modo ? { modoFijo: String(args.modo) } : {}),
  ...(args.fraccionAvanzada !== undefined ? { fraccionAvanzada: Number(args.fraccionAvanzada) } : {}),
});
const N = env.nAgentes;

const N_STATS = 20;
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
      if (e.code === "EAGAIN") continue;
      if (e.code === "EOF") return false;
      throw e;
    }
    if (r === 0) return false; // el aprendiz cerró: se termina
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
  salSta[1] = s.supervivenciaSuma;
  salSta[2] = s.supervivenciaMax;
  salSta[3] = s.muertes;
  salSta[4] = s.porTope;
  salSta[5] = s.reanimacionesHechas;
  salSta[6] = s.reanimacionesRecibidas;
  salSta[7] = s.rivalesSobrevividosSuma;
  salSta[8] = s.episodiosBattle;
  salSta[9] = s.episodiosCoop;
  salSta[10] = s.supervivenciaCoopSuma;
  salSta[11] = s.supervivenciaBattleSuma;
  salSta[12] = s.pasosVivos;
  salSta[13] = s.pasosEnPeligro;
  salSta[14] = s.pasosEnPared;
  salSta[15] = s.pasosQuieto;
  salSta[16] = s.esquivesAlLimite;
  salSta[17] = s.enemigosVistosSuma;
  salSta[18] = s.ticks;
  salSta[19] = s.reinicios;
}

/**
 * Vuelca el estado de la sala del agente que más está aguantando en este
 * worker, para poder mirarlo jugar desde el panel.
 *
 * Sólo una sala y sólo cada 400 ms de reloj de pared: a diez mil veces el
 * tiempo real, volcar todo serían cientos de megabytes por segundo para mirar
 * una ventanita.
 */
let proximoVolcado = 0;
function volcarEspectador() {
  if (!rutaEspectador) return;
  const ahora = Date.now();
  if (ahora < proximoVolcado) return;
  proximoVolcado = ahora + cadaMsEspectador;

  let mejor = -1;
  let mejorSala = -1;
  for (let g = 0; g < env.nAgentes; g++) {
    const a = (g / env.porSala) | 0;
    const p = env.salas[a].players.get(env.ids[g]);
    if (!p || !p.alive) continue;
    const vivido = env.salas[a].tiempo - env.tiempoInicial[a];
    if (vivido > mejor) { mejor = vivido; mejorSala = a; }
  }
  if (mejorSala < 0) return;

  const sala = env.salas[mejorSala];
  const estado = {
    ts: ahora,
    modo: sala.mode,
    vividoMs: Math.round(mejor),
    tiempoMs: Math.round(sala.tiempo),
    mundo: [1600, 900],
    jugadores: [...sala.players.values()].map((p) => ({
      id: p.id, nombre: p.name, color: p.color,
      x: Math.round(p.x), y: Math.round(p.y), size: p.size,
      vivo: p.alive,
      reanimando: !!p.isBeingRevived,
      progresoReanim: Math.min(1, (p.reviveProgressMs || 0) / 3000),
      inmune: !!(p.immuneUntil && sala.tiempo < p.immuneUntil),
      vividoMs: Math.round(Math.max(0, (p.survivedMs || sala.tiempo) - env.tiempoInicial[mejorSala])),
    })),
    enemigos: sala.enemies.map((e) => [Math.round(e.x), Math.round(e.y), Math.round(e.size), Math.round(e.vx * 10) / 10, Math.round(e.vy * 10) / 10]),
    avisos: sala.warnings.map((w) => [Math.round(w.x), Math.round(w.y), Math.round(w.size), Math.max(0, Math.round(w.spawnAt - sala.tiempo))]),
  };

  // Escritura atómica: el panel puede estar leyendo justo ahora, y un JSON a
  // medio escribir le rompe el parseo.
  const tmp = `${rutaEspectador}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(estado));
    fs.renameSync(tmp, rutaEspectador);
  } catch (e) { /* se reintenta en el próximo volcado */ }
}

// Cabecera: el aprendiz la usa para dimensionar sus buffers sin suponer nada.
const cab = Buffer.alloc(20);
cab.writeInt32LE(0x45534341, 0); // "ESCA"
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
