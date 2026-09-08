import { EntornoVectorial, REPETIR_ACCION } from "./entorno.js";
import { NUM_ACCIONES } from "./acciones.js";
import { TAM_OBS } from "./observacion.js";

/**
 * Mide el techo del entorno con una política al azar y deja una línea de base.
 *
 * Sirve para dos cosas: saber cuántas transiciones por segundo puede generar
 * un core (que es lo que dimensiona todo el entrenamiento), y tener el número
 * que el aprendizaje tiene que superar. Si después de entrenar el agente no le
 * gana a esto, algo está mal.
 */
const arenas = Number(process.argv[2] || 24);
const porArena = Number(process.argv[3] || 4);
const segundos = Number(process.argv[4] || 10);

const env = new EntornoVectorial({ arenas, agentesPorArena: porArena, semilla: 42 });
const acciones = new Int32Array(env.nAgentes);

// Elige al azar entre las acciones LEGALES, respetando la máscara.
function alAzar() {
  for (let i = 0; i < env.nAgentes; i++) {
    const base = i * NUM_ACCIONES;
    let legales = 0;
    for (let a = 0; a < NUM_ACCIONES; a++) legales += env.mascaras[base + a];
    let k = Math.floor(Math.random() * legales);
    for (let a = 0; a < NUM_ACCIONES; a++) {
      if (env.mascaras[base + a] && k-- === 0) { acciones[i] = a; break; }
    }
  }
}

console.log(`entorno: ${arenas} arenas x ${porArena} agentes = ${env.nAgentes} agentes`);
console.log(`observación: ${TAM_OBS} números | acciones: ${NUM_ACCIONES} | repetición: ${REPETIR_ACCION} ticks\n`);

for (let i = 0; i < 200; i++) { alAzar(); env.paso(acciones); } // calentar el JIT
env.drenarStats();

const t0 = process.hrtime.bigint();
let pasos = 0;
while (Number(process.hrtime.bigint() - t0) / 1e9 < segundos) {
  alAzar();
  env.paso(acciones);
  pasos++;
}
const s = Number(process.hrtime.bigint() - t0) / 1e9;
const st = env.drenarStats();

const transiciones = pasos * env.nAgentes;
console.log(`  pasos de decisión:      ${pasos.toLocaleString("es")}  (${Math.round(pasos / s).toLocaleString("es")}/s)`);
console.log(`  transiciones de agente: ${transiciones.toLocaleString("es")}  (${Math.round(transiciones / s).toLocaleString("es")}/s)`);
console.log(`  ticks de arena:         ${st.ticks.toLocaleString("es")}  (${Math.round(st.ticks / s).toLocaleString("es")}/s)`);
console.log(`  = ${Math.round(st.ticks / s / 30)}x tiempo real, en un core\n`);

console.log(`  episodios terminados:   ${st.episodios}  (${st.muertes} por muerte, ${st.porTiempo} por tiempo)`);
console.log(`  duración media:         ${(st.pasosSuma / Math.max(1, st.episodios) / 10).toFixed(1)}s simulados`);
console.log(`  masa pico (al azar):    ${Math.round(st.masaPico)}`);
console.log(`  kills:                  ${st.killsTotales}`);
console.log(`  divisiones intentadas:  ${st.divisiones}  (efectivas: ${st.divisionesLegales})`);

if (st.divisiones > 0 && st.divisionesLegales === 0) {
  console.log("\n  ⚠ ninguna división tuvo efecto: la máscara no está funcionando");
}
