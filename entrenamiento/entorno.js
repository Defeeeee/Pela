import {
  Arena, TARGET_POPULATION, sincronizarAgregados, radiusForMass, MIN_SPLIT_MASS,
} from "../multiplayer-server/agarra.js";
import { codificar, aplanarPalas, TAM_OBS } from "./observacion.js";
import { decodificar, mascara, NUM_ACCIONES } from "./acciones.js";

const DT = 1000 / 30;

/** Cada cuántos ticks decide la política. */
export const REPETIR_ACCION = 3; // 10 decisiones por segundo simulado

/**
 * Tope de una vida, en decisiones. A 10 Hz son 600 segundos simulados: 10 min.
 *
 * Fue creciendo con el agente. Con 60s llegar al tope era una salida gratis y
 * segura; con 180s ya casi no morían (11%), así que lo que pasó a limitar el
 * crecimiento fue el propio tope y no los rivales. Con 10 minutos hay tiempo
 * de sobra para farmear hasta una masa desde la cual comerse a otro sea
 * posible, que es la dinámica que todavía no aprendió.
 */
export const MAX_PASOS = 6000;

/**
 * Cuánto de lo construido se pierde al morir, como fracción de √masa.
 * Con 0,5, morir cuesta la mitad del radio alcanzado.
 */
export const PENALIZACION_MUERTE = 0.5;

/**
 * Cuánto vale de más la masa arrebatada a otro jugador, comparada con la misma
 * masa juntada en palas.
 *
 * Sin esto, cazar y juntar pagan idéntico: la recompensa mira la variación de
 * masa y no le importa de dónde vino. Pero cazar exige acercarse a alguien que
 * puede darse vuelta y comerte, y muchas veces dividirse —quedando vulnerable
 * doce segundos—, mientras que una pala es +1 garantizado y sin riesgo. Con la
 * misma paga, la política óptima es juntar, y eso fue exactamente lo que
 * aprendió: 30.000 divisiones y 5 kills por cada dos millones de pasos.
 *
 * Con 2, la masa robada paga el triple que la misma masa en palas (la propia
 * más dos veces el extra), que es lo que compensa el riesgo.
 */
export const BONUS_CAZA = 2;

/** Premio fijo por terminar de comerse a alguien, aparte de su masa. */
export const BONUS_KILL = 2;

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
    // Cada cuántos pasos de decisión se recicla una arena, en promedio.
    //
    // Muy por encima de la duración de una vida (6000) y con variación por
    // arena, a propósito. Cuando valía lo mismo que una vida pasaban dos cosas
    // malas: el reciclado le ganaba siempre al tope de tiempo, así que las
    // vidas nunca terminaban por vencimiento; y como reciclar pone en cero el
    // reloj de todos los agentes de esa arena, volvía a sincronizarlos después
    // de haberlos escalonado, dejando ventanas enteras sin un solo episodio
    // terminado por tiempo.
    //
    // Además hoy hace mucha menos falta: la arena ya jubila sola a los bots que
    // pasan BOT_MAX_MASS, que era el problema que el reciclado venía a tapar.
    reciclarCada = 30000,
    // Fracción de reapariciones que arrancan con masa alta.
    //
    // En cero por decisión: **todos nacen con 20, como un jugador de verdad**.
    // Se probó con 0,25 para que el agente viera el tramo del juego donde
    // existe la división, pero trae dos problemas: entrena sobre una
    // distribución de estados que en producción no existe, y ensucia toda
    // medida de habilidad (una vida que nace con 400 tiene pico >= 400 sin
    // haber hecho nada, lo que ya nos costó un diagnóstico equivocado).
    //
    // Lo que lo justificaba —que muriendo a los 25 nunca se llega al mínimo de
    // división— se cae con vidas de 180s y una recompensa que paga crecer:
    // llegar a 36 son 16 palas. La métrica `fraccionVidasDivisibles` está para
    // comprobar que efectivamente se llega, en vez de suponerlo.
    fraccionGrande = 0,
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
    // Cuánto vive cada arena, sorteado en un rango ancho: si todas duran lo
    // mismo se reciclan en ola y arrastran a todos los agentes juntos.
    this.vidaArena = new Int32Array(arenas);
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
    this.robadaPrevia = new Float32Array(this.nAgentes);
    this.pasos = new Int32Array(this.nAgentes);
    this.picoEpisodio = new Float32Array(this.nAgentes);
    this.masaInicial = new Float32Array(this.nAgentes);

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
      masaRobada: 0,
      // Crecimiento relativo: pico alcanzado dividido masa con la que nació.
      // Es la única de las tres que mide HABILIDAD. `masaPicoMediaEpisodio`
      // no sirve sola porque una vida que nace con 400 por el currículum tiene
      // pico >= 400 sin que el agente haya hecho nada.
      crecimientoSuma: 0,
      // Y aparte, sólo las vidas que nacieron chicas: ahí crecer es todo mérito.
      episodiosChicos: 0,
      picoChicosSuma: 0,
      // Vidas cuyo pico superó el mínimo para dividirse: dice si la mecánica
      // de división está siquiera al alcance de la política.
      episodiosDivisibles: 0,
      reciclajes: 0,
      ticks: 0,
    };

    for (let a = 0; a < arenas; a++) {
      this.vidaArena[a] = Math.floor(reciclarCada * (0.5 + this.rngCurriculo()));
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
      this.masaInicial[i] = this.masaPrevia[i];
      this.killsPrevias[i] = 0;
      // Relojes de vida escalonados. Si todos nacen a la vez, todos cumplen el
      // tope a la vez y las terminaciones llegan en oleadas: hay ventanas con
      // 70 episodios cerrados y otras con 5. Cualquier promedio por episodio
      // calculado sobre esas ventanas chicas es ruido, y además el lote de
      // entrenamiento queda correlacionado.
      this.pasos[i] = Math.floor(this.rngCurriculo() * MAX_PASOS);
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

      // Crecer paga la variación de la RAÍZ de la masa, que es proporcional al
      // radio y mantiene la escala sana entre masa 20 y 20.000.
      let r = Math.sqrt(masa) - Math.sqrt(this.masaPrevia[i]);

      // Cazar: la masa arrebatada a otro jugador ya entró arriba en la
      // variación de masa; acá se le suma su aporte otra vez, multiplicado.
      // Se calcula sobre la raíz para que quede en la misma escala que el
      // resto de la recompensa y no domine cuando las masas son grandes.
      const robada = p ? (p.masaRobada || 0) : this.robadaPrevia[i];
      const robadaPaso = Math.max(0, robada - this.robadaPrevia[i]);
      if (robadaPaso > 0) {
        const antes = Math.max(1, masa - robadaPaso);
        r += BONUS_CAZA * (Math.sqrt(masa) - Math.sqrt(antes));
        this.stats.masaRobada += robadaPaso;
      }
      this.robadaPrevia[i] = robada;

      const kills = p ? (p.kills || 0) : this.killsPrevias[i];
      if (kills > this.killsPrevias[i]) {
        r += BONUS_KILL * (kills - this.killsPrevias[i]);
        this.stats.killsTotales += kills - this.killsPrevias[i];
      }
      this.killsPrevias[i] = kills;

      this.pasos[i]++;
      const porTiempo = this.pasos[i] >= MAX_PASOS;
      const murio = !vivo;

      // Al morir, la recompensa del paso NO es la variación de masa: se
      // reemplaza por un costo proporcional a lo que se había construido.
      //
      // Esto arregla un defecto de fondo, no sólo una constante mal elegida.
      // Con el término denso de crecimiento, el paso de la muerte descuenta
      // toda la masa acumulada (de M a 0 son −√M), así que la suma de una vida
      // entera que termina muerta era `(√M − √m0) − √M = −√m0`: **el mismo
      // número sin importar cuánto haya crecido**. Crecer no pagaba nada si al
      // final te comían, y encima había un −5 fijo arriba, que para una vida
      // típica valía ocho veces todo lo que ganaba creciendo. La política
      // óptima bajo eso era escapar y no tocar a nadie, y fue exactamente lo
      // que aprendió (ver entrenamiento/versiones/no-morir).
      //
      // Con este cambio, una vida que crece de 20 a 400 y muere suma +5,5,
      // mientras que una que se queda en 20 y muere suma −2,2. Crecer conviene
      // aunque termine mal; sobrevivir sigue siendo mejor que morir del mismo
      // tamaño, pero ya no domina todo lo demás.
      if (murio) r = -PENALIZACION_MUERTE * Math.sqrt(this.masaPrevia[i]);

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
        const inicial = Math.max(1, this.masaInicial[i]);
        this.stats.crecimientoSuma += this.picoEpisodio[i] / inicial;
        if (inicial < 30) {
          this.stats.episodiosChicos++;
          this.stats.picoChicosSuma += this.picoEpisodio[i];
        }
        if (this.picoEpisodio[i] >= MIN_SPLIT_MASS) this.stats.episodiosDivisibles++;
        this.stats.pasosSuma += this.pasos[i];
        this.#reiniciarAgente(i);
      }
    }

    // Reciclado escalonado: una arena por vez, para que la dificultad del lote
    // no salte de golpe cuando se renuevan todas juntas.
    if (this.reciclarCada > 0) {
      for (let a = 0; a < this.nArenas; a++) {
        if (++this.edadArena[a] >= this.vidaArena[a]) this.#reciclarArena(a);
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
      // Reciclar la arena corta la vida en curso, así que cuenta como episodio
      // terminado. Antes esas vidas desaparecían de las estadísticas sin más.
      if (this.pasos[i] > 0) {
        this.stats.episodios++;
        this.stats.porTiempo++;
        this.stats.picoEpisodioSuma += this.picoEpisodio[i];
        this.stats.crecimientoSuma += this.picoEpisodio[i] / Math.max(1, this.masaInicial[i]);
        this.stats.episodiosChicos++;
        this.stats.picoChicosSuma += this.picoEpisodio[i];
        if (this.picoEpisodio[i] >= MIN_SPLIT_MASS) this.stats.episodiosDivisibles++;
        this.stats.pasosSuma += this.pasos[i];
      }
      arena.addPlayer(this.ids[i], `A${a}-${k}`, null);
      // Relojes escalonados otra vez: ponerlos en cero volvía a sincronizar a
      // todos y dejaba ventanas enteras sin episodios terminados por tiempo.
      this.pasos[i] = Math.floor(this.rngCurriculo() * MAX_PASOS);
      this.picoEpisodio[i] = 0;
      this.killsPrevias[i] = 0;
      this.robadaPrevia[i] = 0;
    }
    arena.syncBots();
    this.arenas[a] = arena;
    this.edadArena[a] = 0;
    this.vidaArena[a] = Math.floor(this.reciclarCada * (0.5 + this.rngCurriculo()));
    this.stats.reciclajes++;
    for (let k = 0; k < this.porArena; k++) {
      const i = a * this.porArena + k;
      this.masaPrevia[i] = this.#masa(i);
      this.masaInicial[i] = this.masaPrevia[i];
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
    this.masaInicial[i] = this.masaPrevia[i];
    this.killsPrevias[i] = 0;
  }

  /** Vacía y devuelve las estadísticas acumuladas. */
  drenarStats() {
    const s = this.stats;
    this.stats = {
      episodios: 0, muertes: 0, porTiempo: 0, masaFinalSuma: 0,
      masaPico: 0, pasosSuma: 0, killsTotales: 0,
      divisiones: 0, divisionesLegales: 0, picoEpisodioSuma: 0, masaRobada: 0,
      crecimientoSuma: 0, episodiosChicos: 0, picoChicosSuma: 0,
      episodiosDivisibles: 0, reciclajes: 0, ticks: 0,
    };
    return s;
  }
}

export { TAM_OBS, NUM_ACCIONES, TARGET_POPULATION };
