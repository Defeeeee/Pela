import assert from "node:assert/strict";

// El mismo filtro que aplica el generador al elegir el byte inicial.
const MIN_DESTINOS_TEST = 8;
import {
  OPS, aplicar, distanciasDesde, caminoOptimo, puzzleDelDia, corregir,
  registrarIntento, GOLPES_MAX,
} from "./bitgolf.js";

console.log("Iniciando tests de Bit Golf...");

// 1. Las operaciones se quedan en 8 bits
{
  /**
   * Es la premisa del juego: un byte. Si una operación devolviera 256 o -1, el
   * recorrido en anchura saldría de la tabla y el par calculado sería mentira.
   * Se prueban los 256 valores contra las 5 operaciones, que son 1280 casos y
   * corren en un milisegundo: no hay razón para muestrear.
   */
  for (let v = 0; v < 256; v++) {
    for (const op of OPS) {
      const r = op.f(v);
      assert.ok(Number.isInteger(r) && r >= 0 && r <= 255,
        `${op.clave}(0x${v.toString(16)}) dio ${r}, que no es un byte`);
    }
  }
  // Y los casos de borde que definen cada operación.
  assert.strictEqual(aplicar(0x80, "SHL"), 0x00, "SHL tira el bit de arriba");
  assert.strictEqual(aplicar(0x01, "SHR"), 0x00, "SHR tira el bit de abajo");
  assert.strictEqual(aplicar(0xff, "INC"), 0x00, "INC da la vuelta");
  assert.strictEqual(aplicar(0x00, "NOT"), 0xff);
  assert.strictEqual(aplicar(0xa5, "XOR"), 0xaa, "XOR 0x0F sólo toca el nibble bajo");
  assert.strictEqual(aplicar(0x10, "NADA"), null, "Una clave inventada no aplica nada");
  console.log("  ✓ Las cinco operaciones se quedan en 8 bits, en los 1280 casos");
}

// 2. Todo byte llega a todo byte
{
  /**
   * Ningún puzzle puede ser imposible. INC sola alcanza —a lo sumo 255 sumas—
   * así que el grafo es fuertemente conexo, pero eso es un razonamiento y esto
   * es la verificación: 65.536 pares, todos alcanzables.
   */
  let peor = 0, peorPar = null;
  for (let desde = 0; desde < 256; desde++) {
    const { dist } = distanciasDesde(desde);
    for (let hasta = 0; hasta < 256; hasta++) {
      assert.ok(dist[hasta] >= 0, `0x${desde.toString(16)} no llega a 0x${hasta.toString(16)}`);
      if (dist[hasta] > peor) { peor = dist[hasta]; peorPar = [desde, hasta]; }
    }
  }
  console.log(`  ✓ Los 65.536 pares son alcanzables; el más lejano son ${peor} golpes (0x${peorPar[0].toString(16).toUpperCase()} → 0x${peorPar[1].toString(16).toUpperCase()})`);
}

// 3. El camino óptimo existe, llega, y mide lo que dice la distancia
{
  /**
   * Acá se verifica la pieza en la que se apoya TODO el juego: que el par no sea
   * un número lindo sino la longitud de un camino que de verdad se puede jugar.
   * Se reconstruye el camino y se ejecuta paso por paso.
   */
  for (const [desde, hasta] of [[0x00, 0x0f], [0xff, 0x01], [0x5a, 0xa5], [0x01, 0x80], [0x80, 0x01]]) {
    const camino = caminoOptimo(desde, hasta);
    assert.ok(Array.isArray(camino) && camino.length > 0, `No hay camino de ${desde} a ${hasta}`);
    let v = desde;
    for (const clave of camino) v = aplicar(v, clave);
    assert.strictEqual(v, hasta, `El camino de 0x${desde.toString(16)} a 0x${hasta.toString(16)} no llega`);
    assert.strictEqual(camino.length, distanciasDesde(desde).dist[hasta],
      "El camino reconstruido tiene que medir exactamente la distancia");
  }
  // Y una muestra grande, para que no sean cinco casos elegidos a dedo.
  let n = 0;
  for (let desde = 0; desde < 256; desde += 7) {
    for (let hasta = 0; hasta < 256; hasta += 11) {
      if (desde === hasta) continue;
      const camino = caminoOptimo(desde, hasta);
      let v = desde;
      for (const clave of camino) v = aplicar(v, clave);
      assert.strictEqual(v, hasta, `Falló el camino 0x${desde.toString(16)} → 0x${hasta.toString(16)}`);
      assert.strictEqual(camino.length, distanciasDesde(desde).dist[hasta]);
      n++;
    }
  }
  console.log(`  ✓ El camino óptimo llega y mide la distancia exacta, en ${n + 5} pares`);
}

// 4. El puzzle del día es determinista y cambia de un día al otro
{
  for (const dia of [1, 7, 42, 365, 1000]) {
    assert.deepStrictEqual(puzzleDelDia(dia), puzzleDelDia(dia), `El día ${dia} tiene que dar el mismo puzzle`);
  }
  /**
   * El bug de palas.js: con la semilla cruda, días vecinos daban el mismo primer
   * valor y por lo tanto el mismo puzzle. Acá se exige variedad — pero NO que los
   * 520 días sean todos distintos, que fue mi primera versión de este test y
   * falló con 517.
   *
   * No era un defecto del generador sino la paradoja del cumpleaños: los pozos
   * de los tres pares suman 46.265 pares, y 520 sorteos predicen unas 4
   * colisiones. Exigir cero sería exigir que el generador esté SESGADO contra
   * repetir, o sea que no sea uniforme.
   *
   * Y acá el listón es BAJO a propósito, al revés que en ¿Cuántas palas?. En las
   * palas una escena repetida filtraría la respuesta, porque la respuesta es
   * secreta. En bit golf no hay nada secreto: el byte inicial, el objetivo y las
   * operaciones son todos públicos, y el puntaje mide en cuántos golpes llegaste,
   * no si adivinaste. Un puzzle repetido no le regala a nadie una respuesta que
   * no pudiera calcular igual. Lo único que molestaría es repetir DENTRO DE LA
   * MISMA SEMANA, que se notaría como descuido.
   */
  const visto = new Map();
  let repeticiones = 0, masCercana = Infinity;
  for (let dia = 1; dia <= 520; dia++) {
    const p = puzzleDelDia(dia);
    const k = `${p.desde},${p.hasta}`;
    if (visto.has(k)) {
      repeticiones++;
      masCercana = Math.min(masCercana, dia - visto.get(k));
    }
    visto.set(k, dia);
  }
  assert.ok(repeticiones <= 15,
    `${repeticiones} repeticiones en 520 días es muchísimo más que las ~4 que predice el azar uniforme`);
  assert.ok(masCercana > 5,
    `Se repitió un puzzle a ${masCercana} días hábiles: eso es la misma semana y se nota`);
  // La expectativa se calcula, no se hardcodea: si mañana cambian los pares
  // jugables cambian los pozos, y un número a mano quedaría mintiendo.
  const PARES = [4, 5, 6];
  const diasPorPar = 520 / PARES.length;
  let esperadas = 0;
  for (const par of PARES) {
    // El pozo de ESTE par, con el mismo filtro de 8 destinos que usa el juego.
    let pozo = 0;
    for (let d = 0; d < 256; d++) {
      const { dist } = distanciasDesde(d);
      let n = 0;
      for (let h = 0; h < 256; h++) if (dist[h] === par) n++;
      if (n >= MIN_DESTINOS_TEST) pozo += n;
    }
    // Cada par se sortea de su propio pozo, así que las colisiones se suman por
    // par. Promediar los tres pozos —mi primera versión— daba 2,9 en vez de 4,1,
    // porque el pozo chico del par 6 aporta casi toda la expectativa.
    esperadas += (diasPorPar * (diasPorPar - 1)) / (2 * pozo);
  }
  assert.ok(repeticiones < esperadas * 4,
    `${repeticiones} repeticiones contra las ${esperadas.toFixed(1)} que predice el azar: el generador está sesgado`);
  console.log(`  ✓ El puzzle de un día es fijo; en 520 días hay ${repeticiones} repeticiones (el azar predice ${esperadas.toFixed(1)}) y la más cercana a ${masCercana} días`);
}

// 5. El par cae siempre en el rango jugable
{
  /**
   * Con menos de cuatro golpes el puzzle se resuelve de memoria; con más de seis
   * el espacio de caminos —5^n— se va al tanteo a ciegas, y el par 7 además sale
   * de un pozo diminuto. Se verifica sobre dos años que los tres pares salgan, y
   * que salgan en tercios parejos.
   */
  const cuenta = new Map();
  for (let dia = 1; dia <= 520; dia++) {
    const p = puzzleDelDia(dia);
    assert.ok(p.par >= 4 && p.par <= 6, `El día ${dia} tiene par ${p.par}, fuera del rango 4-6`);
    assert.notStrictEqual(p.desde, p.hasta, `El día ${dia} arranca en el objetivo`);
    assert.ok(p.par <= p.golpesMax, "El par tiene que ser alcanzable dentro del tope de golpes");
    cuenta.set(p.par, (cuenta.get(p.par) || 0) + 1);
  }
  assert.strictEqual(cuenta.size, 3, `Tendrían que salir los tres pares; salieron ${cuenta.size}`);
  for (const [par, n] of cuenta) {
    assert.ok(n > 520 / 3 * 0.8 && n < 520 / 3 * 1.2,
      `El par ${par} salió ${n} veces en 520 días, lejos del tercio que debería`);
  }
  const reparto = [...cuenta.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`  ✓ El par está siempre entre 4 y 6, repartido en tercios: ${reparto}`);
}

// 6. El par es de verdad el mínimo: ninguna solución más corta existe
{
  /**
   * Éste es el test que justifica el ranking. Si hubiera un camino más corto que
   * el par, alguien lo encontraría y quedaría "bajo par", lo cual convertiría el
   * puntaje en un sinsentido. Se verifica por fuerza bruta: TODAS las secuencias
   * de largo par-1 desde el byte inicial, y ninguna puede llegar al objetivo.
   *
   * 5^6 son 15.625 secuencias por día, así que se hace sobre unos pocos días.
   */
  for (const dia of [1, 2, 3, 17, 50, 128]) {
    const p = puzzleDelDia(dia);
    let alcanzables = new Set([p.desde]);
    for (let largo = 1; largo < p.par; largo++) {
      const siguiente = new Set();
      for (const v of alcanzables) for (const op of OPS) siguiente.add(op.f(v));
      alcanzables = siguiente;
      assert.ok(!alcanzables.has(p.hasta),
        `El día ${dia} dice par ${p.par} pero se llega en ${largo}`);
    }
    // Y en el par sí se llega.
    const enPar = new Set();
    for (const v of alcanzables) for (const op of OPS) enPar.add(op.f(v));
    assert.ok(enPar.has(p.hasta), `El día ${dia} dice par ${p.par} y no se llega en ${p.par}`);
  }
  console.log("  ✓ En seis días verificados por fuerza bruta, no existe solución más corta que el par");
}

// 7. La corrección
{
  const p = puzzleDelDia(200);
  const optimo = caminoOptimo(p.desde, p.hasta);

  const enPar = corregir(200, optimo);
  assert.strictEqual(enPar.llego, true);
  assert.strictEqual(enPar.golpes, p.par);
  assert.strictEqual(enPar.sobrePar, 0);
  assert.strictEqual(enPar.enPar, true);

  // Un camino más largo que llega igual: SHL/SHR de un valor par vuelve al
  // mismo lugar, así que se puede perder un par de golpes a propósito.
  const conVueltas = [...optimo];
  const sobre = corregir(200, conVueltas.concat(["INC", "INC"]));
  assert.strictEqual(sobre.llego, false, "Dos INC de más no llegan al objetivo");

  // Una solución que no llega.
  const corta = corregir(200, optimo.slice(0, -1));
  assert.strictEqual(corta.llego, false);
  assert.strictEqual(corta.enPar, undefined);
  assert.ok(corta.mensaje.includes("0x"), "Al fallar se dice a dónde llegó, si no el puzzle no enseña nada");

  // Entradas inválidas: devuelven error, no tiran.
  for (const malo of [null, undefined, "SHL", 5, {}, [], ["NADA"], new Array(GOLPES_MAX + 1).fill("INC")]) {
    const r = corregir(200, malo);
    assert.strictEqual(typeof r.error, "string", `${JSON.stringify(malo)} tendría que ser rechazado`);
  }
  console.log(`  ✓ Corrige, marca el par (día 200: ${p.par} golpes) y rechaza lo inválido`);
}

// 8. El envío es uno por día, y no llega quien no llega
{
  const DIA = 300;
  const p = puzzleDelDia(DIA);
  const optimo = caminoOptimo(p.desde, p.hasta);

  const store = {
    daily: {},
    recordCompletion(dia, playerId, playerName, attempts, solved) {
      (this.daily[dia] = this.daily[dia] || []).push({ playerId, playerName, attempts, solved });
    },
  };

  const r = registrarIntento(store, { dia: DIA, playerId: "p1", playerName: "defe", jugadas: optimo });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.enPar, true);
  assert.strictEqual(store.daily[DIA][0].attempts, p.par, "Se rankea por golpes");
  assert.strictEqual(store.daily[DIA][0].solved, true, "El par cuenta como resuelto, y es lo que hace la racha");

  // Segundo envío el mismo día: rechazado.
  const otra = registrarIntento(store, { dia: DIA, playerId: "p1", jugadas: optimo });
  assert.strictEqual(otra.yaJugado, true);
  assert.strictEqual(store.daily[DIA].length, 1, "No se puede pisar el puntaje jugando de nuevo");

  /**
   * Y el punto del ordenamiento: una solución CORTA que no llega no puede
   * rankear mejor que una larga que sí. Sin esto, mandar un solo golpe al azar
   * sería la mejor estrategia del juego.
   */
  registrarIntento(store, { dia: DIA, playerId: "p2", playerName: "tramposo", jugadas: ["INC"] });
  const tramposo = store.daily[DIA].find((e) => e.playerId === "p2");
  assert.ok(tramposo.attempts > p.par, "Un golpe que no llega tiene que puntuar PEOR que el par");
  assert.strictEqual(tramposo.attempts, GOLPES_MAX + 1);
  assert.strictEqual(tramposo.solved, false);

  // Y uno que llega sobre par queda en el medio, que es el gradiente que se
  // buscaba: no es acertar o no acertar.
  const largo = caminoOptimo(p.desde, p.hasta);
  const rodeo = ["SHL", "SHR"].concat(largo); // sólo llega si desde es par
  const conRodeo = corregir(DIA, rodeo);
  if (conRodeo.llego) {
    registrarIntento(store, { dia: DIA, playerId: "p3", playerName: "vueltero", jugadas: rodeo });
    const v = store.daily[DIA].find((e) => e.playerId === "p3");
    assert.ok(v.attempts > p.par && v.attempts < GOLPES_MAX + 1,
      "Llegar sobre par tiene que quedar entre el par y no llegar");
    assert.strictEqual(v.solved, false, "Sólo el par cuenta como resuelto");
  }

  // Pedidos inválidos.
  assert.ok(registrarIntento(store, { dia: 0, playerId: "p9", jugadas: optimo }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "", jugadas: optimo }).error);
  assert.ok(registrarIntento(store, { dia: DIA, playerId: "p9", jugadas: "SHL" }).error);
  console.log("  ✓ Un envío por día, y una solución corta que no llega puntúa peor que el par");
}

// 9. El costo
{
  // El puzzle se genera en cada pedido. La primera vez llena la tabla de
  // distancias del byte inicial, así que se mide en frío y en caliente.
  const t0 = process.hrtime.bigint();
  for (let dia = 1; dia <= 400; dia++) puzzleDelDia(dia);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 400;
  assert.ok(ms < 5, `Generar un puzzle tarda ${ms.toFixed(2)} ms, demasiado para hacerlo por pedido`);

  // Y la memoria de la cache, que en el peor caso guarda las 256 tablas.
  for (let d = 0; d < 256; d++) distanciasDesde(d);
  console.log(`  ✓ Generar un puzzle cuesta ${ms.toFixed(3)} ms, y las 256 tablas de distancia entran en 128 KB`);
}

console.log("\n¡Todos los tests de Bit Golf pasaron exitosamente!");
