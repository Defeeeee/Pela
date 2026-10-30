import assert from "node:assert/strict";
import {
  simular, imprimir, programaDelDia, programaPublico, respuestasDe,
  corregir, registrarIntento,
} from "./fork.js";

console.log("Iniciando tests de El árbol de pelados...");

const F = () => ({ tipo: "fork" });
const P = (e) => ({ tipo: "imprime", etiqueta: e });
const X = () => ({ tipo: "sale" });
const IF = (hijo, padre = []) => ({ tipo: "bifurca", hijo, padre });

// 1. La semántica, clavada a mano
{
  /**
   * Casos escritos y trazados a mano, no sacados del generador. Están todos
   * comprobados contra el kernel con `verificar-fork.js`: ya escribí una vez
   * cuatro resultados calculados a ojo en un comentario de `asm.js` y tres
   * estaban mal, así que acá no se escribe un número sin correrlo.
   */

  // EL caso del juego: tres fork seguidos no son cuatro procesos, son OCHO.
  const tres = simular([F(), F(), F()]);
  assert.strictEqual(tres.total, 8, "Tres fork() seguidos crean OCHO procesos, no cuatro");
  assert.strictEqual(tres.hijosDirectos, 3, "El original es padre directo de uno por cada fork que ejecuta");
  assert.strictEqual(tres.profundidad, 3, "La rama más larga baja un nivel por fork");

  // Uno solo, para fijar el piso.
  assert.deepStrictEqual(
    [simular([F()]).total, simular([F()]).hijosDirectos, simular([F()]).profundidad],
    [2, 1, 1],
  );

  // El hijo bifurca y el padre no: tres procesos, no cuatro.
  const soloHijo = simular([IF([F()])]);
  assert.strictEqual(soloHijo.total, 3, "Si sólo el hijo forkea, son tres");
  assert.strictEqual(soloHijo.hijosDirectos, 1);
  assert.strictEqual(soloHijo.profundidad, 2, "nieto: original → hijo → nieto");

  // Dónde cae el printf respecto del fork, que es la mitad del juego.
  assert.strictEqual(simular([P("A"), F()]).etiquetas.A, 1, "printf ANTES del fork: una sola vez");
  assert.strictEqual(simular([F(), P("A")]).etiquetas.A, 2, "printf DESPUÉS del fork: dos veces");
  assert.strictEqual(simular([F(), F(), P("A")]).etiquetas.A, 4);

  // `exit` corta este proceso pero NO a sus hijos: son procesos aparte.
  const conSalida = simular([F(), X(), F()]);
  assert.strictEqual(conSalida.total, 2, "Después de exit(0) no se ejecuta nada más en ESE proceso");
  const hijoVive = simular([IF([P("A")], [X()]), P("B")]);
  assert.strictEqual(hijoVive.total, 2);
  assert.strictEqual(hijoVive.etiquetas.A, 1, "El hijo imprime A");
  assert.strictEqual(hijoVive.etiquetas.B, 1, "y sigue vivo después del if, aunque el padre haya salido");

  // El bucle es azúcar sobre N fork seguidos.
  assert.strictEqual(simular([{ tipo: "bucle", veces: 3 }]).total, 8, "Un for de 3 fork son 8 procesos");
  assert.deepStrictEqual(
    simular([{ tipo: "bucle", veces: 2 }]).total,
    simular([F(), F()]).total,
  );

  console.log("  ✓ Tres fork() son ocho procesos, el printf cuenta según dónde cae, y exit no mata a los hijos");
}

// 2. El listado impreso
{
  const l = imprimir([F(), IF([P("A")], [X()])]);
  assert.ok(l.includes("int main(void) {"));
  assert.ok(l.some((x) => x.includes("setvbuf")),
    "setvbuf va SIEMPRE: es lo que saca de la ecuación el buffer de printf, que depende de si la salida es terminal o pipe");
  assert.ok(l.some((x) => x.includes("while (wait(NULL) > 0);")),
    "El wait del final es el del handout; sin él el programa estaría mal escrito");
  assert.ok(l.some((x) => x.trim() === "if (fork() == 0) {"));
  assert.ok(l.some((x) => x.trim() === "} else {"));
  assert.ok(l.some((x) => x.trim() === "exit(0);"));

  // Un if sin else, que es la forma más común en la vida real.
  const sinElse = imprimir([IF([P("A")])]);
  assert.ok(!sinElse.some((x) => x.trim() === "} else {"), "Sin rama de padre no se imprime el else");

  for (let dia = 1; dia <= 400; dia++) {
    for (const linea of programaDelDia(dia).lineas) {
      assert.ok(!linea.includes("undefined"), `El día ${dia} imprime "${linea}"`);
      assert.ok(!/NaN/.test(linea), `El día ${dia} imprime un NaN: "${linea}"`);
    }
  }
  console.log("  ✓ El listado es C válido, con setvbuf y wait, y el else sólo cuando hay rama de padre");
}

// 3. Determinista y distinto cada día
{
  for (const dia of [1, 7, 42, 365, 1000]) {
    assert.deepStrictEqual(programaDelDia(dia), programaDelDia(dia), `El día ${dia} tiene que dar lo mismo`);
  }
  const firmas = new Set();
  for (let dia = 1; dia <= 520; dia++) {
    const p = programaDelDia(dia);
    firmas.add(p.lineas.join("|") + "#" + p.etiqueta);
  }
  assert.strictEqual(firmas.size, 520, `Sólo ${firmas.size} programas distintos en 520 días`);

  /**
   * Y NINGÚN día consecutivo puede repetir ni el programa ni las cuatro
   * respuestas. Es el test de regresión del peor bug que tuvo este juego: 18
   * días de 520 agotaban la búsqueda y caían en la salida de emergencia, que es
   * un programa FIJO — así que todos esos días servían el mismo puzzle, y dos
   * caían en días consecutivos (el 11 y el 12), regalándole las cuatro
   * respuestas a quien hubiera jugado el día anterior.
   */
  for (let dia = 1; dia < 520; dia++) {
    const a = programaDelDia(dia), b = programaDelDia(dia + 1);
    assert.notStrictEqual(a.lineas.join("|"), b.lineas.join("|"),
      `Los días ${dia} y ${dia + 1} sirven el mismo programa`);
    assert.notDeepStrictEqual(respuestasDe(dia), respuestasDe(dia + 1),
      `Los días ${dia} y ${dia + 1} tienen las cuatro respuestas iguales`);
  }
  console.log(`  ✓ Los 520 días dan programas distintos, y ningún día consecutivo repite ni el listado ni las respuestas`);
}

// 3b. La salida de emergencia no se usa nunca
{
  /**
   * Existe para no devolver nunca `undefined`, no para servirse. Si algún día
   * cae ahí, ese día y todos los demás que caigan sirven EL MISMO puzzle, que es
   * exactamente el bug que tuvo este juego. La búsqueda tiene dos pasadas —la
   * segunda suelta los objetivos— justamente para que esto no pase.
   */
  const emergencia = imprimir([
    F(),
    IF([P("A")], [X()]),
    F(),
    P("B"),
  ]).join("|");
  let caidos = 0;
  for (let dia = 1; dia <= 520; dia++) {
    if (programaDelDia(dia).lineas.join("|") === emergencia) caidos++;
  }
  assert.strictEqual(caidos, 0, `${caidos} días de 520 caen en la salida de emergencia`);
  console.log("  ✓ Ningún día cae en la salida de emergencia");
}

// 4. Las seis garantías del generador
{
  /**
   * Las seis son requisitos del puzzle y no detalles. Dos vienen de bugs reales
   * de los juegos anteriores: la de valores distintos salió de La pila de palas
   * —donde una pregunta se acertaba el 58% contestando siempre lo mismo— y la de
   * código muerto es la misma lección que la garantía de ramas de ¿Qué devuelve?.
   */
  let minTot = Infinity, maxTot = -Infinity;
  const profs = new Map(), potencias = [];

  for (let dia = 1; dia <= 520; dia++) {
    const p = programaDelDia(dia);
    const s = simular(p.programa);
    const r = respuestasDe(dia);

    assert.strictEqual(s.desbordo, false, `El día ${dia} desbordó el simulador`);
    assert.ok(s.sinCodigoMuerto, `El día ${dia} tiene código muerto: sentencias que nadie ejecuta`);
    assert.ok(s.total >= 6 && s.total <= 24, `El día ${dia} tiene ${s.total} procesos`);
    assert.ok(s.profundidad >= 2 && s.profundidad <= 5, `El día ${dia} tiene profundidad ${s.profundidad}`);

    // Garantía 3: nada de árboles binarios perfectos, o se resuelve contando
    // los fork() y elevando dos a esa potencia sin mirar la estructura.
    assert.notStrictEqual(s.total & (s.total - 1), 0, `El día ${dia} tiene ${s.total} procesos, que es potencia de dos`);
    if ((s.total & (s.total - 1)) === 0) potencias.push(dia);

    // Garantía 4: ni plano ni cadena.
    assert.ok(s.hijosDirectos > 1, `El día ${dia} tiene ${s.hijosDirectos} hijo directo: el árbol es una cadena`);
    assert.ok(s.hijosDirectos < s.total - 1, `El día ${dia} es plano: todos son hijos directos`);

    // Garantía 1: la etiqueta no puede ser el total disfrazado.
    assert.notStrictEqual(r.etiqueta, r.total, `El día ${dia} tiene etiqueta = total: la pregunta 2 es la 1`);
    assert.ok(r.etiqueta >= 2, `El día ${dia} imprime la etiqueta ${r.etiqueta} veces`);

    // Garantía 2: al menos tres valores distintos entre las cuatro respuestas.
    const vals = new Set([r.total, r.etiqueta, r.hijosDirectos, r.profundidad]);
    assert.ok(vals.size >= 3, `El día ${dia} tiene sólo ${vals.size} valores distintos entre las cuatro respuestas`);

    minTot = Math.min(minTot, s.total); maxTot = Math.max(maxTot, s.total);
    profs.set(s.profundidad, (profs.get(s.profundidad) || 0) + 1);
  }
  const rep = [...profs.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ");
  assert.strictEqual(potencias.length, 0);
  console.log(`  ✓ 520 días: ${minTot}-${maxTot} procesos, ninguna potencia de dos, sin código muerto (profundidades ${rep})`);
}

// 5. Ninguna de las cuatro respuestas se adivina
{
  /**
   * El bug de La pila de palas fue que la profundidad final terminaba siempre en
   * 1 o 2, y entonces una de las cuatro preguntas se acertaba el 58% contestando
   * lo mismo siempre. Acá se mide eso mismo sobre las cuatro: si alguna tiene un
   * valor que cubre más de un tercio de los días, esa pregunta no mide nada.
   */
  const campos = ["total", "etiqueta", "hijosDirectos", "profundidad"];
  const cuentas = Object.fromEntries(campos.map((c) => [c, new Map()]));
  for (let dia = 1; dia <= 520; dia++) {
    const r = respuestasDe(dia);
    for (const c of campos) cuentas[c].set(r[c], (cuentas[c].get(r[c]) || 0) + 1);
  }
  const resumen = [];
  for (const c of campos) {
    const mejor = Math.max(...cuentas[c].values()) / 520;
    resumen.push(`${c} ${(mejor * 100).toFixed(0)}%`);
    /**
     * El listón: ninguna pregunta se acierta más del 40% contestando siempre lo
     * mismo. Dos de las cuatro respuestas se eligen antes de buscar el programa
     * justamente para esto — sin eso la profundidad daba 55% y los hijos
     * directos 40%.
     */
    assert.ok(mejor < 0.4,
      `Contestando siempre lo mismo se acierta "${c}" el ${(mejor * 100).toFixed(0)}% de las veces: la pregunta no mide`);
  }
  console.log(`  ✓ La mejor conjetura ciega de cada pregunta: ${resumen.join(" · ")}`);
}

// 6. El techo duro protege al proceso
{
  /**
   * `simular` corre DENTRO del proceso que atiende el multijugador de /escapecv
   * y de Agarrá.io, así que un programa explosivo no puede tirarlo. Dos bucles de
   * fork anidados dan 2^(n*m) procesos: el primer intento reventó con "Map
   * maximum size exceeded" antes de llegar a la verificación. Por eso el techo
   * vive en el simulador y no sólo en el generador.
   */
  const bomba = [];
  for (let i = 0; i < 8; i++) bomba.push({ tipo: "bucle", veces: 3 });
  const t0 = process.hrtime.bigint();
  const s = simular(bomba);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(s.desbordo, true, "Ocho bucles de tres fork tienen que marcar desborde");
  assert.ok(s.total <= 4097, `Se crearon ${s.total} procesos pese al techo`);
  assert.ok(ms < 500, `Abortar el desborde tardó ${ms.toFixed(0)} ms`);
  console.log(`  ✓ Una bomba de 2^24 procesos aborta en ${ms.toFixed(1)} ms sin pasar de ${s.total}`);
}

// 7. Lo que viaja al cliente no lleva las respuestas
{
  const pub = programaPublico(88);
  assert.deepStrictEqual(Object.keys(pub).sort(), ["dia", "etiqueta", "lineas"]);
  assert.ok(!("programa" in pub),
    "El árbol de sentencias NO puede salir: con esa estructura se simula sin leer una línea de C");
  assert.ok(Array.isArray(pub.lineas));
  const json = JSON.stringify(pub);
  assert.ok(!json.includes("esperadas"));
  assert.ok(json.length < 2500, `El payload de un día son ${json.length} bytes`);
  console.log(`  ✓ El público lleva el listado y la etiqueta, y pesa ${json.length} bytes`);
}

// 8. La corrección
{
  const DIA = 150;
  const buenas = respuestasDe(DIA);

  const perfecta = corregir(DIA, buenas);
  assert.strictEqual(perfecta.mal, 0);
  assert.strictEqual(perfecta.perfecto, true);
  assert.deepStrictEqual(perfecta.detalle, { total: true, etiqueta: true, hijosDirectos: true, profundidad: true });

  const unaMal = corregir(DIA, { ...buenas, total: buenas.total + 1 });
  assert.strictEqual(unaMal.mal, 1);
  assert.strictEqual(unaMal.detalle.total, false);
  assert.strictEqual(unaMal.detalle.profundidad, true, "Las otras tres siguen bien");

  // El error clásico: contar los fork y elevar dos a esa potencia.
  const potencia = corregir(DIA, { ...buenas, total: 16 });
  assert.ok(potencia.mal >= 1);

  for (const malo of [null, undefined, "4", 4, [], { total: 1 }, { ...buenas, total: -1 }, { ...buenas, etiqueta: NaN }]) {
    assert.strictEqual(typeof corregir(DIA, malo).error, "string",
      `${JSON.stringify(malo)} tendría que ser rechazado`);
  }
  console.log(`  ✓ Corrige las cuatro por separado (día ${DIA}: ${buenas.total} procesos, ${buenas.etiqueta} impresiones, ${buenas.hijosDirectos} hijos, profundidad ${buenas.profundidad})`);
}

// 9. El envío es uno por día y no devuelve las respuestas
{
  const DIA = 250;
  const buenas = respuestasDe(DIA);
  const store = {
    daily: {},
    recordCompletion(dia, playerId, playerName, attempts, solved) {
      (this.daily[dia] = this.daily[dia] || []).push({ playerId, playerName, attempts, solved });
    },
  };

  const r = registrarIntento(store, { dia: DIA, playerId: "p1", playerName: "defe", respuesta: buenas });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mal, 0);
  assert.strictEqual(store.daily[DIA][0].attempts, 0, "Se rankea por cuántas erró");
  assert.strictEqual(store.daily[DIA][0].solved, true);

  // La forma exacta, no una búsqueda de strings: en el test de La pila de palas
  // busqué el string `"r7"` y falló porque era el nombre de una clave que va a
  // propósito. Buscar un nombre no verifica nada sobre el valor.
  assert.deepStrictEqual(Object.keys(r).sort(), ["detalle", "mal", "ok", "perfecto"]);
  assert.ok(!("esperadas" in r), "Las respuestas correctas no pueden volver al cliente");
  for (const v of Object.values(r.detalle)) assert.strictEqual(typeof v, "boolean");

  const otra = registrarIntento(store, { dia: DIA, playerId: "p1", respuesta: buenas });
  assert.strictEqual(otra.yaJugado, true);
  assert.strictEqual(store.daily[DIA].length, 1, "No se puede pisar el puntaje jugando de nuevo");
  assert.ok(!("esperadas" in otra), "Ni el rechazo puede filtrar las respuestas");

  const todoMal = registrarIntento(store, {
    dia: DIA, playerId: "p2", playerName: "distraído",
    respuesta: { total: 1, etiqueta: 1, hijosDirectos: 1, profundidad: 1 },
  });
  assert.ok(todoMal.mal >= 3);
  assert.strictEqual(todoMal.perfecto, false);

  assert.ok(registrarIntento(store, { dia: 0, playerId: "p9", respuesta: buenas }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "", respuesta: buenas }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "p9", respuesta: "4" }).error);
  console.log("  ✓ Un envío por día, puntaje de 0 a 4, y las cuatro respuestas no salen nunca");
}

// 10. El costo, en frío y en caliente
{
  /**
   * Las dos medidas importan por motivos distintos. La de CALIENTE es la que ve
   * casi todo pedido, porque el programa del día está memorizado: tiene que ser
   * prácticamente gratis. La de FRÍO la paga el primer pedido de cada día, y lo
   * que la acota no es la impaciencia del jugador sino que esto corre en el
   * mismo hilo mono-tarea que atiende el multijugador: un bloqueo largo sería un
   * tirón para todos los que estén en una partida. Unas decenas de milisegundos
   * una vez por día son uno o dos ticks perdidos y nadie los nota; los 487 ms a
   * los que llegó una versión anterior sí se habrían visto.
   */
  const frio = [];
  for (let dia = 9000; dia < 9040; dia++) {
    const t = process.hrtime.bigint();
    programaPublico(dia);
    frio.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  const medioFrio = frio.reduce((a, b) => a + b, 0) / frio.length;
  const peorFrio = Math.max(...frio);
  assert.ok(medioFrio < 200, `Generar un programa nuevo tarda ${medioFrio.toFixed(0)} ms de media`);
  assert.ok(peorFrio < 900, `El peor día tardó ${peorFrio.toFixed(0)} ms`);

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 2000; i++) programaPublico(9001);
  const caliente = Number(process.hrtime.bigint() - t0) / 1e6 / 2000;
  assert.ok(caliente < 0.05, `Un pedido con el día ya generado tarda ${caliente.toFixed(4)} ms`);

  console.log(`  ✓ En frío ${medioFrio.toFixed(0)} ms de media (peor ${peorFrio.toFixed(0)}), en caliente ${caliente.toFixed(4)} ms`);
}

console.log("\n¡Todos los tests de El árbol de pelados pasaron exitosamente!");
console.log("Recordá: la semántica contra el kernel de verdad se verifica aparte, con");
console.log("  node multiplayer-server/verificar-fork.js 150");
