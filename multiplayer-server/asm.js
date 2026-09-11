/**
 * ¿Qué devuelve? — el puzzle diario de leer código ajeno.
 *
 * Seis a diez instrucciones de x86-64 que reciben un entero y devuelven otro.
 * El jugador dice qué devuelve para cuatro entradas distintas. Puntaje de 0 a 4
 * según cuántas erró, con la misma forma de "menos es mejor" que los otros tres
 * juegos diarios, así que el ordenamiento del ranking sirve sin tocarlo.
 *
 * LO QUE HACE CONSTRUIBLE ESTO ES QUE LA FUNCIÓN SE **GENERA**, NO SE ANALIZA.
 * La idea de dar código y preguntar qué hace suena imposible de automatizar: haría
 * falta un analizador que entienda x86 y demuestre qué computa. Pero el problema
 * está dado vuelta. Si la función se arma COMPONIENDO operaciones conocidas, su
 * semántica se sabe por construcción: se evalúa con el mismo árbol con el que se
 * generó y listo. El texto en assembler es una IMPRESIÓN de esa estructura, no su
 * fuente. Por eso la respuesta existe, es única y es exacta, que es la condición
 * que hundió a la mitad de las ideas de puzzle que propuse.
 *
 * LO QUE ESTE JUEGO NO DEFIENDE, y queda escrito como el agujero de identidad de
 * Pelardle y el conteo por consola de las palas: el código es público, así que
 * quien lo pegue en un compilador y lo corra con las cuatro entradas tiene las
 * cuatro respuestas sin pensar. No lo tapo, y el motivo es que **hacer la trampa
 * cuesta lo mismo que jugar**: armar el archivo, compilarlo y correrlo cuatro
 * veces son los mismos minutos que trazarlo a mano. Es una situación distinta de
 * la de las palas, donde contar elementos en la consola es diez veces más rápido
 * que contar con el ojo, y por eso allá hizo falta un reloj y acá no.
 */

const i32 = (x) => x | 0;

/**
 * El repertorio.
 *
 * Cada operación trae su evaluación y su impresión. Están juntas a propósito: si
 * vivieran separadas, una podría cambiar sin la otra y el juego mostraría una
 * instrucción mientras corrige con otra — el peor bug posible acá, porque el
 * jugador tendría razón y no habría forma de que lo supiera.
 *
 * Falta `shr` a propósito. La diferencia entre `shr` y `sar` es real y valdría un
 * puzzle propio, pero un corrimiento lógico sobre un valor negativo da un número
 * de diez dígitos y ahí se deja de poder trazar a mano, que es el único requisito
 * que este juego no puede negociar.
 */
const OPS = {
  add:  { f: (v, a) => i32(v + a),            txt: (a) => `add     eax, ${a}` },
  sub:  { f: (v, a) => i32(v - a),            txt: (a) => `sub     eax, ${a}` },
  imul: { f: (v, a) => Math.imul(v, a),       txt: (a) => `imul    eax, ${a}` },
  shl:  { f: (v, a) => i32(v << a),           txt: (a) => `shl     eax, ${a}` },
  sar:  { f: (v, a) => v >> a,                txt: (a) => `sar     eax, ${a}` },
  and:  { f: (v, a) => v & a,                 txt: (a) => `and     eax, ${a}` },
  or:   { f: (v, a) => v | a,                 txt: (a) => `or      eax, ${a}` },
  xor:  { f: (v, a) => v ^ a,                 txt: (a) => `xor     eax, ${a}` },
  neg:  { f: (v) => i32(-v),                  txt: () => `neg     eax` },
  not:  { f: (v) => ~v,                       txt: () => `not     eax` },
  // `lea` con el mismo registro dos veces multiplica por 1+k sin usar `imul`.
  // Es el truco que el compilador usa todo el tiempo y la primera vez que se ve
  // no se entiende, así que vale que esté.
  lea:  { f: (v, a) => Math.imul(v, 1 + a),   txt: (a) => `lea     eax, [rax+rax*${a}]` },
};

/**
 * Las condiciones, comparando `eax` con una constante en aritmética CON SIGNO.
 *
 * `txt` imprime la forma idiomática: contra cero, `cmp eax, 0` se escribe
 * `test eax, eax`, que es lo que emite cualquier compilador. Enseñarlo con la
 * forma que nadie escribe sería enseñar mal.
 */
const CONDS = {
  jl:  { f: (v, k) => v < k,   cero: "js",   txt: "jl" },
  jge: { f: (v, k) => v >= k,  cero: "jns",  txt: "jge" },
  jg:  { f: (v, k) => v > k,   cero: null,   txt: "jg" },
  jle: { f: (v, k) => v <= k,  cero: null,   txt: "jle" },
  je:  { f: (v, k) => v === k, cero: "jz",   txt: "je" },
  jne: { f: (v, k) => v !== k, cero: "jnz",  txt: "jne" },
};

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

/** Evalúa la función para una entrada. Es LA especificación del juego. */
export function evaluar(fn, entrada) {
  let v = i32(entrada);
  for (const p of fn.pre) v = OPS[p.op].f(v, p.arg);

  const rama = CONDS[fn.cond.cc].f(v, fn.cond.k) ? fn.salto : fn.sigue;
  for (const p of rama) v = OPS[p.op].f(v, p.arg);
  return v;
}

/**
 * ¿Por qué rama se va una entrada?
 *
 * Se exporta para que el test verifique la propiedad REAL —que las dos ramas se
 * tomen— en vez de inferirla vaciando una rama y comparando resultados, que es
 * un proxy y falla cuando la rama no cambia el valor.
 */
export function ramaDe(fn, entrada) {
  let v = i32(entrada);
  for (const p of fn.pre) v = OPS[p.op].f(v, p.arg);
  return CONDS[fn.cond.cc].f(v, fn.cond.k) ? "salto" : "sigue";
}

/**
 * Imprime la función en assembler.
 *
 * Convención de llamada System V AMD64, que es la de Linux y macOS: el primer
 * entero llega en `edi` y el resultado se devuelve en `eax`. Por eso la primera
 * instrucción es siempre `mov eax, edi` — sin eso el código no sería x86-64 de
 * verdad sino pseudocódigo con nombres de registros.
 */
export function imprimir(fn) {
  const lineas = ["pela:", "        mov     eax, edi"];
  for (const p of fn.pre) lineas.push("        " + OPS[p.op].txt(p.arg));

  const c = CONDS[fn.cond.cc];
  if (fn.cond.k === 0 && c.cero) {
    lineas.push("        test    eax, eax");
    lineas.push(`        ${c.cero}      .otro`);
  } else {
    lineas.push(`        cmp     eax, ${fn.cond.k}`);
    lineas.push(`        ${c.txt}${" ".repeat(Math.max(1, 8 - c.txt.length))}.otro`);
  }

  for (const p of fn.sigue) lineas.push("        " + OPS[p.op].txt(p.arg));
  lineas.push("        ret");
  lineas.push(".otro:");
  for (const p of fn.salto) lineas.push("        " + OPS[p.op].txt(p.arg));
  lineas.push("        ret");
  return lineas;
}

// Las entradas candidatas. Incluyen negativos a propósito: `and eax, 7` sobre un
// negativo da un positivo, y `not eax` es `-x-1`, dos cosas que sólo se aprenden
// topándose con ellas.
const CANDIDATAS = [];
for (let i = -9; i <= 40; i++) CANDIDATAS.push(i);

// Techos de legibilidad. No son límites técnicos: son el punto donde trazar a
// mano deja de ser razonable y el puzzle empieza a medir paciencia.
const TOPE_RESULTADO = 100000;

function sortear(r, lista) {
  return lista[Math.floor(r() * lista.length)];
}

function opAlAzar(r) {
  const clave = sortear(r, ["add", "sub", "imul", "shl", "sar", "and", "or", "xor", "neg", "not", "lea"]);
  switch (clave) {
    case "add": case "sub": return { op: clave, arg: 1 + Math.floor(r() * 30) };
    case "imul": return { op: "imul", arg: sortear(r, [3, 5, 6, 7, 9, 11]) };
    case "shl": return { op: "shl", arg: 1 + Math.floor(r() * 3) };
    case "sar": return { op: "sar", arg: 1 + Math.floor(r() * 2) };
    case "and": return { op: "and", arg: sortear(r, [3, 7, 15, 31, 63]) };
    case "or": return { op: "or", arg: sortear(r, [1, 2, 4, 8, 16]) };
    case "xor": return { op: "xor", arg: sortear(r, [1, 3, 7, 12, 15, 31]) };
    case "lea": return { op: "lea", arg: sortear(r, [1, 2, 4, 8]) };
    default: return { op: clave, arg: 0 };
  }
}

function tramo(r, min, max) {
  const n = min + Math.floor(r() * (max - min + 1));
  const ops = [];
  for (let i = 0; i < n; i++) ops.push(opAlAzar(r));
  return ops;
}

/**
 * Arma la función del día.
 *
 * El generador tiene que garantizar cuatro cosas, y las cuatro son requisitos
 * del puzzle y no detalles:
 *
 *   1. Las CUATRO entradas no pueden dar el mismo resultado — ni tres de cuatro.
 *      Es la lección directa del bug de La pila de palas, donde la pila terminaba
 *      siempre con una o dos palas y "cuántas quedan" se acertaba el 58% sin
 *      mirar nada. Se exigen al menos tres resultados distintos.
 *   2. Las DOS ramas tienen que usarse. Si las cuatro entradas se van por el
 *      mismo lado, la mitad del código es decoración y el puzzle miente sobre su
 *      propia dificultad: alguien que deduzca una sola rama acierta todo.
 *   3. Ningún resultado puede ser igual a su entrada, o la función parece la
 *      identidad y se contesta sin leer.
 *   4. Todo tiene que quedar en un rango que se pueda trazar a mano.
 *   5. Cada rama tiene que IMPORTAR y no sólo tomarse: una rama que no cambia el
 *      valor es una bifurcación que no hace falta entender.
 */
export function funcionDelDia(dia) {
  const r = rng((Number(dia) || 0) ^ 0x61736d78);

  for (let intento = 0; intento < 3000; intento++) {
    const cc = sortear(r, Object.keys(CONDS));
    const fn = {
      pre: tramo(r, 2, 3),
      cond: { cc, k: sortear(r, [0, 0, 1, 4, 8, 10, 16, 20, 32, 50, 64, 100]) },
      sigue: tramo(r, 1, 3),
      salto: tramo(r, 1, 3),
    };

    // Qué hace la función sobre todas las candidatas, de una sola pasada.
    const porRama = { salto: [], sigue: [] };
    for (const e of CANDIDATAS) {
      const salida = evaluar(fn, e);
      if (!Number.isFinite(salida) || Math.abs(salida) > TOPE_RESULTADO) continue;
      if (salida === e) continue; // garantía 3
      porRama[ramaDe(fn, e)].push({ e, salida });
    }
    // Garantía 2: hacen falta candidatas de las dos ramas.
    if (porRama.salto.length < 1 || porRama.sigue.length < 1) continue;

    // Se toman dos de cada rama cuando se puede, y si una rama tiene una sola
    // candidata se completa con la otra. Así las dos ramas siempre se usan.
    const elegidas = [];
    const tomar = (lista, cuantas) => {
      const copia = lista.slice();
      for (let i = 0; i < cuantas && copia.length > 0; i++) {
        elegidas.push(copia.splice(Math.floor(r() * copia.length), 1)[0]);
      }
      return copia;
    };
    const restoSalto = tomar(porRama.salto, 2);
    const restoSigue = tomar(porRama.sigue, 2);
    const sobrantes = restoSalto.concat(restoSigue);
    while (elegidas.length < 4 && sobrantes.length > 0) {
      elegidas.push(sobrantes.splice(Math.floor(r() * sobrantes.length), 1)[0]);
    }
    if (elegidas.length < 4) continue;

    // Garantía 1: al menos tres resultados distintos entre los cuatro.
    const distintos = new Set(elegidas.map((x) => x.salida));
    if (distintos.size < 3) continue;

    /**
     * Garantía 5: cada rama tiene que IMPORTAR, no sólo tomarse.
     *
     * Son dos propiedades distintas y al principio sólo garantizaba la primera.
     * Que las dos ramas se tomen lo asegura la construcción. Pero una rama puede
     * ser un no-op efectivo —`add 4` seguido de `sub 4`, o un `or 0`— y entonces
     * se toma sin cambiar nada: el listado muestra una bifurcación que no hace
     * falta entender, y el puzzle es más fácil de lo que parece. Pasaba en 32 de
     * 520 días.
     *
     * Se comprueba vaciando cada rama: si ninguna de las cuatro entradas cambia
     * de resultado, esa rama es decorado.
     */
    const sinSalto = { ...fn, salto: [] };
    const sinSigue = { ...fn, sigue: [] };
    const importaSalto = elegidas.some((x) => evaluar(fn, x.e) !== evaluar(sinSalto, x.e));
    const importaSigue = elegidas.some((x) => evaluar(fn, x.e) !== evaluar(sinSigue, x.e));
    if (!importaSalto || !importaSigue) continue;

    elegidas.sort((a, b) => a.e - b.e);
    return {
      dia: Number(dia) || 0,
      fn,
      entradas: elegidas.map((x) => x.e),
      lineas: imprimir(fn),
    };
  }

  /**
   * Salida de emergencia: una función escrita a mano que cumple las cuatro
   * garantías. Un puzzle diario no se puede permitir devolver nada.
   *
   * pela(-4) = 12, pela(1) = 8, pela(7) = 14, pela(20) = 27 — comprobado
   * contra un x86-64 de verdad, no calculado a ojo.
   */
  const fn = {
    pre: [{ op: "add", arg: 3 }, { op: "lea", arg: 1 }],
    cond: { cc: "jl", k: 8 },
    sigue: [{ op: "sar", arg: 1 }, { op: "add", arg: 4 }],
    salto: [{ op: "neg", arg: 0 }, { op: "add", arg: 10 }],
  };
  return { dia: Number(dia) || 0, fn, entradas: [-4, 1, 7, 20], lineas: imprimir(fn) };
}

/**
 * Lo único que viaja al cliente: el código y las cuatro entradas.
 *
 * La estructura `fn` NO sale. Es la respuesta escrita de otra forma: con el árbol
 * en la mano se evalúa sin leer una línea de assembler.
 */
export function funcionPublica(dia) {
  const f = funcionDelDia(dia);
  return { dia: f.dia, lineas: f.lineas, entradas: f.entradas };
}

/**
 * Corrige las cuatro respuestas.
 *
 * `mal` es cuántas erró, de 0 a 4, y es el valor por el que se rankea.
 */
export function corregir(dia, respuestas) {
  const f = funcionDelDia(dia);
  if (!Array.isArray(respuestas) || respuestas.length !== 4) {
    return { error: "Hacen falta las cuatro respuestas." };
  }

  const dadas = [];
  for (const x of respuestas) {
    const n = Math.floor(Number(x));
    if (!Number.isFinite(n) || Math.abs(n) > 2147483647) {
      return { error: "Alguna respuesta no es un entero de 32 bits." };
    }
    dadas.push(n);
  }

  const esperadas = f.entradas.map((e) => evaluar(f.fn, e));
  const detalle = dadas.map((d, i) => d === esperadas[i]);
  const mal = detalle.filter((ok) => !ok).length;

  return { mal, detalle, esperadas, perfecto: mal === 0, entradas: f.entradas };
}

/**
 * Registra el único envío del día.
 *
 * Lo que NO vuelve al cliente son `esperadas`. Es lo único que este juego tiene
 * para esconder: con los cuatro resultados en la mano, el segundo jugador los
 * copia del primero. Se devuelve CUÁLES acertó —así el resultado enseña algo y
 * alcanza para los cuadraditos de compartir— y no cuál era el número.
 */
export function registrarIntento(store, { dia, playerId, playerName, respuestas }) {
  const d = Number(dia);
  if (!Number.isFinite(d) || d < 1) return { error: "Falta el día." };
  if (!playerId) return { error: "Falta el jugador." };

  const previo = (store.daily[d] || []).find((e) => e.playerId === playerId);
  if (previo) {
    return { error: "Ya entregaste el de hoy.", yaJugado: true, mal: previo.attempts, perfecto: previo.solved };
  }

  const r = corregir(d, respuestas);
  if (typeof r.error === "string") return { error: r.error };

  store.recordCompletion(d, playerId, playerName || "Pelado Anónimo", r.mal, r.perfecto);
  return { ok: true, mal: r.mal, detalle: r.detalle, perfecto: r.perfecto };
}
