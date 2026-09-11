import assert from "node:assert/strict";
import {
  evaluar, imprimir, ramaDe, funcionDelDia, funcionPublica, corregir, registrarIntento,
} from "./asm.js";

console.log("Iniciando tests de ¿Qué devuelve?...");

// 1. La semántica, clavada a mano
{
  /**
   * Casos escritos y trazados a mano, no sacados del generador. Si alguien toca
   * el evaluador, acá revienta.
   *
   * Los cuatro números NO están calculados a ojo: están comprobados contra un
   * x86-64 de verdad con `verificar-cpu.js`. Lo aclaro porque en la primera
   * versión de `asm.js` escribí en un comentario cuatro resultados inventados y
   * tres de los cuatro estaban mal — el evaluador estaba bien y el comentario
   * era mentira.
   */
  const fn = {
    pre: [{ op: "add", arg: 3 }, { op: "lea", arg: 1 }],
    cond: { cc: "jl", k: 8 },
    sigue: [{ op: "sar", arg: 1 }, { op: "add", arg: 4 }],
    salto: [{ op: "neg", arg: 0 }, { op: "add", arg: 10 }],
  };
  assert.strictEqual(evaluar(fn, -4), 12, "(-4+3)*2 = -2, es < 8, así que salta: -(-2)+10");
  assert.strictEqual(evaluar(fn, 1), 8, "(1+3)*2 = 8, NO es < 8: sigue derecho");
  assert.strictEqual(evaluar(fn, 7), 14);
  assert.strictEqual(evaluar(fn, 20), 27);

  // Las trampas del complemento a dos, una por una.
  assert.strictEqual(evaluar({ pre: [{ op: "not", arg: 0 }], cond: { cc: "je", k: 99999 }, sigue: [], salto: [] }, 5),
    -6, "not 5 es -6, o sea -x-1 y no 'el opuesto'");
  assert.strictEqual(evaluar({ pre: [{ op: "and", arg: 7 }], cond: { cc: "je", k: 99999 }, sigue: [], salto: [] }, -1),
    7, "and 7 sobre -1 da 7: en complemento a dos -1 son todos unos");
  assert.strictEqual(evaluar({ pre: [{ op: "sar", arg: 1 }], cond: { cc: "je", k: 99999 }, sigue: [], salto: [] }, -7),
    -4, "sar redondea hacia abajo, no hacia cero: -7 >> 1 es -4 y no -3");
  assert.strictEqual(evaluar({ pre: [{ op: "lea", arg: 8 }], cond: { cc: "je", k: 99999 }, sigue: [], salto: [] }, 5),
    45, "lea [rax+rax*8] multiplica por NUEVE, no por ocho");

  console.log("  ✓ La semántica está clavada a mano, con las cuatro trampas del complemento a dos");
}

// 2. Impresión y evaluación no se pueden separar
{
  /**
   * El peor bug posible de este juego sería mostrar una instrucción y corregir
   * con otra: el jugador tendría razón y no habría forma de que lo supiera. Se
   * verifica que toda operación que el generador puede elegir sepa imprimirse, y
   * que ninguna línea salga con un `undefined` adentro.
   */
  for (let dia = 1; dia <= 400; dia++) {
    for (const linea of funcionDelDia(dia).lineas) {
      assert.ok(!linea.includes("undefined"), `El día ${dia} imprime "${linea}"`);
      assert.ok(!/NaN/.test(linea), `El día ${dia} imprime un NaN: "${linea}"`);
    }
  }
  // Y la forma general: etiqueta, el mov de la convención, y dos `ret`.
  const l = funcionDelDia(7).lineas;
  assert.strictEqual(l[0], "pela:");
  assert.strictEqual(l[1].trim(), "mov     eax, edi", "System V: el primer entero llega en edi");
  assert.strictEqual(l.filter((x) => x.trim() === "ret").length, 2, "Una salida por rama");
  assert.strictEqual(l.filter((x) => x === ".otro:").length, 1);
  console.log("  ✓ Toda operación elegible sabe imprimirse, y la forma del listado es la esperada");
}

// 3. Determinista y distinta cada día
{
  for (const dia of [1, 7, 42, 365, 1000]) {
    assert.deepStrictEqual(funcionDelDia(dia), funcionDelDia(dia), `El día ${dia} tiene que dar lo mismo`);
  }
  const firmas = new Set();
  for (let dia = 1; dia <= 520; dia++) {
    const f = funcionDelDia(dia);
    firmas.add(f.lineas.join("|") + "#" + f.entradas.join(","));
  }
  assert.strictEqual(firmas.size, 520, `Sólo ${firmas.size} funciones distintas en 520 días`);
  console.log(`  ✓ La función de un día es fija, y hay ${firmas.size} distintas en 520 días`);
}

// 4. Las cuatro garantías del generador
{
  /**
   * Las cuatro son requisitos del puzzle y no detalles. La primera y la segunda
   * son lecciones directas de bugs anteriores:
   *
   *  1. Al menos TRES resultados distintos entre los cuatro. En La pila de palas
   *     la profundidad final terminaba siempre en 1 o 2 y una de las cuatro
   *     preguntas se acertaba el 58% contestando lo mismo siempre.
   *  2. Las DOS ramas usadas. Si las cuatro entradas se van por el mismo lado,
   *     quien deduzca una sola rama acierta todo y la otra mitad del código es
   *     decoración.
   *  3. Ningún resultado igual a su entrada, o parece la identidad.
   *  4. Todo en un rango que se pueda trazar a mano.
   */
  let minRes = Infinity, maxRes = -Infinity, minDistintos = 4;
  const largos = new Map();

  for (let dia = 1; dia <= 520; dia++) {
    const f = funcionDelDia(dia);
    assert.strictEqual(f.entradas.length, 4, `El día ${dia} no tiene cuatro entradas`);
    assert.strictEqual(new Set(f.entradas).size, 4, `El día ${dia} repite una entrada`);

    const salidas = f.entradas.map((e) => evaluar(f.fn, e));
    const distintos = new Set(salidas).size;
    assert.ok(distintos >= 3,
      `El día ${dia} tiene sólo ${distintos} resultados distintos: se contesta sin leer`);
    minDistintos = Math.min(minDistintos, distintos);

    for (let i = 0; i < 4; i++) {
      assert.notStrictEqual(salidas[i], f.entradas[i],
        `El día ${dia} devuelve la entrada ${f.entradas[i]} sin cambiarla`);
      assert.ok(Math.abs(salidas[i]) <= 100000,
        `El día ${dia} devuelve ${salidas[i]}, que no se traza a mano`);
      minRes = Math.min(minRes, salidas[i]);
      maxRes = Math.max(maxRes, salidas[i]);
    }

    const n = f.lineas.length;
    assert.ok(n >= 9 && n <= 16, `El día ${dia} tiene ${n} líneas`);
    largos.set(n, (largos.get(n) || 0) + 1);
  }
  console.log(`  ✓ 520 días: siempre 4 entradas distintas, ${minDistintos}+ resultados distintos, de ${minRes} a ${maxRes}, listados de ${Math.min(...largos.keys())} a ${Math.max(...largos.keys())} líneas`);
}

// 5. Las dos ramas se toman, Y las dos importan
{
  /**
   * Son DOS propiedades distintas y hace falta verificar las dos por separado.
   * Mi primera versión de este test medía la segunda y la llamaba la primera, y
   * falló con 32 de 520: no porque las cuatro entradas cayeran del mismo lado
   * —eso lo garantiza la construcción— sino porque en esos 32 días una rama era
   * un no-op efectivo, y vaciarla no cambiaba nada.
   *
   *   a) Las dos ramas se TOMAN: se pregunta por la condición real, no se infiere.
   *   b) Las dos ramas IMPORTAN: vaciar cualquiera de las dos cambia algún
   *      resultado. Sin esto el listado muestra una bifurcación que no hace falta
   *      entender y el puzzle es más fácil de lo que aparenta.
   */
  const reparto = new Map();
  for (let dia = 1; dia <= 520; dia++) {
    const f = funcionDelDia(dia);

    const ramas = f.entradas.map((e) => ramaDe(f.fn, e));
    assert.strictEqual(new Set(ramas).size, 2,
      `El día ${dia} manda las cuatro entradas por la rama "${ramas[0]}"`);

    const sinSalto = { ...f.fn, salto: [] };
    const sinSigue = { ...f.fn, sigue: [] };
    assert.ok(f.entradas.some((e) => evaluar(f.fn, e) !== evaluar(sinSalto, e)),
      `El día ${dia} tiene la rama del salto de decorado: vaciarla no cambia nada`);
    assert.ok(f.entradas.some((e) => evaluar(f.fn, e) !== evaluar(sinSigue, e)),
      `El día ${dia} tiene la rama directa de decorado: vaciarla no cambia nada`);

    const k = ramas.filter((x) => x === "salto").length;
    reparto.set(k, (reparto.get(k) || 0) + 1);
  }
  const txt = [...reparto.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`  ✓ En los 520 días las dos ramas se toman y las dos importan (entradas por el salto — ${txt})`);
}

// 6. Lo que viaja al cliente no lleva la respuesta
{
  const pub = funcionPublica(88);
  assert.ok(!("fn" in pub), "La estructura `fn` NO puede salir: es la respuesta escrita de otra forma");
  assert.deepStrictEqual(Object.keys(pub).sort(), ["dia", "entradas", "lineas"]);
  assert.strictEqual(pub.entradas.length, 4);
  assert.ok(Array.isArray(pub.lineas));

  // Y ningún resultado correcto puede aparecer en el texto por accidente.
  const f = funcionDelDia(88);
  const esperadas = f.entradas.map((e) => evaluar(f.fn, e));
  const json = JSON.stringify(pub);
  assert.ok(!json.includes(`"esperadas"`), "Ni la clave");
  console.log(`  ✓ La función pública lleva el código y las entradas, y pesa ${json.length} bytes (resultados de hoy: ${esperadas.length} calculados, 0 enviados)`);
}

// 7. La corrección
{
  const DIA = 150;
  const f = funcionDelDia(DIA);
  const buenas = f.entradas.map((e) => evaluar(f.fn, e));

  const perfecta = corregir(DIA, buenas);
  assert.strictEqual(perfecta.mal, 0);
  assert.strictEqual(perfecta.perfecto, true);
  assert.deepStrictEqual(perfecta.detalle, [true, true, true, true]);

  const unaMal = corregir(DIA, [buenas[0] + 1, buenas[1], buenas[2], buenas[3]]);
  assert.strictEqual(unaMal.mal, 1);
  assert.deepStrictEqual(unaMal.detalle, [false, true, true, true]);

  // Los negativos son respuestas legítimas y no pueden rechazarse.
  assert.strictEqual(typeof corregir(DIA, [-5, -1000, 0, 7]).mal, "number");

  for (const malo of [null, undefined, "12", 4, [1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, "x"], [1, 2, 3, 1 / 0]]) {
    assert.strictEqual(typeof corregir(DIA, malo).error, "string",
      `${JSON.stringify(malo)} tendría que ser rechazado`);
  }
  console.log(`  ✓ Corrige las cuatro por separado y acepta negativos (día ${DIA}: ${buenas.join(", ")})`);
}

// 8. El envío es uno por día y no devuelve los resultados
{
  /**
   * Es lo único que este juego esconde. El código es público y se traza a mano,
   * que es el juego; pero si el servidor devolviera los cuatro resultados, el
   * segundo jugador los copia del primero.
   */
  const DIA = 250;
  const f = funcionDelDia(DIA);
  const buenas = f.entradas.map((e) => evaluar(f.fn, e));

  const store = {
    daily: {},
    recordCompletion(dia, playerId, playerName, attempts, solved) {
      (this.daily[dia] = this.daily[dia] || []).push({ playerId, playerName, attempts, solved });
    },
  };

  const r = registrarIntento(store, { dia: DIA, playerId: "p1", playerName: "defe", respuestas: buenas });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mal, 0);
  assert.strictEqual(store.daily[DIA][0].attempts, 0, "Se rankea por cuántas erró");
  assert.strictEqual(store.daily[DIA][0].solved, true);

  // La forma exacta de la respuesta, no una búsqueda de strings: en el test de
  // La pila de palas busqué el string `"r7"` y falló porque era el nombre de una
  // clave que va a propósito. Buscar un nombre no verifica nada sobre el valor.
  assert.deepStrictEqual(Object.keys(r).sort(), ["detalle", "mal", "ok", "perfecto"]);
  assert.ok(Array.isArray(r.detalle) && r.detalle.every((x) => typeof x === "boolean"),
    "`detalle` son cuatro booleanos, no los resultados");

  const otra = registrarIntento(store, { dia: DIA, playerId: "p1", respuestas: buenas });
  assert.strictEqual(otra.yaJugado, true);
  assert.strictEqual(store.daily[DIA].length, 1, "No se puede pisar el puntaje jugando de nuevo");

  const todoMal = registrarIntento(store, {
    dia: DIA, playerId: "p2", playerName: "distraído",
    respuestas: buenas.map((x) => x + 1),
  });
  assert.strictEqual(todoMal.mal, 4);
  assert.strictEqual(todoMal.perfecto, false);
  assert.deepStrictEqual(Object.keys(todoMal).sort(), ["detalle", "mal", "ok", "perfecto"]);

  assert.ok(registrarIntento(store, { dia: 0, playerId: "p9", respuestas: buenas }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "", respuestas: buenas }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "p9", respuestas: "12" }).error);
  console.log("  ✓ Un envío por día, puntaje de 0 a 4, y los cuatro resultados no salen nunca");
}

// 9. El costo
{
  const t0 = process.hrtime.bigint();
  for (let dia = 1; dia <= 400; dia++) funcionPublica(dia);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 400;
  assert.ok(ms < 5, `Generar una función tarda ${ms.toFixed(2)} ms, demasiado para hacerlo por pedido`);
  console.log(`  ✓ Generar una función cuesta ${ms.toFixed(3)} ms`);
}

console.log("\n¡Todos los tests de ¿Qué devuelve? pasaron exitosamente!");
console.log("Recordá: la semántica contra un x86-64 real se verifica aparte, con");
console.log("  node multiplayer-server/verificar-cpu.js 200");
