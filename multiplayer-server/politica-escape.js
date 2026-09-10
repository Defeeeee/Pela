import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codificar, TAM_OBS } from "./observacion-escape.js";
import { decodificar, mascara, NUM_ACCIONES } from "./acciones-escape.js";

/**
 * Inferencia de la política entrenada, para los bots opcionales de escapecv.
 *
 * Es sólo el forward: multiplicación de matrices y ReLU, sin ninguna librería.
 * La red tiene 1,8 millones de parámetros y con ocho bots decidiendo a 10 Hz
 * son ~27 forwards por segundo, que es una fracción chica de un core.
 *
 * Los pesos van en un binario crudo al lado de este archivo, no en JSON: en
 * texto ocuparían cinco veces más y habría que parsearlos en cada arranque.
 *
 * Si el archivo no está, `cargar()` devuelve null y no se ofrecen bots. Nunca puede romper el
 * multijugador por no encontrar un modelo.
 */

const AQUI = path.dirname(fileURLToPath(import.meta.url));

export class PoliticaBots {
  constructor(manifiesto, buffer) {
    this.tamObs = manifiesto.tamObs;
    this.numAcciones = manifiesto.numAcciones;
    this.paso = manifiesto.paso;

    // Cada capa apunta dentro del mismo buffer, sin copiar: pesos y sesgo
    // contiguos, en el orden en que los escribió exportar.py.
    this.capas = manifiesto.capas.map((c) => {
      const pesos = new Float32Array(buffer.buffer, buffer.byteOffset + c.offset, c.entrada * c.salida);
      const sesgo = new Float32Array(
        buffer.buffer,
        buffer.byteOffset + c.offset + c.entrada * c.salida * 4,
        c.salida
      );
      return { entrada: c.entrada, salida: c.salida, pesos, sesgo, buf: new Float32Array(c.salida) };
    });

    this.obs = new Float32Array(TAM_OBS);
    this.msc = new Uint8Array(NUM_ACCIONES);
    this.probs = new Float64Array(NUM_ACCIONES);
  }

  /** Corre el forward y deja los puntajes en el buffer de la última capa. */
  #forward() {
    let x = this.obs;
    const n = this.capas.length;
    for (let c = 0; c < n; c++) {
      const { entrada, salida, pesos, sesgo, buf } = this.capas[c];
      const ultima = c === n - 1;
      for (let o = 0; o < salida; o++) {
        let s = sesgo[o];
        const base = o * entrada;
        for (let i = 0; i < entrada; i++) s += pesos[base + i] * x[i];
        buf[o] = ultima ? s : s > 0 ? s : 0; // ReLU salvo en la salida
      }
      x = buf;
    }
    return x;
  }

  /**
   * Elige una acción muestreando de la distribución, no tomando el máximo.
   *
   * Puede sonar raro en producción —el máximo es "lo que la red cree mejor"—
   * pero la política se entrenó muestreando y su estocasticidad es parte de su
   * juego: congelarla en su acción favorita la vuelve predecible y la hace
   * quedarse trabada. En el Agarrá esto se midió y muestrear ganaba 69 a 55;
   * acá se arranca con el mismo criterio y queda por medir en su propio duelo.
   */
  #elegirAccion() {
    const logits = this.#forward();

    let max = -Infinity;
    for (let a = 0; a < this.numAcciones; a++) {
      if (this.msc[a] && logits[a] > max) max = logits[a];
    }

    let suma = 0;
    for (let a = 0; a < this.numAcciones; a++) {
      this.probs[a] = this.msc[a] ? Math.exp(logits[a] - max) : 0;
      suma += this.probs[a];
    }

    let r = Math.random() * suma;
    for (let a = 0; a < this.numAcciones; a++) {
      r -= this.probs[a];
      if (r <= 0 && this.msc[a]) return a;
    }
    return 0;
  }

  /**
   * Decide y aplica la acción de un bot dentro de la arena.
   * Devuelve true si se dividió, para que el llamador lo sepa.
   */
  jugar(sala, id) {
    codificar(sala, id, this.obs, 0);
    mascara(sala, id, this.msc, 0);

    const { dx, dy } = decodificar(this.#elegirAccion());
    sala.setInput(id, dx, dy);
  }
}

/**
 * Carga la política si están sus archivos. Devuelve null si no, y en ese caso
 * la arena sigue con la heurística: un modelo que falta no puede romper nada.
 */
export function cargarPolitica(base = path.join(AQUI, "pesos-escape")) {
  try {
    const manifiesto = JSON.parse(fs.readFileSync(`${base}.json`, "utf-8"));
    const buffer = fs.readFileSync(`${base}.bin`);

    if (manifiesto.tamObs !== TAM_OBS || manifiesto.numAcciones !== NUM_ACCIONES) {
      console.error(
        `[politica] el modelo espera obs=${manifiesto.tamObs} acciones=${manifiesto.numAcciones} ` +
        `y el código produce obs=${TAM_OBS} acciones=${NUM_ACCIONES}. Se ignora.`
      );
      return null;
    }

    const p = new PoliticaBots(manifiesto, buffer);
    console.log(
      `[politica] cargada: ${manifiesto.parametros.toLocaleString("es")} parámetros, ` +
      `entrenada hasta el paso ${manifiesto.paso}`
    );
    return p;
  } catch (e) {
    if (e.code !== "ENOENT") console.error("[politica] no se pudo cargar:", e.message);
    return null;
  }
}

/**
 * Carga varias versiones de la red para que convivan en la misma arena.
 *
 * Cada `variante` es `{ etiqueta, archivo }`: la etiqueta se le cuelga al
 * nombre del bot para poder distinguirlas mirando la tabla, que es el punto de
 * tenerlas juntas. Las que falten se saltean en silencio, así que borrar un
 * archivo de pesos degrada a una sola red —o a la heurística si no queda
 * ninguna— en vez de romper el multijugador.
 */
export function cargarPoliticas(variantes) {
  const cargadas = [];
  for (const v of variantes) {
    const red = cargarPolitica(path.join(AQUI, v.archivo));
    if (red) cargadas.push({ etiqueta: v.etiqueta, red });
  }

  if (cargadas.length) {
    console.log(`[politica] en juego: ${cargadas.map((c) => `${c.etiqueta} paso ${c.red.paso}`).join(" | ")}`);
  }
  return cargadas;
}
