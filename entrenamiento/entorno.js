import { Arena, TARGET_POPULATION, sincronizarAgregados, radiusForMass } from "../multiplayer-server/agarra.js";
import { codificar, aplanarPalas, TAM_OBS } from "./observacion.js";
import { decodificar, mascara, NUM_ACCIONES } from "./acciones.js";

const DT = 1000 / 30;

/** Cada cuántos ticks decide la política. */
export const REPETIR_ACCION = 3; // 10 decisiones por segundo simulado

/** Tope de una vida, en decisiones. A 10 Hz son 60 segundos simulados. */
export const MAX_PASOS = 600;

/** Generador congruencial: barato, reproducible y suficiente para esto. */
export function rngConSemilla(semilla) {
  let x = semilla >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Muchas arenas dentro de un proceso, con varios agentes que aprenden en cada
 * una.
 *
 * Las dos decisiones que hacen la diferencia de rendimiento:
 *
 * 1. **Varias arenas por proceso.** Antes había un proceso de Node por arena y
 *    un ida y vuelta de JSON por tick: el simulador corría al 0,6% de lo que
 *    puede. Acá el proceso avanza todas sus arenas y manda un solo lote
 *    binario, así el costo del transporte se reparte entre cientos de agentes.
 *
 * 2. **Varios agentes que aprenden por arena.** Es gratis: la arena ya simula
 *    12 jugadores, así que controlar 4 en vez de 1 cuadruplica la experiencia
 *    recogida por tick. Y además es self-play, que es lo que hace que el nivel
 *    suba solo.
 *
 * Las arenas son persistentes y no se reinician por episodio: construir una
 * cuesta 600 palas, y una arena que sigue viva es además lo que se parece a
 * producción, donde la partida no termina nunca. Cuando un agente muere,
 * reaparece chiquito y empieza su episodio siguiente.
 */
export class EntornoVectorial {
  constructor({
    arenas = 24,
    agentesPorArena = 4,
    semilla = 1,
    // Cada cuántos pasos de decisión se recicla una arena. Los bots crecen sin
    // parar hasta el techo de 1500 y una arena vieja es una carnicería donde un
    // agente que reaparece con masa 20 no tiene ninguna chance: mide dificultad
    // creciente, no aprendizaje. Reciclarlas mantiene estacionaria la dificultad.
    reciclarCada = 2000,
    // Fracción de reapariciones que arrancan con masa alta. Sin esto el agente
    // muere siempre cerca de 25 y NUNCA ve el mínimo de división (36), así que
    // no puede aprender a dividirse ni aunque quisiera: la mecánica no existe
    // dentro de su experiencia.
    fraccionGrande = 0.25,
    masaGrandeMax = 400,
  } = {}) {
    this.nArenas = arenas;
    this.porArena = agentesPorArena;
    this.reciclarCada = reciclarCada;
    this.fraccionGrande = fraccionGrande;
    this.masaGrandeMax = masaGrandeMax;
    this.semillaBase = semilla;
    this.rngCurriculo = rngConSemilla(semilla * 104729 + 7);
    this.edadArena = new Int32Array(arenas);
    this.nAgentes = arenas * agentesPorArena;

    this.obs = new Float32Array(this.nAgentes * TAM_OBS);
    this.mascaras = new Uint8Array(this.nAgentes * NUM_ACCIONES);
    this.recompensas = new Float32Array(this.nAgentes);
    this.terminados = new Uint8Array(this.nAgentes);
    // Buffer reusado para aplanar las palas de una arena por vez.
    this.palasBuf = new Float32Array(4096);

    this.arenas = [];
    this.ids = [];
    this.masaPrevia = new Float32Array(this.nAgentes);
    this.killsPrevias = new Int32Array(this.nAgentes);
    this.pasos = new Int32Array(this.nAgentes);
    this.picoEpisodio = new Float32Array(this.nAgentes);

    // Estadísticas que el aprendiz reporta al panel.
    this.stats = {
      episodios: 0,
      muertes: 0,
      porTiempo: 0,
      masaFinalSuma: 0,
      masaPico: 0,
      pasosSuma: 0,
      killsTotales: 0,
      divisiones: 0,
      divisionesLegales: 0,
      picoEpisodioSuma: 0,
      reciclajes: 0,
      ticks: 0,
    };

    for (let a = 0; a < arenas; a++) {
      const arena = new Arena({ random: rngConSemilla(semilla * 7919 + a) });
      this.arenas.push(arena);
      for (let k = 0; k < agentesPorArena; k++) {
        const id = `ag_${a}_${k}`;
        // isBot queda en false a propósito: marcarlo como bot hacía que la
        // arena lo reviviera sola a los 2 segundos, así que el episodio no
        // terminaba nunca y la señal de muerte no llegaba jamás al aprendiz.
        arena.addPlayer(id, `A${a}-${k}`, null);
        this.ids.push(id);
      }
      // Completa hasta 12 con bots heurísticos, que son el rival de arranque.
      arena.syncBots();
    }

    for (let i = 0; i < this.nAgentes; i++) {
      this.masaPrevia[i] = this.#masa(i);
      this.killsPrevias[i] = 0;
    }
    this.#observarTodos();
  }

  #jugador(i) {
    return this.arenas[(i / this.porArena) | 0].players.get(this.ids[i]);
  }

  #masa(i) {
    const p = this.#jugador(i);
    if (!p || !p.alive) return 0;
    let m = 0;
    for (const c of p.cells) m += c.mass;
    return m;
  }

  #observarTodos() {
    for (let a = 0; a < this.nArenas; a++) {
      const arena = this.arenas[a];
      const nPalas = aplanarPalas(arena, this.palasBuf);
      for (let k = 0; k < this.porArena; k++) {
        const i = a * this.porArena + k;
        codificar(arena, this.ids[i], this.obs, i * TAM_OBS, this.palasBuf, nPalas);
        mascara(arena, this.ids[i], this.mascaras, i * NUM_ACCIONES);
      }
    }
  }

  /**
   * Avanza un paso de decisión: aplica las acciones y corre REPETIR_ACCION
   * ticks de simulación.
   *
   * La recompensa es la variación de la RAÍZ de la masa, no de la masa. La
   * raíz es proporcional al radio, que es lo que se ve en pantalla, y mantiene
   * la escala sana entre masa 20 y masa 20.000: con masa cruda, un paso al
   * final de la partida valdría mil veces más que uno del principio y el
   * gradiente se lo comería todo.
   */
  paso(acciones) {
    for (let i = 0; i < this.nAgentes; i++) {
      const arena = this.arenas[(i / this.porArena) | 0];
      const p = arena.players.get(this.ids[i]);
      if (!p || !p.alive) continue;

      const { dx, dy, dividir } = decodificar(acciones[i]);
      arena.setInput(this.ids[i], dx, dy);
      if (dividir) {
        const antes = p.cells.length;
        arena.splitPlayer(this.ids[i]);
        this.stats.divisiones++;
        if (p.cells.length > antes) this.stats.divisionesLegales++;
      }
    }

    for (const arena of this.arenas) {
      for (let t = 0; t < REPETIR_ACCION; t++) arena.tick(DT);
    }
    this.stats.ticks += this.nArenas * REPETIR_ACCION;

    for (let i = 0; i < this.nAgentes; i++) {
      const p = this.#jugador(i);
      const masa = this.#masa(i);
      const vivo = Boolean(p && p.alive);

      let r = Math.sqrt(masa) - Math.sqrt(this.masaPrevia[i]);

      const kills = p ? (p.kills || 0) : this.killsPrevias[i];
      if (kills > this.killsPrevias[i]) {
        r += 0.5 * (kills - this.killsPrevias[i]);
        this.stats.killsTotales += kills - this.killsPrevias[i];
      }
      this.killsPrevias[i] = kills;

      this.pasos[i]++;
      const porTiempo = this.pasos[i] >= MAX_PASOS;
      const murio = !vivo;

      if (murio) r -= 5; // termina la vida: cuesta, pero no borra lo crecido

      this.recompensas[i] = r;
      this.terminados[i] = murio || porTiempo ? 1 : 0;
      this.masaPrevia[i] = masa;

      if (masa > this.picoEpisodio[i]) this.picoEpisodio[i] = masa;
      if (masa > this.stats.masaPico) this.stats.masaPico = masa;

      if (this.terminados[i]) {
        this.stats.episodios++;
        if (murio) this.stats.muertes++; else this.stats.porTiempo++;
        this.stats.masaFinalSuma += murio ? 0 : masa;
        this.stats.picoEpisodioSuma += this.picoEpisodio[i];
        this.stats.pasosSuma += this.pasos[i];
        this.#reiniciarAgente(i);
      }
    }

    // Reciclado escalonado: una arena por vez, para que la dificultad del lote
    // no salte de golpe cuando se renuevan todas juntas.
    if (this.reciclarCada > 0) {
      for (let a = 0; a < this.nArenas; a++) {
        if (++this.edadArena[a] >= this.reciclarCada + a * 17) this.#reciclarArena(a);
      }
    }

    this.#observarTodos();
  }

  /** Reemplaza una arena por una nueva, con los mismos agentes adentro. */
  #reciclarArena(a) {
    const arena = new Arena({
      random: rngConSemilla(this.semillaBase * 7919 + a * 131 + this.stats.reciclajes + 1),
    });
    for (let k = 0; k < this.porArena; k++) {
      const i = a * this.porArena + k;
      arena.addPlayer(this.ids[i], `A${a}-${k}`, null);
      this.pasos[i] = 0;
      this.picoEpisodio[i] = 0;
      this.killsPrevias[i] = 0;
    }
    arena.syncBots();
    this.arenas[a] = arena;
    this.edadArena[a] = 0;
    this.stats.reciclajes++;
    for (let k = 0; k < this.porArena; k++) {
      const i = a * this.porArena + k;
      this.masaPrevia[i] = this.#masa(i);
    }
  }

  #reiniciarAgente(i) {
    const arena = this.arenas[(i / this.porArena) | 0];
    arena.respawnPlayer(this.ids[i]);

    const p = this.#jugador(i);
    if (p) {
      p.kills = 0;
      // Una parte de las reapariciones arranca grande. Es currículum de
      // distribución inicial: si todos empiezan en 20 y mueren en 25, el
      // tramo del juego donde existe la división (masa >= 36) queda fuera de
      // la experiencia y la política no puede aprender nada sobre él.
      if (this.rngCurriculo() < this.fraccionGrande) {
        const m = 40 + this.rngCurriculo() * (this.masaGrandeMax - 40);
        p.cells[0].mass = m;
        p.cells[0].radius = radiusForMass(m);
        sincronizarAgregados(p);
      }
    }

    this.pasos[i] = 0;
    this.picoEpisodio[i] = 0;
    this.masaPrevia[i] = this.#masa(i);
    this.killsPrevias[i] = 0;
  }

  /** Vacía y devuelve las estadísticas acumuladas. */
  drenarStats() {
    const s = this.stats;
    this.stats = {
      episodios: 0, muertes: 0, porTiempo: 0, masaFinalSuma: 0,
      masaPico: 0, pasosSuma: 0, killsTotales: 0,
      divisiones: 0, divisionesLegales: 0, picoEpisodioSuma: 0,
      reciclajes: 0, ticks: 0,
    };
    return s;
  }
}

export { TAM_OBS, NUM_ACCIONES, TARGET_POPULATION };
