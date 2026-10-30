/**
 * El árbol de pelados — el puzzle diario de contar procesos.
 *
 * Un programa corto en C con `fork()`, condicionales y `exit()`. Cuatro
 * preguntas: cuántos procesos hay en total, cuántas veces se imprime una
 * etiqueta, cuántos son hijos directos del original, y qué profundidad alcanza
 * el árbol. Puntaje de 0 a 4 según cuántas erró, la misma forma de "menos es
 * mejor" que los otros juegos diarios.
 *
 * POR QUÉ ES BUEN PUZZLE: `fork()` es contraintuitivo de una manera que no se
 * arregla leyendo la definición. Tres `fork()` seguidos crean **ocho** procesos
 * y no cuatro, porque cada hijo también ejecuta los `fork()` que siguen. Casi
 * nadie lo acierta la primera vez, y una vez que se entiende no se olvida — la
 * misma propiedad que hace buenas a la pila vacía-descendente y a la diferencia
 * entre CF y OF.
 *
 * LO QUE LO HACE CONSTRUIBLE, igual que en ¿Qué devuelve?: el programa se
 * **genera**, no se analiza. Se arma componiendo sentencias conocidas y se
 * simula con el mismo árbol con el que se generó; el texto en C es una
 * impresión de esa estructura, no su fuente. Por eso la respuesta existe, es
 * única y es exacta.
 *
 * Y ACÁ LA VERIFICACIÓN ES MEJOR QUE EN CUALQUIERA DE LOS OTROS: `fork()` es
 * POSIX, así que el programa generado se compila y se corre **en esta misma
 * máquina**, y el simulador se contrasta contra lo que hace el kernel de verdad.
 * Ver `verificar-fork.js`. No hace falta emular nada: es el sistema operativo
 * real respondiendo.
 *
 * DOS COSAS QUE QUEDAN AFUERA A PROPÓSITO:
 *
 *  1. **El buffer de `printf`.** Es la trampa más famosa del tema —el buffer se
 *     copia con el proceso, así que un `printf` sin `\n` antes de un `fork`
 *     imprime dos veces— pero depende de si la salida es una terminal o un pipe,
 *     y una ambigüedad en un puzzle es un bug. El programa arranca con
 *     `setvbuf(stdout, NULL, _IONBF, 0)`, **visible en el listado**, que la
 *     desactiva. O sea que el puzzle enseña que la trampa existe mostrando la
 *     línea que la neutraliza.
 *
 *  2. **El orden de las líneas.** Qué proceso imprime primero depende del
 *     scheduler y no es determinista, así que nunca se pregunta por el orden
 *     sino por la CANTIDAD, que sí lo es.
 */

/** Cuántos procesos como mucho. Más que esto deja de trazarse a mano. */
const MAX_PROCESOS = 24;
const MIN_PROCESOS = 6;

/**
 * Techo duro del simulador, y no es lo mismo que `MAX_PROCESOS`.
 *
 * Aquél es una regla de diseño que el generador aplica DESPUÉS de simular; éste
 * evita que la simulación misma se vaya al infinito. Dos bucles de `fork()`
 * anidados dan 2^(n*m) procesos, y con un par de niveles más eso no entra en la
 * memoria de la máquina: el primer intento reventó con "Map maximum size
 * exceeded" antes de llegar a la verificación.
 *
 * Importa que el tope viva ACÁ y no sólo en el generador, porque `simular` es lo
 * que corre, y corre dentro del proceso que además atiende el multijugador de
 * /escapecv y de Agarrá.io. Un candidato explosivo no puede tirar ese proceso.
 */
const TOPE_DURO = 4096;

/**
 * Profundidad del árbol: de tres a cinco niveles.
 *
 * El 2 quedó AFUERA por una razón medida, no por gusto. Es el caso
 * sobre-restringido: un árbol de dos niveles sólo puede tener 6 o 7 procesos
 * —960 de 974 casos—, así que el conjunto de programas que cumplen
 * (profundidad 2, N hijos directos) es de un puñado, y el generador caía
 * siempre en los mismos. Resultado: ocho pares de DÍAS CONSECUTIVOS con el
 * programa idéntico, o sea las cuatro respuestas regaladas al día siguiente.
 * Es el mismo problema de pozo diminuto que dejó al par 7 fuera de bit golf.
 */
const MIN_PROF = 3;
const MAX_PROF = 5;

// Las etiquetas que el programa puede imprimir. Letras sueltas para que
// preguntar "cuántas veces se imprime X" no se confunda con nada más.
const ETIQUETAS = ["A", "B", "C", "D", "E", "F"];

/** Generador con semilla. splitmix32, por el bug de días vecinos de palas.js. */
function rng(semilla) {
  let z = ((Number(semilla) || 0) + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  let x = (z ^ (z >>> 15)) >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * Simula el programa y devuelve el árbol completo.
 *
 * Es LA especificación del juego. El modelo es una lista de procesos vivos: cada
 * sentencia se aplica a todos a la vez, y las que bifurcan devuelven más de los
 * que recibieron.
 *
 * Un proceso que hace `exit` sale de la lista de vivos pero **sigue contando en
 * el total**: existió. Y sus hijos, si llegó a tenerlos, siguen vivos — son
 * procesos aparte, no partes de él. Ésa es justamente la intuición que el puzzle
 * quiere construir.
 */
export function simular(programa) {
  const ctx = {
    proximo: 1,
    padre: new Map(),      // id -> id del padre
    profundidad: new Map([[0, 0]]),
    etiquetas: new Map(),  // etiqueta -> cuántas veces se imprimió
    desbordo: false,       // se pasó del techo duro y la simulación se abortó
    // Qué sentencias ejecutó al menos un proceso, identificadas por su camino en
    // el árbol ("0.2.1"). Sirve para rechazar los programas con código muerto:
    // dos ramas que terminan en `exit(0)` dejan inalcanzable todo lo que sigue, y
    // el listado mostraría `fork()` que nunca corren.
    ejecutadas: new Set(),
    totalSentencias: 0,
  };

  const correr = (sentencias, vivos, camino = "") => {
    for (let i = 0; i < sentencias.length; i++) {
      const s = sentencias[i];
      const aqui = `${camino}${i}`;
      ctx.totalSentencias++;
      if (vivos.length > 0) ctx.ejecutadas.add(aqui);
      if (s.tipo === "fork") {
        const siguientes = [];
        for (const p of vivos) {
          if (ctx.proximo >= TOPE_DURO) { ctx.desbordo = true; return []; }
          const hijo = ctx.proximo++;
          ctx.padre.set(hijo, p);
          ctx.profundidad.set(hijo, ctx.profundidad.get(p) + 1);
          siguientes.push(p, hijo);
        }
        vivos = siguientes;

      } else if (s.tipo === "bifurca") {
        // `if (fork() == 0) { hijo } else { padre }`. El hijo corre una rama y
        // el padre la otra; las dos siguen vivas y se juntan después del if.
        const hijos = [], padres = [];
        for (const p of vivos) {
          if (ctx.proximo >= TOPE_DURO) { ctx.desbordo = true; return []; }
          const hijo = ctx.proximo++;
          ctx.padre.set(hijo, p);
          ctx.profundidad.set(hijo, ctx.profundidad.get(p) + 1);
          hijos.push(hijo);
          padres.push(p);
        }
        vivos = correr(s.hijo, hijos, `${aqui}.h.`).concat(correr(s.padre, padres, `${aqui}.p.`));

      } else if (s.tipo === "bucle") {
        for (let i = 0; i < s.veces; i++) {
          vivos = correr([{ tipo: "fork" }], vivos, `${aqui}.b${i}.`);
        }

      } else if (s.tipo === "imprime") {
        // Una vez por proceso vivo: todos ejecutan la misma línea.
        ctx.etiquetas.set(s.etiqueta, (ctx.etiquetas.get(s.etiqueta) || 0) + vivos.length);

      } else if (s.tipo === "sale") {
        vivos = [];
      }
    }
    return vivos;
  };

  correr(programa, [0]);

  const profs = [...ctx.profundidad.values()];
  let hijosDirectos = 0;
  for (const pa of ctx.padre.values()) if (pa === 0) hijosDirectos++;

  return {
    total: ctx.proximo,                  // el 0 es el original, y `proximo` ya lo cuenta
    etiquetas: Object.fromEntries(ctx.etiquetas),
    hijosDirectos,
    profundidad: Math.max(...profs),
    padre: ctx.padre,
    // `true` si TODA sentencia del listado fue ejecutada por algún proceso.
    sinCodigoMuerto: ctx.ejecutadas.size === ctx.totalSentencias,
    // `true` si la simulación se abortó por el techo duro: sus números NO valen.
    desbordo: ctx.desbordo,
  };
}

/**
 * Imprime el programa en C.
 *
 * `setvbuf` va siempre y es la primera línea del cuerpo: desactiva el buffer de
 * `stdout` para que el puzzle no dependa de si la salida es terminal o pipe.
 * El `while (wait(NULL) > 0)` del final es el del handout y evita zombies; no
 * cambia ninguna de las cuatro respuestas, pero sin él el programa estaría mal
 * escrito y el puzzle enseñaría a escribirlo mal.
 */
export function imprimir(programa) {
  const lineas = [
    "#include <stdio.h>",
    "#include <stdlib.h>",
    "#include <unistd.h>",
    "#include <sys/wait.h>",
    "",
    "int main(void) {",
    "    setvbuf(stdout, NULL, _IONBF, 0);",
  ];

  const cuerpo = (sentencias, sangria) => {
    const s = " ".repeat(sangria);
    for (const st of sentencias) {
      if (st.tipo === "fork") lineas.push(`${s}fork();`);
      else if (st.tipo === "imprime") lineas.push(`${s}printf("${st.etiqueta}\\n");`);
      else if (st.tipo === "sale") lineas.push(`${s}exit(0);`);
      else if (st.tipo === "bucle") {
        lineas.push(`${s}for (int i = 0; i < ${st.veces}; i++) {`);
        lineas.push(`${s}    fork();`);
        lineas.push(`${s}}`);
      } else if (st.tipo === "bifurca") {
        lineas.push(`${s}if (fork() == 0) {`);
        cuerpo(st.hijo, sangria + 4);
        if (st.padre.length > 0) {
          lineas.push(`${s}} else {`);
          cuerpo(st.padre, sangria + 4);
        }
        lineas.push(`${s}}`);
      }
    }
  };

  cuerpo(programa, 4);
  lineas.push("    while (wait(NULL) > 0);");
  lineas.push("    return 0;");
  lineas.push("}");
  return lineas;
}

function sortear(r, lista) { return lista[Math.floor(r() * lista.length)]; }

/**
 * Arma un bloque de sentencias.
 *
 * `profundidadIf` limita el anidamiento de condicionales: dos niveles ya obligan
 * a llevar la cuenta en papel y tres vuelven el listado ilegible.
 */
function bloque(r, profundidadIf, permitirSalida, minimo = 1) {
  const n = minimo + Math.floor(r() * 3);
  const sentencias = [];
  for (let i = 0; i < n; i++) {
    const tiradas = ["fork", "imprime", "bucle"];
    if (profundidadIf < 2) tiradas.push("bifurca", "bifurca");
    if (permitirSalida && i === n - 1) tiradas.push("sale");

    const t = sortear(r, tiradas);
    const ultima = sentencias[sentencias.length - 1];
    if (t === "fork") sentencias.push({ tipo: "fork" });
    else if (t === "imprime") {
      // Dos `printf` idénticos seguidos es código que nadie escribiría, y el
      // listado tiene que parecer código de verdad para que leerlo signifique
      // algo. Si repite, se saltea la sentencia.
      const et = sortear(r, ETIQUETAS);
      if (!(ultima && ultima.tipo === "imprime" && ultima.etiqueta === et)) {
        sentencias.push({ tipo: "imprime", etiqueta: et });
      }
    }
    else if (t === "bucle") sentencias.push({ tipo: "bucle", veces: 2 + Math.floor(r() * 3) });
    else if (t === "sale") { sentencias.push({ tipo: "sale" }); break; }
    else {
      sentencias.push({
        tipo: "bifurca",
        hijo: bloque(r, profundidadIf + 1, true),
        // La rama del padre puede estar vacía: `if (fork() == 0) { ... }` sin
        // else es la forma más común en la vida real.
        padre: r() < 0.55 ? bloque(r, profundidadIf + 1, true) : [],
      });
    }
  }
  return sentencias;
}

/**
 * El bloque de arriba de todo, con una cantidad EXACTA de hijos directos.
 *
 * Los hijos directos del proceso original son, por definición, los `fork()` que
 * ejecuta él mismo: los de primer nivel más los de los bucles de primer nivel
 * más uno por cada `if (fork() == 0)` de primer nivel. O sea que esa respuesta
 * se puede CONSTRUIR en vez de buscarse.
 *
 * Y había que construirla. Dejándola salir sola, contestar "2" acertaba el 40%
 * de los días. Buscarla por rechazo —sorteando programas enteros hasta que
 * diera— también funcionaba, pero llevaba la generación a **487 ms por
 * programa** medidos, contra los 70 de ahora. Construirla sale gratis porque no
 * agrega un solo rechazo: se arma el bloque con esa cantidad de fork y listo.
 */
function bloqueRaiz(r, hijos) {
  // Se reparte `hijos` en sumandos; cada sumando es una sentencia que hace esa
  // cantidad de fork en el proceso original.
  const partes = [];
  let quedan = hijos;
  while (quedan > 0) {
    const n = quedan === 1 ? 1 : 1 + Math.floor(r() * Math.min(3, quedan));
    partes.push(n);
    quedan -= n;
  }

  const sentencias = [];
  for (const n of partes) {
    if (n === 1) {
      // Un fork solo, o un if cuya condición es un fork: los dos aportan uno.
      if (r() < 0.45) {
        sentencias.push({
          tipo: "bifurca",
          hijo: bloque(r, 1, true),
          padre: r() < 0.5 ? bloque(r, 1, true) : [],
        });
      } else {
        sentencias.push({ tipo: "fork" });
      }
    } else {
      sentencias.push({ tipo: "bucle", veces: n });
    }
    // Un printf suelto entre medio, para que el listado no sea una pila de forks.
    if (r() < 0.4) sentencias.push({ tipo: "imprime", etiqueta: sortear(r, ETIQUETAS) });
  }
  return sentencias;
}

/**
 * El programa del día.
 *
 * Las garantías del generador, todas verificadas en los tests sobre 520 días.
 * Las dos primeras son lecciones directas de los puzzles anteriores:
 *
 *  1. **La etiqueta preguntada no puede coincidir con el total.** Si coincidiera,
 *     la pregunta 2 sería la pregunta 1 escrita de otra forma y el puzzle tendría
 *     tres preguntas disfrazadas de cuatro.
 *  2. **Al menos tres de las cuatro respuestas tienen que ser distintas entre sí**,
 *     para que no se pueda copiar una en otra. Es la lección de La pila de palas,
 *     donde una pregunta se acertaba el 58% contestando siempre lo mismo.
 *  3. **El total NO puede ser potencia de dos.** Con un árbol binario perfecto
 *     alcanza con contar los `fork()` y elevar dos a esa potencia: el puzzle se
 *     resolvería sin mirar la estructura, que es lo único que quiere medir.
 *  4. **El árbol no puede ser ni plano ni una cadena.** Si todos los procesos
 *     fueran hijos directos, la profundidad sería gratis; si fueran una cadena,
 *     los hijos directos serían gratis.
 *  5. Todo tiene que entrar en un rango que se pueda trazar a mano.
 *  6. **Nada de código muerto.** Toda sentencia del listado tiene que ser
 *     ejecutada por al menos un proceso.
 *
 * DOS DE LAS CUATRO RESPUESTAS SE ELIGEN ANTES DE BUSCAR EL PROGRAMA, que es la
 * receta que ya funcionó para el par de bit golf. Dejándolas salir solas, la
 * profundidad quedaba pegada al techo —contestar "4" acertaba el 55% de los
 * días— y los hijos directos pegados al piso, con "2" acertando el 40%. Eligiendo
 * primero la profundidad (por rechazo) y los hijos directos (por construcción),
 * la mejor conjetura ciega de las cuatro preguntas queda en 30%, 25%, 28% y 35%.
 *
 * Lo que NO se puede fijar a la vez es la profundidad y el total, y no por falta
 * de ganas: están correlacionados de raíz. Un árbol de profundidad 2 sólo puede
 * tener 6 o 7 procesos —medido: 960 de 974 casos—, porque con dos niveles no hay
 * dónde poner más. Por eso el total sigue teniendo el 6 sobrerrepresentado y no
 * hay forma barata de arreglarlo.
 */
/**
 * El programa de cada día, ya calculado.
 *
 * Generarlo cuesta decenas de milisegundos porque el generador sortea y rechaza
 * hasta dar con los objetivos, y `programaDelDia` se llama varias veces por
 * pedido —una para el listado, una para corregir—. Como es función PURA del día,
 * alcanza con guardarlo: el primer pedido del día lo paga y todos los demás
 * salen gratis. Es el mismo recurso que usa `bitgolf.js` con sus tablas de
 * distancias.
 */
const cacheDia = new Map();

export function programaDelDia(dia) {
  const d = Number(dia) || 0;
  if (cacheDia.has(d)) return cacheDia.get(d);

  /**
   * El programa de hoy no puede dar las mismas cuatro respuestas que el de ayer.
   *
   * Sin esta regla había UN par de días consecutivos en 520 con el programa
   * literalmente idéntico —los días 11 y 12— y seis pares que, con programas
   * distintos, daban las cuatro respuestas iguales. Lo primero es lisa y
   * llanamente regalarle el puzzle al que jugó ayer.
   *
   * La mirada atrás es de UN SOLO NIVEL a propósito. Comparar contra el programa
   * que de verdad se sirvió ayer encadenaría: el día 203 necesitaría el 202, que
   * necesitaría el 201, y en frío serían doscientas generaciones. Se compara
   * contra `generar(ayer)` sin la regla, que es lo mismo salvo en los días en que
   * ayer a su vez tuvo que esquivar a anteayer. En esos pocos casos la regla
   * compara contra algo que no se sirvió: deja pasar una repetición en vez de
   * inventar una, que es el lado correcto para equivocarse.
   */
  const ayer = d > 1 ? respuestasDeProgram(generarDelDia(d - 1)) : null;
  const p = generarDelDia(d, ayer);
  // La cache no crece sin techo: en producción se usan uno o dos días por vez, y
  // el límite sólo importa para los tests, que recorren cientos.
  if (cacheDia.size > 600) cacheDia.clear();
  cacheDia.set(d, p);
  return p;
}

/** Las cuatro respuestas de un programa ya generado, sin pasar por la cache. */
function respuestasDeProgram(p) {
  const s = simular(p.programa);
  return {
    total: s.total,
    etiqueta: s.etiquetas[p.etiqueta] || 0,
    hijosDirectos: s.hijosDirectos,
    profundidad: s.profundidad,
  };
}

function generarDelDia(dia, evitar = null) {
  const r = rng((Number(dia) || 0) ^ 0x666f726b);

  /**
   * La profundidad objetivo se ELIGE PRIMERO y después se busca un programa que
   * la cumpla, en vez de aceptar la que salga.
   *
   * Dejándola salir sola queda pegada al techo: medido sobre 520 días daba
   * 4:286, 3:193 y 2:41, o sea que contestando "4" siempre se acertaba el 55% de
   * las veces y esa pregunta no medía casi nada. Es el mismo bug que tuvo La pila
   * de palas con la cantidad de palas finales, y la misma solución que bit golf
   * usa para el par: elegir el valor y después buscar el puzzle.
   *
   * Las otras tres respuestas no necesitan esto: salen bien repartidas solas
   * (mejor conjetura 16%, 21% y 29%).
   */
  const profObjetivo = MIN_PROF + Math.floor(r() * (MAX_PROF - MIN_PROF + 1));
  const hijosObjetivo = 2 + Math.floor(r() * 4);

  /**
   * DOS PASADAS, y la segunda no es un detalle: es la corrección de un bug que
   * servía el mismo puzzle uno de cada 29 días.
   *
   * La primera exige los dos objetivos sorteados (profundidad y hijos directos).
   * Pero algunas combinaciones son muy raras o directamente inalcanzables, y
   * antes, al agotarse los intentos, la función caía en la salida de emergencia
   * —un programa FIJO escrito a mano—. Como ese programa es el mismo para
   * cualquier día que falle, los 18 días de 520 que fallaban servían todos el
   * mismo puzzle, y dos de ellos caían en días consecutivos: el 11 y el 12.
   *
   * Se descubrió reconociendo el programa: los días 11 y 12 mostraban
   * exactamente el listado que yo había escrito como emergencia. Hasta ese
   * momento el síntoma parecía una colisión de semillas y estuve buscando en el
   * lugar equivocado — incluso probé una mirada atrás de dos niveles, que costó
   * 104 ms por día y no arregló nada, porque no era eso.
   *
   * La segunda pasada suelta los dos objetivos y acepta cualquier programa
   * válido. Así cada día tiene SU programa, y el enlatado de abajo queda como lo
   * que debería haber sido siempre: un último recurso que no se usa nunca.
   */
  for (let pasada = 0; pasada < 2; pasada++) {
  const exigirObjetivos = pasada === 0;
  for (let intento = 0; intento < 12000; intento++) {
    // En la pasada relajada la cantidad de hijos se vuelve a sortear en cada
    // intento: si se mantuviera fija, las dos pasadas buscarían lo mismo y la
    // segunda no agregaría nada.
    const programa = bloqueRaiz(r, exigirObjetivos ? hijosObjetivo : 2 + Math.floor(r() * 4));
    // Siempre cierra imprimiendo, así hay una etiqueta que llega al final y la
    // pregunta 2 no se contesta mirando sólo el principio.
    programa.push({ tipo: "imprime", etiqueta: sortear(r, ETIQUETAS) });

    const s = simular(programa);
    // Lo primero, antes de mirar cualquier número: si desbordó, sus cuentas no
    // significan nada.
    if (s.desbordo) continue;

    /**
     * Garantía 6: nada de código muerto.
     *
     * Si las dos ramas de un `if` terminan en `exit(0)`, todo lo que sigue es
     * inalcanzable y el listado muestra `fork()` que nunca corren — el puzzle
     * parece más difícil de lo que es y buena parte del código es decorado. Es
     * la misma lección que la garantía de ramas de ¿Qué devuelve?, apareciendo
     * en otro juego: el primer programa que generé tenía cinco `fork()` muertos.
     */
    if (!s.sinCodigoMuerto) continue;

    if (s.total < MIN_PROCESOS || s.total > MAX_PROCESOS) continue;
    if (exigirObjetivos ? s.profundidad !== profObjetivo
                        : (s.profundidad < MIN_PROF || s.profundidad > MAX_PROF)) continue;

    // Garantía 3: nada de árboles binarios perfectos.
    if ((s.total & (s.total - 1)) === 0) continue;

    // Garantía 4: ni plano ni cadena.
    /**
     * `bloqueRaiz` construye la cantidad de hijos directos, pero puede quedar
     * POR DEBAJO de lo construido: si el proceso original sale por un `exit(0)`
     * en una rama temprana, nunca llega a ejecutar los fork que siguen. Medido:
     * 24 días de 520 terminaban con un solo hijo directo. Así que el piso se
     * chequea igual, y el techo evita el árbol plano.
     */
    if (s.hijosDirectos < 2) continue;
    if (s.hijosDirectos >= s.total - 1) continue;

    const cuales = Object.keys(s.etiquetas).filter((k) => s.etiquetas[k] > 0);
    if (cuales.length === 0) continue;
    const etiqueta = cuales[Math.floor(r() * cuales.length)];
    const cuenta = s.etiquetas[etiqueta];

    // Garantía 1: la etiqueta no puede ser el total disfrazado.
    if (cuenta === s.total) continue;
    if (cuenta < 2) continue;

    // Garantía 2: al menos tres valores distintos entre las cuatro respuestas.
    const respuestas = [s.total, cuenta, s.hijosDirectos, s.profundidad];
    if (new Set(respuestas).size < 3) continue;

    // La regla anti-repetición: si las cuatro respuestas coinciden con las de
    // ayer, se descarta el candidato y se sigue buscando.
    if (evitar && cuenta === evitar.etiqueta && s.total === evitar.total
        && s.hijosDirectos === evitar.hijosDirectos && s.profundidad === evitar.profundidad) {
      continue;
    }

    return {
      dia: Number(dia) || 0,
      programa,
      etiqueta,
      lineas: imprimir(programa),
    };
  }
  }

  /**
   * Salida de emergencia. Un puzzle diario no puede devolver nada.
   *
   * Los números de este programa están **comprobados contra el kernel** con
   * `verificar-fork.js`, no calculados a ojo: ya escribí una vez cuatro
   * resultados inventados en un comentario de `asm.js` y tres estaban mal.
   * Total 6, "A" dos veces, 2 hijos directos, profundidad 3.
   */
  const programa = [
    { tipo: "fork" },
    { tipo: "bifurca", hijo: [{ tipo: "imprime", etiqueta: "A" }], padre: [{ tipo: "sale" }] },
    { tipo: "fork" },
    { tipo: "imprime", etiqueta: "B" },
  ];
  return { dia: Number(dia) || 0, programa, etiqueta: "A", lineas: imprimir(programa) };
}

/**
 * Lo único que viaja al cliente: el listado y qué etiqueta se pregunta.
 *
 * El árbol de sentencias NO sale. Es la respuesta escrita de otra forma: con esa
 * estructura en la mano se simula sin leer una línea de C.
 */
export function programaPublico(dia) {
  const p = programaDelDia(dia);
  return { dia: p.dia, lineas: p.lineas, etiqueta: p.etiqueta };
}

/** Las cuatro respuestas correctas. Interno: nunca sale hacia el cliente. */
export function respuestasDe(dia) {
  const p = programaDelDia(dia);
  const s = simular(p.programa);
  return {
    total: s.total,
    etiqueta: s.etiquetas[p.etiqueta] || 0,
    hijosDirectos: s.hijosDirectos,
    profundidad: s.profundidad,
  };
}

/**
 * Corrige las cuatro respuestas.
 *
 * `mal` es cuántas erró, de 0 a 4, y es el valor por el que se rankea.
 */
export function corregir(dia, respuesta) {
  if (!respuesta || typeof respuesta !== "object" || Array.isArray(respuesta)) {
    return { error: "Respuesta inválida." };
  }

  const campos = ["total", "etiqueta", "hijosDirectos", "profundidad"];
  const dadas = {};
  for (const c of campos) {
    const n = Math.floor(Number(respuesta[c]));
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      return { error: "Alguna respuesta no es un número razonable." };
    }
    dadas[c] = n;
  }

  const esperadas = respuestasDe(dia);
  const detalle = {};
  for (const c of campos) detalle[c] = dadas[c] === esperadas[c];
  const mal = campos.filter((c) => !detalle[c]).length;

  return { mal, detalle, esperadas, perfecto: mal === 0 };
}

/**
 * Registra el único envío del día.
 *
 * Lo que NO vuelve al cliente son `esperadas`: con las cuatro en la mano, el
 * segundo jugador las copia del primero. Se devuelve cuáles acertó —así el
 * resultado enseña algo y alcanza para los cuadraditos de compartir— y no cuál
 * era el número.
 */
export function registrarIntento(store, { dia, playerId, playerName, respuesta }) {
  const d = Number(dia);
  if (!Number.isFinite(d) || d < 1) return { error: "Falta el día." };
  if (!playerId) return { error: "Falta el jugador." };

  const previo = (store.daily[d] || []).find((e) => e.playerId === playerId);
  if (previo) {
    return { error: "Ya entregaste el de hoy.", yaJugado: true, mal: previo.attempts, perfecto: previo.solved };
  }

  const r = corregir(d, respuesta);
  if (typeof r.error === "string") return { error: r.error };

  store.recordCompletion(d, playerId, playerName || "Pelado Anónimo", r.mal, r.perfecto);
  return { ok: true, mal: r.mal, detalle: r.detalle, perfecto: r.perfecto };
}
