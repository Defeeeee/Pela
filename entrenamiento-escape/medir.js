import { EntornoVectorial, REPETIR_ACCION } from "./entorno.js";
import { NUM_ACCIONES } from "../multiplayer-server/acciones-escape.js";
import { TAM_OBS } from "../multiplayer-server/observacion-escape.js";

/**
 * Mide el techo del entorno con una política al azar y deja la línea de base.
 *
 * Sirve para dos cosas. Una, saber cuántas transiciones por segundo da un core,
 * que es lo que dimensiona todo el entrenamiento. Dos, y más importante, dejar
 * el número que el aprendizaje tiene que superar: si después de entrenar el
 * agente no sobrevive claramente más que esto, algo está mal y conviene
 * averiguar qué antes de seguir gastando GPU.
 */
const salas = Number(process.argv[2] || 24);
const porSala = Number(process.argv[3] || 4);
const segundos = Number(process.argv[4] || 10);
const modo = process.argv[5] || null;

const env = new EntornoVectorial({
  salas,
  agentesPorSala: porSala,
  semilla: 42,
  ...(modo ? { modoFijo: modo } : {}),
});
const acciones = new Int32Array(env.nAgentes);

function alAzar() {
  for (let i = 0; i < env.nAgentes; i++) acciones[i] = Math.floor(Math.random() * NUM_ACCIONES);
}

/**
 * Heurística de referencia: correr en dirección contraria a la amenaza más
 * inminente. Es lo que haría un jugador novato mirando la pantalla, y da una
 * segunda vara mucho más exigente que el azar.
 */
function heuristica() {
  for (let g = 0; g < env.nAgentes; g++) {
    const base = g * TAM_OBS;
    // Canal 12 en adelante es el enemigo más amenazante: rx, ry, vx, vy, ...
    const rx = env.obs[base + 12];
    const ry = env.obs[base + 13];
    const choca = env.obs[base + 12 + 7];

    if (!choca) { acciones[g] = 0; continue; } // nada encima: quedarse quieto

    // Huir perpendicular a la línea del enemigo cuesta menos distancia que huir
    // de frente, que es lo que hace un novato y por eso pierde.
    const ang = Math.atan2(-ry, -rx);
    const idx = 1 + (Math.round((ang / (Math.PI * 2)) * 16) + 16) % 16;
    acciones[g] = idx;
  }
}

console.log(`entorno: ${salas} salas x ${porSala} agentes = ${env.nAgentes} agentes${modo ? ` (modo ${modo})` : " (modos mezclados)"}`);
console.log(`observación: ${TAM_OBS} números | acciones: ${NUM_ACCIONES} | repetición: ${REPETIR_ACCION} ticks\n`);

for (const [nombre, politica] of [["al azar", alAzar], ["heurística", heuristica]]) {
  for (let i = 0; i < 200; i++) { politica(); env.paso(acciones); }
  env.drenarStats();

  const t0 = process.hrtime.bigint();
  let pasos = 0;
  while (Number(process.hrtime.bigint() - t0) / 1e9 < segundos) {
    politica();
    env.paso(acciones);
    pasos++;
  }
  const s = Number(process.hrtime.bigint() - t0) / 1e9;
  const st = env.drenarStats();

  const transiciones = pasos * env.nAgentes;
  const eps = Math.max(1, st.episodios);

  console.log(`  === política ${nombre} ===`);
  console.log(`  transiciones:        ${transiciones.toLocaleString("es")}  (${Math.round(transiciones / s).toLocaleString("es")}/s)`);
  console.log(`  ticks de sala:       ${st.ticks.toLocaleString("es")}  (${Math.round(st.ticks / s / 30).toLocaleString("es")}x tiempo real, en un core)`);
  console.log(`  episodios:           ${st.episodios}`);
  console.log(`  SUPERVIVENCIA MEDIA: ${(st.supervivenciaSuma / eps / 1000).toFixed(1)} s      <-- la vara`);
  console.log(`  supervivencia máx:   ${(st.supervivenciaMax / 1000).toFixed(1)} s`);
  if (st.episodiosCoop) console.log(`    coop:              ${(st.supervivenciaCoopSuma / st.episodiosCoop / 1000).toFixed(1)} s  (${st.episodiosCoop} episodios)`);
  if (st.episodiosBattle) {
    console.log(`    battle:            ${(st.supervivenciaBattleSuma / st.episodiosBattle / 1000).toFixed(1)} s  (${st.episodiosBattle} episodios)`);
    console.log(`    rivales sobrevividos: ${(st.rivalesSobrevividosSuma / st.episodiosBattle).toFixed(2)} de ${porSala - 1}`);
  }
  console.log(`  reanimaciones:       ${st.reanimacionesHechas} hechas, ${st.reanimacionesRecibidas} recibidas`);
  const pv = Math.max(1, st.pasosVivos);
  console.log(`  en peligro:          ${(100 * st.pasosEnPeligro / pv).toFixed(1)}% de los pasos vivos`);
  console.log(`  contra la pared:     ${(100 * st.pasosEnPared / pv).toFixed(1)}%`);
  console.log(`  quieto:              ${(100 * st.pasosQuieto / pv).toFixed(1)}%`);
  console.log(`  esquives al límite:  ${st.esquivesAlLimite}`);
  console.log(`  enemigos en pantalla: ${(st.enemigosVistosSuma / (pasos * env.nAgentes)).toFixed(1)} de media\n`);
}
