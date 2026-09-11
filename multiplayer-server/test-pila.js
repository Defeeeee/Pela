import assert from "node:assert/strict";
import {
  simular, secuenciaDelDia, secuenciaPublica, corregir, registrarIntento,
  MEM, R7_INICIAL,
} from "./pila.js";

console.log("Iniciando tests de La pila de palas...");

// 1. La convención, clavada a mano
{
  /**
   * Éste es EL test del juego. Las tres reglas de la pila vacía-descendente se
   * verifican con una secuencia escrita a mano y trazada a mano, no con lo que
   * devuelva el generador. Si alguien cambia `simular` para que R7 apunte al
   * tope —que es el error que el puzzle enseña a no cometer— acá revienta.
   */
  const uno = simular([{ op: "PUSH", pala: 1 }], 0x1e);
  assert.strictEqual(uno.mem[0x1e], 1, "La primera pala va DONDE APUNTA R7, no una abajo");
  assert.strictEqual(uno.r7, 0x1d, "Y después R7 BAJA: la pila crece hacia abajo");
  assert.strictEqual(uno.arriba, 1);
  assert.strictEqual(uno.mem[uno.r7 + 1], uno.arriba, "El tope está en R7 + 1, no en R7");
  assert.strictEqual(uno.mem[uno.r7], null, "Y en R7 no hay nada: es el próximo lugar LIBRE");

  const dos = simular([{ op: "PUSH", pala: 1 }, { op: "PUSH", pala: 2 }], 0x1e);
  assert.deepStrictEqual([dos.r7, dos.arriba, dos.cuantas], [0x1c, 2, 2]);
  assert.strictEqual(dos.mem[0x1d], 2, "La segunda pala va una dirección MÁS ABAJO que la primera");

  // POP no borra: es la tercera regla, y la que hace interesante al juego.
  const popeada = simular([{ op: "PUSH", pala: 1 }, { op: "PUSH", pala: 2 }, { op: "POP" }], 0x1e);
  assert.strictEqual(popeada.cuantas, 1, "Queda una sola pala en la pila");
  assert.strictEqual(popeada.arriba, 1);
  assert.strictEqual(popeada.r7, 0x1d);
  assert.strictEqual(popeada.mem[0x1d], 2, "PERO la pala 2 SIGUE en memoria: popear no borra nada");

  // Y un PUSH después de un POP la pisa.
  const pisada = simular([
    { op: "PUSH", pala: 1 }, { op: "PUSH", pala: 2 }, { op: "POP" }, { op: "PUSH", pala: 3 },
  ], 0x1e);
  assert.strictEqual(pisada.mem[0x1d], 3, "El PUSH pisa la pala colgada");
  assert.strictEqual(pisada.arriba, 3);
  assert.strictEqual(pisada.cuantas, 2);

  // Apilar y sacar todo deja R7 donde estaba, con la memoria sucia.
  const vuelta = simular([{ op: "PUSH", pala: 1 }, { op: "POP" }], 0x1e);
  assert.strictEqual(vuelta.r7, 0x1e, "Sacar todo devuelve R7 a su valor inicial");
  assert.strictEqual(vuelta.cuantas, 0);
  assert.strictEqual(vuelta.arriba, null, "Con la pila vacía no hay tope");
  assert.strictEqual(vuelta.mem[0x1e], 1, "Y la memoria queda sucia, que es lo normal");

  console.log("  ✓ La pila crece hacia abajo, R7 apunta al lugar libre y popear no borra");
}

// 2. El invariante se sostiene en cualquier secuencia
{
  /**
   * Lo de arriba son casos a mano. Esto es el invariante sobre secuencias al
   * azar: en todo momento, la pala de arriba está en R7 + 1 y en R7 no hay nada
   * escrito por la pila actual.
   */
  let semilla = 12345;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let caso = 0; caso < 2000; caso++) {
    const ops = [];
    let prof = 0, n = 1;
    for (let i = 0; i < 12; i++) {
      if (prof === 0 || rnd() < 0.55) { ops.push({ op: "PUSH", pala: n++ }); prof++; }
      else { ops.push({ op: "POP" }); prof--; }
    }
    // Se corre incrementalmente y se chequea el invariante en CADA paso.
    for (let k = 1; k <= ops.length; k++) {
      const e = simular(ops.slice(0, k), R7_INICIAL);
      assert.strictEqual(e.r7, R7_INICIAL - e.cuantas,
        "R7 tiene que ser el inicial menos la cantidad de palas apiladas");
      if (e.cuantas > 0) {
        assert.strictEqual(e.arriba, e.mem[e.r7 + 1], "El tope siempre está en R7 + 1");
      }
      assert.ok(e.r7 >= 0 && e.r7 < MEM, "R7 nunca se sale de la memoria");
    }
  }
  console.log("  ✓ En 2000 secuencias al azar, R7 = inicial − cantidad y el tope está siempre en R7 + 1");
}

// 3. La secuencia del día es determinista y varía
{
  for (const dia of [1, 7, 42, 365, 1000]) {
    assert.deepStrictEqual(secuenciaDelDia(dia), secuenciaDelDia(dia), `El día ${dia} tiene que dar lo mismo`);
  }
  const firmas = new Set();
  for (let dia = 1; dia <= 520; dia++) {
    const s = secuenciaDelDia(dia);
    firmas.add(JSON.stringify(s.ops) + "|" + s.consulta);
  }
  /**
   * Acá sí se exige que los 520 días sean distintos, y la exigencia tiene
   * historia: mi primera versión numeraba las palas 1, 2, 3 en orden de apilado,
   * y entonces la secuencia quedaba determinada por los PUSH/POP. Enumeré ese
   * espacio y son 3.111 secuencias válidas, así que salían 449 días distintos de
   * 520 — un puzzle repetido cada dos meses. Con las palas numeradas al azar el
   * espacio se vuelve enorme y la repetición desaparece.
   */
  assert.strictEqual(firmas.size, 520, `Sólo ${firmas.size} secuencias distintas en 520 días`);
  console.log(`  ✓ La secuencia de un día es fija, y hay ${firmas.size} distintas en 520 días`);
}

// 4. El generador cumple sus tres garantías, todos los días
{
  /**
   * Las tres son requisitos del puzzle y no detalles: una pila que se popea
   * vacía es un error de la máquina, una que termina vacía deja "cuál está
   * arriba" sin respuesta, y una sin palas pisadas se contesta con una sola idea
   * en vez de con las tres reglas.
   */
  let conPisada = 0, profMax = 0;
  const profundidades = new Map();
  for (let dia = 1; dia <= 520; dia++) {
    const s = secuenciaDelDia(dia);
    let prof = 0, pisada = false;
    for (let i = 0; i < s.ops.length; i++) {
      const o = s.ops[i];
      if (o.op === "POP") {
        assert.ok(prof > 0, `El día ${dia} popea la pila vacía en el paso ${i + 1}`);
        prof--;
      } else {
        if (i > 0 && s.ops[i - 1].op === "POP") pisada = true;
        prof++;
      }
      profMax = Math.max(profMax, prof);
    }
    assert.ok(prof >= 1, `El día ${dia} termina con la pila vacía`);
    assert.ok(pisada, `El día ${dia} no tiene ninguna pala pisada`);
    if (pisada) conPisada++;
    profundidades.set(prof, (profundidades.get(prof) || 0) + 1);

    // Y la dirección consultada nunca está dentro de la pila: si estuviera, la
    // pregunta sería la misma que "cuál está arriba" corrida un casillero.
    const fin = simular(s.ops, s.r7Inicial);
    assert.ok(s.consulta <= fin.r7,
      `El día ${dia} pregunta por 0x${s.consulta.toString(16)}, que está DENTRO de la pila`);
    assert.ok(s.consulta >= 0 && s.consulta < MEM);
  }
  const reparto = [...profundidades.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ");
  assert.strictEqual(conPisada, 520);

  /**
   * Y la profundidad final tiene que estar REPARTIDA, que es un bug que este
   * mismo test destapó al imprimir el reparto: con el corte anterior la pila
   * terminaba siempre con una o dos palas, y entonces "cuántas quedan" se
   * acertaba el 58% de las veces contestando 2 sin mirar nada. Una de las cuatro
   * preguntas no medía nada.
   */
  assert.ok(profundidades.size >= 4, `Sólo ${profundidades.size} profundidades finales distintas`);
  const masComun = Math.max(...profundidades.values()) / 520;
  assert.ok(masComun < 0.35,
    `Contestando siempre la profundidad más común se acierta el ${(masComun * 100).toFixed(0)}%: la pregunta no mide`);
  console.log(`  ✓ Nunca popea vacío, siempre queda al menos una pala (final ${reparto}, pico ${profMax}) y siempre hay una pisada`);
}

// 5. "Nada" es a veces la respuesta correcta
{
  /**
   * Si la dirección consultada tuviera SIEMPRE una pala colgada, el jugador
   * aprendería a descartar "nada" sin pensar, y ése es justo el razonamiento que
   * el puzzle quiere provocar. Se verifica que las dos respuestas aparezcan.
   */
  let conPala = 0, sinNada = 0;
  for (let dia = 1; dia <= 520; dia++) {
    const s = secuenciaDelDia(dia);
    const fin = simular(s.ops, s.r7Inicial);
    if (fin.mem[s.consulta] === null) sinNada++;
    else conPala++;
  }
  assert.ok(sinNada > 40, `Sólo ${sinNada} días de 520 tienen "nada" como respuesta: se vuelve descartable`);
  assert.ok(conPala > 200, `Sólo ${conPala} días preguntan por una pala colgada, que es la lección del juego`);
  console.log(`  ✓ En 520 días, ${conPala} preguntan por una pala colgada y ${sinNada} por una dirección vacía`);
}

// 6. Lo que viaja al cliente no lleva las respuestas
{
  const pub = secuenciaPublica(88);
  const json = JSON.stringify(pub);
  for (const clave of ["mem", "arriba", "cuantas", "r7Final", "esperado"]) {
    if (clave === "mem") {
      assert.strictEqual(typeof pub.mem, "number", "`mem` es el TAMAÑO de la memoria, no su contenido");
      continue;
    }
    assert.ok(!(clave in pub), `La secuencia pública no puede llevar \`${clave}\``);
  }
  // El jugador puede simular a mano —es el juego— pero el resultado calculado no
  // tiene por qué estar en la respuesta de red antes de que conteste.
  const fin = simular(secuenciaDelDia(88).ops, R7_INICIAL);
  assert.ok(!json.includes(`"r7":${fin.r7}`), "Ni de casualidad el R7 final");
  assert.ok(json.length < 1500, `El payload de un día son ${json.length} bytes`);
  assert.strictEqual(pub.r7Inicial, R7_INICIAL, "El R7 inicial sí va: es el punto de partida, es público");
  assert.ok(Array.isArray(pub.ops) && pub.ops.length >= 10);
  console.log(`  ✓ La secuencia pública lleva el punto de partida y las operaciones, y pesa ${json.length} bytes`);
}

// 7. La corrección de las cuatro respuestas
{
  const DIA = 150;
  const s = secuenciaDelDia(DIA);
  const fin = simular(s.ops, s.r7Inicial);
  const buena = { r7: fin.r7, arriba: fin.arriba, cuantas: fin.cuantas, enConsulta: fin.mem[s.consulta] };

  const perfecta = corregir(DIA, buena);
  assert.strictEqual(perfecta.mal, 0);
  assert.strictEqual(perfecta.perfecto, true);
  assert.deepStrictEqual(perfecta.detalle, { r7: true, arriba: true, cuantas: true, enConsulta: true });

  // El error clásico de la materia: creer que R7 apunta al tope.
  const errorClasico = corregir(DIA, { ...buena, r7: fin.r7 + 1 });
  assert.strictEqual(errorClasico.mal, 1);
  assert.strictEqual(errorClasico.detalle.r7, false);
  assert.strictEqual(errorClasico.detalle.arriba, true, "Las otras tres siguen bien");

  // Y "nada" se acepta como respuesta, escrito de las dos formas.
  const vacia = secuenciaDelDia(DIA);
  const finV = simular(vacia.ops, vacia.r7Inicial);
  if (finV.mem[vacia.consulta] === null) {
    assert.strictEqual(corregir(DIA, { ...buena, enConsulta: null }).detalle.enConsulta, true);
    assert.strictEqual(corregir(DIA, { ...buena, enConsulta: "nada" }).detalle.enConsulta, true);
  }

  // Entradas inválidas: error, no excepción.
  for (const malo of [null, undefined, "arriba", 5, { r7: 999 }, { ...buena, r7: -1 }, { ...buena, arriba: 0 }]) {
    assert.strictEqual(typeof corregir(DIA, malo).error, "string",
      `${JSON.stringify(malo)} tendría que ser rechazado`);
  }
  console.log(`  ✓ Corrige las cuatro por separado (día ${DIA}: R7=0x${fin.r7.toString(16).toUpperCase()}, pala ${fin.arriba} arriba, ${fin.cuantas} en la pila)`);
}

// 8. El envío es uno por día y no devuelve las respuestas
{
  /**
   * Éste es el único secreto que tiene el juego. La secuencia es pública y se
   * puede simular a mano, pero si el servidor devolviera las respuestas
   * correctas, el segundo jugador las copia del primero. Se devuelve CUÁLES
   * acertó —para que el resultado enseñe algo— y no cuál era la buena.
   */
  const DIA = 250;
  const s = secuenciaDelDia(DIA);
  const fin = simular(s.ops, s.r7Inicial);
  const buena = { r7: fin.r7, arriba: fin.arriba, cuantas: fin.cuantas, enConsulta: fin.mem[s.consulta] };

  const store = {
    daily: {},
    recordCompletion(dia, playerId, playerName, attempts, solved) {
      (this.daily[dia] = this.daily[dia] || []).push({ playerId, playerName, attempts, solved });
    },
  };

  const r = registrarIntento(store, { dia: DIA, playerId: "p1", playerName: "defe", respuesta: buena });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mal, 0);
  assert.strictEqual(r.perfecto, true);
  /**
   * Se clava la FORMA de la respuesta, no se busca un string.
   *
   * Mi primera versión pedía que `"r7"` no apareciera en el JSON, y falló: `r7`
   * es una de las cuatro claves de `detalle`, que va a propósito para decirle al
   * jugador cuáles acertó. Buscar el nombre de la clave no verifica nada sobre
   * el VALOR. Fijar el conjunto exacto de claves sí: si alguien agrega
   * `esperado` a la respuesta, esto revienta.
   */
  assert.deepStrictEqual(Object.keys(r).sort(), ["detalle", "mal", "ok", "perfecto"]);
  assert.deepStrictEqual(Object.keys(r.detalle).sort(), ["arriba", "cuantas", "enConsulta", "r7"]);
  for (const [k, v] of Object.entries(r.detalle)) {
    assert.strictEqual(typeof v, "boolean", `detalle.${k} tiene que ser un booleano, no la respuesta`);
  }
  assert.ok(!("esperado" in r), "La respuesta del envío no puede llevar las respuestas correctas");

  // Y el caso que de verdad importa: alguien que erra todo no puede deducir
  // nada de la respuesta más allá de que erró.
  const erroneo = registrarIntento(
    { daily: {}, recordCompletion() {} },
    { dia: DIA, playerId: "espia", respuesta: { ...buena, r7: fin.r7 === 0 ? 1 : fin.r7 - 1 } },
  );
  assert.strictEqual(erroneo.detalle.r7, false);
  assert.ok(!("esperado" in erroneo), "Ni errando se filtra el R7 correcto");
  assert.deepStrictEqual(Object.keys(erroneo).sort(), ["detalle", "mal", "ok", "perfecto"]);
  assert.strictEqual(store.daily[DIA][0].attempts, 0, "Se rankea por cuántas erró");
  assert.strictEqual(store.daily[DIA][0].solved, true);

  // Un segundo envío el mismo día se rechaza, y tampoco filtra nada.
  const otra = registrarIntento(store, { dia: DIA, playerId: "p1", respuesta: buena });
  assert.strictEqual(otra.yaJugado, true);
  assert.ok(!("esperado" in otra), "Ni el rechazo puede filtrar las respuestas");
  assert.strictEqual(store.daily[DIA].length, 1, "No se puede pisar el puntaje jugando de nuevo");

  // El que erra todo puntúa 4, que es el peor puntaje posible y sigue siendo un
  // puntaje: el gradiente va de 0 a 4 y no es acertar o no acertar.
  const todoMal = registrarIntento(store, {
    dia: DIA, playerId: "p2", playerName: "distraído",
    respuesta: {
      r7: fin.r7 + 3,
      arriba: s.valores.find((v) => v !== fin.arriba),
      cuantas: fin.cuantas + 2,
      enConsulta: null,
    },
  });
  assert.ok(todoMal.mal >= 3, `Erró casi todo y puntuó ${todoMal.mal}`);
  assert.strictEqual(todoMal.perfecto, false);

  assert.ok(registrarIntento(store, { dia: 0, playerId: "p9", respuesta: buena }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "", respuesta: buena }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "p9", respuesta: "buena" }).error);
  console.log("  ✓ Un envío por día, puntaje de 0 a 4, y las respuestas correctas no salen nunca");
}

// 9. El costo
{
  const t0 = process.hrtime.bigint();
  for (let dia = 1; dia <= 400; dia++) secuenciaPublica(dia);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 400;
  assert.ok(ms < 5, `Generar una secuencia tarda ${ms.toFixed(2)} ms, demasiado para hacerlo por pedido`);
  console.log(`  ✓ Generar una secuencia cuesta ${ms.toFixed(3)} ms`);
}

console.log("\n¡Todos los tests de La pila de palas pasaron exitosamente!");
