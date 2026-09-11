import { Room, TICK_MS, CORRAL_X, CORRAL_Y, CORRAL_W, CORRAL_H, REVIVE_TIME_MS } from "../multiplayer-server/rooms.js";
import { codificar, TAM_OBS } from "../multiplayer-server/observacion-escape.js";
import { decodificar, mascara, NUM_ACCIONES } from "../multiplayer-server/acciones-escape.js";
import { espejarObs, espejarMascara, desespejarAccion, espejoAlAzar, ESPEJOS } from "../multiplayer-server/simetria-escape.js";

/**
 * Entorno vectorizado para entrenar a los bots de escapecv.
 *
 * Muchas salas en el mismo proceso, avanzando en lockstep, para que el aprendiz
 * reciba un lote grande por paso de decisión en vez de una transición por vez.
 *
 * Tres decisiones que vienen de lecciones del Agarrá y no de la teoría:
 *
 *  1. Los relojes de las salas arrancan DESFASADOS. Si todas empiezan en cero,
 *     terminan juntas, se reinician juntas y la ventana de métricas se vacía de
 *     golpe: en el Agarrá eso hizo que la mortalidad leyera 1.000 sobre catorce
 *     episodios y pareciera un colapso.
 *
 *  2. Una fracción de las salas arranca con el reloj YA AVANZADO. La dificultad
 *     de este juego crece con el tiempo —los enemigos aceleran, entran más
 *     seguido y son más grandes— así que una política mala muere a los treinta
 *     segundos y nunca ve el juego tardío. Sin esto no puede aprender lo que
 *     nunca visita.
 *
 *  3. Los modos se mezclan entre salas. Una sola política juega los tres, y el
 *     modo entra en la observación como canal propio.
 *
 *  4. Cada sala tiene un ESPEJO fijo, sorteado al nacer entre los cuatro que la
 *     simetría del corral admite. La observación se codifica en ese marco y la
 *     acción se desespeja antes de aplicarla.
 *
 *     Sin esto, la política gasta capacidad en elegir arbitrariamente una de
 *     cuatro versiones equivalentes de la misma estrategia: medido en el paso
 *     ~2000, terminaba apretada contra la pared IZQUIERDA el 70% del tiempo y
 *     contra la derecha el 0,0%, cuando la política espejada sería
 *     idénticamente buena.
 *
 *     Va acá y no en el aprendiz a propósito: así la acción fue realmente
 *     muestreada de la red con esa observación, y el `log_prob` que PPO usa
 *     para el cociente de importancia es exacto sin ninguna corrección.
 *     Aumentar el lote del lado del aprendiz habría requerido recalcularlo,
 *     porque el `log_prob` viejo de una muestra sintética no es el de la
 *     original salvo que la política ya sea simétrica — que es justo lo que no
 *     es. El espejo es fijo por sala y no por paso: si cambiara a mitad de un
 *     episodio, el mundo se daría vuelta bajo los pies del agente.
 */

export const REPETIR_ACCION = 3; // 10 decisiones por segundo simulado
export const MAX_PASOS = 6000; // 10 minutos simulados, tope de seguridad

// Recompensa. La supervivencia es el objetivo, así que ya es densa: cada paso
// vivo paga. No hace falta ningún término de forma, y en el Agarrá cada intento
// de moldear la recompensa produjo una política degenerada.
const POR_PASO_VIVO = 0.1; // 1 por segundo simulado
const PENALIZACION_MUERTE = 5; // vale cinco segundos de vida
const BONUS_REANIMAR = 3;

// Umbral para contar un paso como "contra la pared". Es la trampa clásica del
// juego: el borde se siente seguro porque de un lado no viene nada, y en
// realidad te deja sin salida cuando llega algo de frente.
const MARGEN_PARED = 60;

const MODOS = ["coop", "coop", "battle"]; // dos de cada tres salas en coop

function rngSemilla(s) {
  let x = s >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class EntornoVectorial {
  constructor({
    salas = 24,
    agentesPorSala = 4,
    semilla = 1,
    maxPasos = MAX_PASOS,
    // Fracción de salas que arrancan con el reloj adelantado, para que el
    // juego tardío exista desde el primer paso de entrenamiento.
    fraccionAvanzada = 0.35,
    avanceMaxMs = 150000,
    // Cuando está en un solo modo, sirve para evaluar por separado.
    modoFijo = null,
    // Se puede apagar para medir sin espejos, o para reproducir una corrida
    // vieja. En entrenamiento va siempre encendida.
    simetria = true,
  } = {}) {
    this.nSalas = salas;
    this.porSala = agentesPorSala;
    this.nAgentes = salas * agentesPorSala;
    this.maxPasos = maxPasos;
    this.fraccionAvanzada = fraccionAvanzada;
    this.avanceMaxMs = avanceMaxMs;
    this.modoFijo = modoFijo;
    this.simetria = simetria;

    this.rng = rngSemilla(semilla);
    this.rngCurriculo = rngSemilla(semilla ^ 0x9e3779b9);
    // Generador propio para el espejo. Compartir el del curriculum correlaciona
    // las dos decisiones —el generador es un LCG simple— y en tandas chicas el
    // reparto entre los cuatro espejos sale desbalanceado. El test de cableado
    // lo detectó al quedar 91/57 donde esperaba mitad y mitad.
    this.rngEspejo = rngSemilla(semilla ^ 0x85ebca6b);

    this.salas = [];
    this.ids = new Array(this.nAgentes);

    // Buffers planos, reusados en cada paso: el actor los copia tal cual al
    // buffer binario, sin allocar nada por transición.
    this.obs = new Float32Array(this.nAgentes * TAM_OBS);
    this.recompensas = new Float32Array(this.nAgentes);
    this.terminados = new Uint8Array(this.nAgentes);
    this.mascaras = new Uint8Array(this.nAgentes * NUM_ACCIONES);

    this.pasos = new Int32Array(this.nSalas);
    // Reloj con el que arrancó cada sala. La supervivencia se mide DESDE acá y
    // no desde cero: el curriculum adelanta el reloj, y `survivedMs` sale de
    // él, así que una sala que empieza en el segundo 100 y pierde al jugador
    // cinco segundos después reportaría 105 de supervivencia. Es la quinta
    // métrica de este proyecto que se habría inflado por el denominador —o en
    // este caso, por el origen— equivocado.
    this.tiempoInicial = new Float64Array(this.nSalas);
    this.espejos = new Array(this.nSalas);
    this.vivoPrevio = new Uint8Array(this.nAgentes);
    this.reanimPrevias = new Int32Array(this.nAgentes);

    this.stats = this.#statsVacias();

    for (let a = 0; a < this.nSalas; a++) this.#crearSala(a, true);
    this.#observarTodos();
  }

  #statsVacias() {
    return {
      episodios: 0,
      // Supervivencia: la métrica central de este juego, en milisegundos
      // simulados. No hay masa que medir.
      supervivenciaSuma: 0,
      supervivenciaMax: 0,
      muertes: 0,
      porTope: 0,
      // Coop
      reanimacionesHechas: 0,
      reanimacionesRecibidas: 0,
      // Battle: cuántos rivales cayeron antes que yo. Es la medida de "ganar",
      // no de "durar": en battle la ronda corta cuando queda uno.
      rivalesSobrevividosSuma: 0,
      episodiosBattle: 0,
      episodiosCoop: 0,
      supervivenciaCoopSuma: 0,
      supervivenciaBattleSuma: 0,
      // Calidad del juego, no sólo resultado
      pasosVivos: 0,
      pasosEnPeligro: 0, // con un choque marcado dentro del horizonte
      pasosEnPared: 0,
      pasosQuieto: 0,
      esquivesAlLimite: 0, // pasó a menos de 12 px sin tocar
      enemigosVistosSuma: 0,
      ticks: 0,
      reinicios: 0,
    };
  }

  #crearSala(a, inicial = false) {
    const modo = this.modoFijo || MODOS[Math.floor(this.rng() * MODOS.length)];
    const sala = new Room(`S${a}`, { isPublic: false, mode: modo, random: rngSemilla((this.rng() * 2 ** 32) | 0) });

    for (let i = 0; i < this.porSala; i++) sala.addPlayer(`a${i}`, `A${i}`);
    sala.beginPlaying();

    // Desfase y curriculum. `tiempo` es lo que gobierna toda la dificultad, así
    // que adelantarlo es exactamente "empezar más adelante en la partida".
    let avance = 0;
    if (inicial) {
      // Al arrancar, desparramar los relojes por todo el rango evita que las
      // primeras partidas terminen todas juntas.
      avance = this.rngCurriculo() * this.avanceMaxMs;
    } else if (this.rngCurriculo() < this.fraccionAvanzada) {
      avance = this.rngCurriculo() * this.avanceMaxMs;
    }
    if (avance > 0) {
      sala.tiempo = avance;
      sala.lastEnemyTime = avance;
      // La tasa de aparición decae con cada oleada; se reconstruye el decaimiento
      // que habría acumulado, si no la sala parecería tardía pero con oleadas de
      // principiante.
      const oleadas = Math.floor(avance / 1200);
      sala.enemySpawnRate = Math.max(700, 1600 - oleadas * 40);
    }

    this.salas[a] = sala;
    this.pasos[a] = 0;
    this.tiempoInicial[a] = sala.tiempo;
    this.espejos[a] = this.simetria ? espejoAlAzar(this.rngEspejo()) : ESPEJOS[0];

    for (let i = 0; i < this.porSala; i++) {
      const g = a * this.porSala + i;
      this.ids[g] = `a${i}`;
      this.vivoPrevio[g] = 1;
      this.reanimPrevias[g] = 0;
    }
  }

  #jugador(g) {
    const a = (g / this.porSala) | 0;
    return this.salas[a].players.get(this.ids[g]);
  }

  #observarTodos() {
    for (let g = 0; g < this.nAgentes; g++) {
      const a = (g / this.porSala) | 0;
      codificar(this.salas[a], this.ids[g], this.obs, g * TAM_OBS);
      mascara(this.salas[a], this.ids[g], this.mascaras, g * NUM_ACCIONES);
      const e = this.espejos[a];
      if (e.sx !== 1 || e.sy !== 1) {
        espejarObs(this.obs, g * TAM_OBS, e);
        espejarMascara(this.mascaras, g * NUM_ACCIONES, e);
      }
    }
  }

  /** Avanza un paso de decisión: aplica acciones y corre REPETIR_ACCION ticks. */
  paso(acciones) {
    this.recompensas.fill(0);
    this.terminados.fill(0);

    // 1. Aplicar acciones. Un muerto no se mueve, pero su acción se ignora sin
    //    ruido: en coop puede volver, y su observación sigue siendo útil.
    for (let g = 0; g < this.nAgentes; g++) {
      const a = (g / this.porSala) | 0;
      const p = this.salas[a].players.get(this.ids[g]);
      if (!p || !p.alive) continue;
      // La red eligió en el marco espejado de su sala; al servidor va el rumbo
      // del mundo. "Quieto" es punto fijo de los cuatro espejos, así que la
      // estadística de quietud sigue siendo correcta sin traducir.
      const enMundo = desespejarAccion(acciones[g], this.espejos[a]);
      const { dx, dy } = decodificar(enMundo);
      this.salas[a].setInput(this.ids[g], dx, dy);
      if (acciones[g] === 0) this.stats.pasosQuieto++;
    }

    // 2. Simular.
    const termino = new Uint8Array(this.nSalas);
    for (let a = 0; a < this.nSalas; a++) {
      const sala = this.salas[a];
      for (let t = 0; t < REPETIR_ACCION; t++) {
        if (sala.tick(TICK_MS)) { termino[a] = 1; break; }
      }
      this.pasos[a]++;
      if (this.pasos[a] >= this.maxPasos) termino[a] = 2; // corte por tope
    }
    this.stats.ticks += this.nSalas * REPETIR_ACCION;

    // 3. Recompensa y estadística por agente.
    for (let g = 0; g < this.nAgentes; g++) {
      const a = (g / this.porSala) | 0;
      const sala = this.salas[a];
      const p = sala.players.get(this.ids[g]);
      if (!p) continue;

      const vivo = p.alive ? 1 : 0;
      const murioAhora = this.vivoPrevio[g] === 1 && vivo === 0;
      const revivioAhora = this.vivoPrevio[g] === 0 && vivo === 1;

      let r = 0;
      if (vivo) {
        r += POR_PASO_VIVO * REPETIR_ACCION / 3; // normalizado a 0.1 por decisión
        this.stats.pasosVivos++;
      }
      if (murioAhora) {
        r -= PENALIZACION_MUERTE;
        this.stats.muertes++;
      }
      if (revivioAhora) this.stats.reanimacionesRecibidas++;

      // Reanimar paga, pero poco y sólo al completarla. Tres segundos parado
      // encima de un cadáver son tres segundos sin esquivar: el riesgo ya es la
      // mitad del precio. Un bonus grande, o uno por progreso, invitaría a
      // dejar morir a un compañero para cobrarlo de nuevo — el mismo agujero
      // que en el Agarrá produjo al campeador de esquina.
      if (sala.mode === "coop" && p.alive) {
        let hechas = 0;
        for (const otro of sala.players.values()) {
          if (otro.id === p.id || otro.alive) continue;
          const d = Math.hypot(otro.x - p.x, otro.y - p.y);
          if (d <= 48 && (otro.reviveProgressMs || 0) >= REVIVE_TIME_MS - TICK_MS * REPETIR_ACCION) hechas++;
        }
        if (hechas > 0) {
          r += BONUS_REANIMAR * hechas;
          this.stats.reanimacionesHechas += hechas;
        }
      }

      if (p.alive) {
        // Calidad: dónde y cómo está jugando, no sólo si sigue vivo.
        const enPared =
          p.x - CORRAL_X < MARGEN_PARED ||
          CORRAL_X + CORRAL_W - p.x < MARGEN_PARED ||
          p.y - CORRAL_Y < MARGEN_PARED ||
          CORRAL_Y + CORRAL_H - p.y < MARGEN_PARED;
        if (enPared) this.stats.pasosEnPared++;

        let peligro = false;
        let minDist = Infinity;
        for (const e of sala.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y) - (p.size / 2 + e.size * 0.35);
          if (d < minDist) minDist = d;
          if (d < 0) continue;
          // Choque proyectado: va hacia él y lo alcanza.
          const rx = e.x - p.x, ry = e.y - p.y;
          const v2 = e.vx * e.vx + e.vy * e.vy;
          if (v2 < 1e-9) continue;
          let tt = -(rx * e.vx + ry * e.vy) / v2;
          if (tt < 0) continue;
          if (tt > 120) continue;
          const px = rx + e.vx * tt, py = ry + e.vy * tt;
          if (Math.hypot(px, py) <= p.size / 2 + e.size * 0.35) { peligro = true; break; }
        }
        if (peligro) this.stats.pasosEnPeligro++;
        if (minDist >= 0 && minDist < 12) this.stats.esquivesAlLimite++;
      }

      this.stats.enemigosVistosSuma += sala.enemies.length;
      this.vivoPrevio[g] = vivo;

      // Terminal. En battle morir es el final: no se vuelve, y quedarse de
      // espectador sólo aporta pasos sin señal. En coop NO es terminal, porque
      // un compañero puede levantarte y ese es el corazón del modo — si morir
      // cortara el episodio, ser reanimado no valdría nada para el reanimado.
      if (murioAhora && sala.mode === "battle") this.terminados[g] = 1;
      if (termino[a]) this.terminados[g] = 1;

      this.recompensas[g] = r;
    }

    // 4. Cierre de episodios y reinicio de salas.
    for (let a = 0; a < this.nSalas; a++) {
      if (!termino[a]) continue;
      const sala = this.salas[a];

      for (let i = 0; i < this.porSala; i++) {
        const p = sala.players.get(`a${i}`);
        if (!p) continue;
        // Descontar el arranque adelantado: lo que se mide es cuánto duró el
        // agente, no en qué minuto de la partida cayó.
        const sup = Math.max(0, (p.survivedMs || sala.tiempo) - this.tiempoInicial[a]);

        this.stats.episodios++;
        this.stats.supervivenciaSuma += sup;
        if (sup > this.stats.supervivenciaMax) this.stats.supervivenciaMax = sup;
        if (termino[a] === 2) this.stats.porTope++;

        if (sala.mode === "coop") {
          this.stats.episodiosCoop++;
          this.stats.supervivenciaCoopSuma += sup;
        } else {
          this.stats.episodiosBattle++;
          this.stats.supervivenciaBattleSuma += sup;
          let rivalesCaidos = 0;
          for (const otro of sala.players.values()) {
            if (otro.id === p.id) continue;
            if ((otro.survivedMs || 0) < sup) rivalesCaidos++;
          }
          this.stats.rivalesSobrevividosSuma += rivalesCaidos;
        }
      }

      this.stats.reinicios++;
      this.#crearSala(a);
    }

    this.#observarTodos();
    return this;
  }

  /** Devuelve las stats acumuladas y las reinicia. */
  drenarStats() {
    const s = this.stats;
    this.stats = this.#statsVacias();
    return s;
  }
}
