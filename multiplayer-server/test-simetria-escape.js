import assert from "node:assert/strict";
import { Room, TICK_MS, CORRAL_X, CORRAL_Y, CORRAL_W, CORRAL_H } from "./rooms.js";
import { codificar, TAM_OBS, SECTORES } from "./observacion-escape.js";
import { decodificar, mascara, NUM_ACCIONES, RUMBOS } from "./acciones-escape.js";
import { ESPEJOS, NUM_ESPEJOS, espejarObs, espejarMascara, desespejarAccion, espejoAlAzar } from "./simetria-escape.js";

console.log("Iniciando tests de simetría de escapecv...");

// El corral está centrado en el mundo, así que reflejar sobre estos ejes lo
// deja idéntico. Si dejara de estarlo, la simetría no existiría y este archivo
// entero perdería sentido: se verifica.
const EJE_X = CORRAL_X + CORRAL_W / 2;
const EJE_Y = CORRAL_Y + CORRAL_H / 2;

{
  assert.ok(Math.abs(EJE_X - 800) < 1e-9, "El corral tiene que estar centrado en x para que el espejo sea una simetría");
  assert.ok(Math.abs(EJE_Y - 450) < 1e-9, "Y en y también");
  console.log("  ✓ El corral está centrado: reflejarlo lo deja idéntico");
}

// 1. Las permutaciones son permutaciones, y son involuciones
{
  for (const e of ESPEJOS) {
    const vistosSec = new Set([...e.sectores]);
    assert.strictEqual(vistosSec.size, SECTORES, `${e.nombre}: los sectores deben ser una permutación`);
    const vistosAcc = new Set([...e.acciones]);
    assert.strictEqual(vistosAcc.size, NUM_ACCIONES, `${e.nombre}: las acciones deben ser una permutación`);
    assert.strictEqual(e.acciones[0], 0, `${e.nombre}: quieto tiene que quedarse quieto`);

    for (let s = 0; s < SECTORES; s++) {
      assert.strictEqual(e.sectores[e.sectores[s]], s, `${e.nombre}: la permutación de sectores debe ser involución`);
    }
    for (let a = 0; a < NUM_ACCIONES; a++) {
      assert.strictEqual(e.acciones[e.acciones[a]], a, `${e.nombre}: la permutación de acciones debe ser involución`);
    }
  }
  console.log(`  ✓ Los ${NUM_ESPEJOS} espejos permutan sectores y acciones, y son involuciones`);
}

// 2. La permutación de acciones es geométricamente correcta
{
  // Lo que importa: la acción espejada tiene que apuntar al vector reflejado.
  for (const e of ESPEJOS) {
    for (let a = 1; a < NUM_ACCIONES; a++) {
      const v = decodificar(a);
      const w = decodificar(e.acciones[a]);
      assert.ok(Math.abs(w.dx - v.dx * e.sx) < 1e-9,
        `${e.nombre}: la acción ${a} debía reflejar dx ${v.dx.toFixed(3)}·${e.sx} y dio ${w.dx.toFixed(3)}`);
      assert.ok(Math.abs(w.dy - v.dy * e.sy) < 1e-9,
        `${e.nombre}: la acción ${a} debía reflejar dy ${v.dy.toFixed(3)}·${e.sy} y dio ${w.dy.toFixed(3)}`);
    }
  }
  // Y los casos que se leen a mano, con el eje del mundo: la y crece hacia abajo.
  const H = ESPEJOS.find((e) => e.nombre === "horizontal");
  const V = ESPEJOS.find((e) => e.nombre === "vertical");
  const idx = (grados) => 1 + Math.round((grados / 360) * RUMBOS) % RUMBOS;
  assert.strictEqual(H.acciones[idx(0)], idx(180), "Espejo horizontal: derecha ↔ izquierda");
  assert.strictEqual(H.acciones[idx(90)], idx(90), "Espejo horizontal: abajo se queda abajo");
  assert.strictEqual(V.acciones[idx(90)], idx(270), "Espejo vertical: abajo ↔ arriba");
  assert.strictEqual(V.acciones[idx(0)], idx(0), "Espejo vertical: derecha se queda derecha");
  console.log("  ✓ Las acciones espejadas apuntan al vector reflejado (derecha↔izquierda, abajo↔arriba)");
}

// 3. La identidad no toca nada
{
  const id = ESPEJOS[0];
  assert.strictEqual(id.nombre, "identidad");
  const obs = new Float32Array(TAM_OBS);
  for (let i = 0; i < TAM_OBS; i++) obs[i] = Math.sin(i) * 0.7;
  const antes = Array.from(obs);
  espejarObs(obs, 0, id);
  assert.deepStrictEqual(Array.from(obs), antes, "La identidad no debe modificar la observación");
  for (let a = 0; a < NUM_ACCIONES; a++) assert.strictEqual(desespejarAccion(a, id), a);
  console.log("  ✓ La identidad deja la observación y las acciones intactas");
}

/** Refleja físicamente una sala: jugadores, enemigos y avisos. */
function reflejarSala(room, sx, sy) {
  const fx = (x) => (sx === -1 ? 2 * EJE_X - x : x);
  const fy = (y) => (sy === -1 ? 2 * EJE_Y - y : y);
  for (const p of room.players.values()) { p.x = fx(p.x); p.y = fy(p.y); }
  for (const e of room.enemies) { e.x = fx(e.x); e.y = fy(e.y); e.vx *= sx; e.vy *= sy; }
  for (const w of room.warnings) { w.x = fx(w.x); w.y = fy(w.y); w.vx *= sx; w.vy *= sy; }
}

function clonar(room) {
  const r = new Room(room.code, { isPublic: false, mode: room.mode, random: () => 0.5 });
  r.players.clear();
  for (const p of room.players.values()) r.players.set(p.id, { ...p, cells: undefined });
  r.beginPlaying();
  // beginPlaying reposiciona: se restauran las posiciones reales.
  for (const p of room.players.values()) {
    const q = r.players.get(p.id);
    q.x = p.x; q.y = p.y; q.alive = p.alive; q.size = p.size; q.speed = p.speed;
    q.reviveProgressMs = p.reviveProgressMs; q.isBeingRevived = p.isBeingRevived;
    q.immuneUntil = p.immuneUntil; q.survivedMs = p.survivedMs;
  }
  r.enemies = room.enemies.map((e) => ({ ...e }));
  r.warnings = room.warnings.map((w) => ({ ...w }));
  r.tiempo = room.tiempo;
  return r;
}

// 4. EL TEST QUE DECIDE: equivarianza
{
  /**
   * Codificar una sala físicamente espejada tiene que dar exactamente lo mismo
   * que espejar la codificación de la sala original.
   *
   * Es la propiedad de la que depende todo: si un canal quedó mal mapeado, cada
   * muestra de entrenamiento llegaría corrompida y en silencio, y lo único que
   * se vería es que el agente no aprende.
   */
  const rng = (s) => { let x = s >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const a1 = new Float32Array(TAM_OBS);
  const a2 = new Float32Array(TAM_OBS);

  let escenas = 0, peor = 0, peorCanal = -1;

  for (let semilla = 1; semilla <= 24; semilla++) {
    const room = new Room("EQ", { isPublic: false, mode: semilla % 2 ? "coop" : "battle", random: rng(semilla * 7919) });
    for (let i = 0; i < 4; i++) room.addPlayer(`p${i}`, `P${i}`);
    room.beginPlaying();

    // Se deja correr para tener escenas de verdad: palas entrando y saliendo,
    // jugadores muertos, avisos pendientes. Nada de posiciones alineadas al eje,
    // que caen justo en los bordes de sector y son medida cero.
    const r = rng(semilla * 104729);
    for (let t = 0; t < 400 + Math.floor(r() * 900); t++) {
      for (const p of room.players.values()) {
        if (!p.alive) continue;
        const ang = r() * Math.PI * 2;
        room.setInput(p.id, Math.cos(ang), Math.sin(ang));
      }
      if (room.tick(TICK_MS)) break;
    }
    if (!room.enemies.length) continue;

    for (const p of room.players.values()) {
      for (const e of ESPEJOS) {
        if (e.sx === 1 && e.sy === 1) continue;

        // Camino A: codificar y después espejar.
        codificar(room, p.id, a1, 0);
        espejarObs(a1, 0, e);

        // Camino B: espejar el mundo y después codificar.
        const gemela = clonar(room);
        reflejarSala(gemela, e.sx, e.sy);
        codificar(gemela, p.id, a2, 0);

        for (let i = 0; i < TAM_OBS; i++) {
          const d = Math.abs(a1[i] - a2[i]);
          if (d > peor) { peor = d; peorCanal = i; }
        }
        escenas++;
      }
    }
  }

  assert.ok(escenas > 200, `Hacen falta muchas escenas para que el test valga; hubo ${escenas}`);
  assert.ok(peor < 1e-5,
    `Equivarianza rota: el canal ${peorCanal} difiere en ${peor.toExponential(2)} entre espejar-y-codificar ` +
    `y codificar-y-espejar. Algún canal está mal mapeado en simetria-escape.js.`);

  console.log(`  ✓ Equivarianza exacta en ${escenas} comparaciones de escenas reales (peor diferencia ${peor.toExponential(1)})`);
}

// 5. Ida y vuelta de la observación
{
  const rng = (s) => { let x = s >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const room = new Room("IV", { isPublic: false, mode: "coop", random: rng(77) });
  for (let i = 0; i < 3; i++) room.addPlayer(`p${i}`, `P${i}`);
  room.beginPlaying();
  for (let t = 0; t < 600; t++) room.tick(TICK_MS);

  const o = new Float32Array(TAM_OBS);
  for (const e of ESPEJOS) {
    codificar(room, "p0", o, 0);
    const antes = Array.from(o);
    espejarObs(o, 0, e);
    espejarObs(o, 0, e);
    for (let i = 0; i < TAM_OBS; i++) {
      assert.ok(Math.abs(o[i] - antes[i]) < 1e-6, `${e.nombre}: aplicar el espejo dos veces debe volver al original (canal ${i})`);
    }
  }
  console.log("  ✓ Aplicar cualquier espejo dos veces devuelve la observación original");
}

// 6. La máscara también permuta, y la acción vuelve al marco del mundo
{
  const room = new Room("MSC", { isPublic: false, mode: "coop", random: () => 0.5 });
  room.addPlayer("yo", "Yo");
  room.beginPlaying();

  const msc = new Uint8Array(NUM_ACCIONES);
  mascara(room, "yo", msc, 0);
  for (const e of ESPEJOS) {
    const copia = new Uint8Array(msc);
    espejarMascara(copia, 0, e);
    assert.ok([...copia].every((v) => v === 1), `${e.nombre}: con todas legales, espejar la máscara las deja todas legales`);
  }

  // Con una máscara artificial, la permutación tiene que moverse donde
  // corresponde. Es lo que protegería el día que se agregue una acción
  // condicional, como un dash con enfriamiento.
  const H = ESPEJOS.find((e) => e.nombre === "horizontal");
  const art = new Uint8Array(NUM_ACCIONES);
  const idx = (g) => 1 + Math.round((g / 360) * RUMBOS) % RUMBOS;
  art[idx(0)] = 1; // sólo "derecha" es legal
  espejarMascara(art, 0, H);
  assert.strictEqual(art[idx(180)], 1, "Espejada, la legal pasa a ser izquierda");
  assert.strictEqual(art[idx(0)], 0, "Y derecha deja de serlo");

  console.log("  ✓ La máscara permuta con el espejo, incluso con acciones condicionales");
}

// 7. La acción elegida en el marco espejado vuelve al mundo correctamente
{
  // Es el circuito completo: el agente ve un mundo espejado, elige un rumbo en
  // ESE marco, y lo que se aplica al servidor tiene que ser el rumbo del mundo.
  for (const e of ESPEJOS) {
    for (let a = 0; a < NUM_ACCIONES; a++) {
      const enMundo = desespejarAccion(a, e);
      const v = decodificar(a);
      const w = decodificar(enMundo);
      assert.ok(Math.abs(w.dx - v.dx * e.sx) < 1e-9 && Math.abs(w.dy - v.dy * e.sy) < 1e-9,
        `${e.nombre}: la acción ${a} del marco espejado no vuelve bien al mundo`);
      // Y desespejar dos veces es la identidad.
      assert.strictEqual(desespejarAccion(enMundo, e), a);
    }
  }
  console.log("  ✓ Una acción elegida en el marco espejado vuelve al rumbo correcto del mundo");
}

// 8. El sorteo reparte los cuatro espejos
{
  const cuenta = new Map();
  for (let i = 0; i < 4000; i++) {
    const e = espejoAlAzar(i / 4000);
    cuenta.set(e.nombre, (cuenta.get(e.nombre) || 0) + 1);
  }
  assert.strictEqual(cuenta.size, NUM_ESPEJOS, "El sorteo tiene que poder devolver los cuatro");
  for (const [n, c] of cuenta) {
    assert.ok(c > 900 && c < 1100, `${n} salió ${c} veces de 4000, debería ser ~1000`);
  }
  // Y el borde: r=1 no debe salirse del arreglo.
  assert.ok(espejoAlAzar(0.9999999) !== undefined);
  assert.ok(espejoAlAzar(1) !== undefined, "r=1 no debe devolver undefined");
  console.log("  ✓ El sorteo reparte los cuatro espejos por igual y no se sale del arreglo");
}


// 9. El cableado completo en el entorno de entrenamiento
{
  /**
   * El test de extremo a extremo, y el que verifica que el espejo esté
   * realmente conectado: una política de RUMBO FIJO —siempre la misma acción—
   * tiene que terminar repartida entre las cuatro paredes, porque cada sala
   * interpreta ese rumbo en su propio marco.
   *
   * Sin espejos, las 200 salas se amontonan en la misma pared. Con espejos, en
   * las cuatro. Es exactamente el desperdicio de capacidad que la aumentación
   * viene a resolver, medido de la forma más directa posible.
   */
  const { EntornoVectorial } = await import("../entrenamiento-escape/entorno.js");

  const RUMBO_FIJO = 1 + Math.round((180 / 360) * RUMBOS) % RUMBOS; // "izquierda"

  const correr = (simetria) => {
    const env = new EntornoVectorial({
      salas: 200, agentesPorSala: 1, semilla: 4242,
      modoFijo: "coop", fraccionAvanzada: 0, simetria,
    });
    const acc = new Int32Array(env.nAgentes).fill(RUMBO_FIJO);
    for (let i = 0; i < 400; i++) env.paso(acc);

    const pared = { izquierda: 0, derecha: 0, arriba: 0, abajo: 0, ninguna: 0 };
    for (let g = 0; g < env.nAgentes; g++) {
      const p = env.salas[(g / env.porSala) | 0].players.get(env.ids[g]);
      if (!p || !p.alive) continue;
      const dIzq = p.x - (CORRAL_X + p.size / 2);
      const dDer = (CORRAL_X + CORRAL_W - p.size / 2) - p.x;
      const dArr = p.y - (CORRAL_Y + p.size / 2);
      const dAba = (CORRAL_Y + CORRAL_H - p.size / 2) - p.y;
      const m = Math.min(dIzq, dDer, dArr, dAba);
      if (m > 4) pared.ninguna++;
      else if (m === dIzq) pared.izquierda++;
      else if (m === dDer) pared.derecha++;
      else if (m === dArr) pared.arriba++;
      else pared.abajo++;
    }
    return pared;
  };

  const sin = correr(false);
  const con = correr(true);

  // Sin espejos: todos contra la misma pared, y ninguno contra la opuesta.
  assert.ok(sin.izquierda > 100, `Sin espejos, el rumbo fijo debe amontonar a la izquierda; hubo ${sin.izquierda}`);
  assert.strictEqual(sin.derecha, 0, "Sin espejos, nadie debe terminar en la pared opuesta");

  // Con espejos: el rumbo "izquierda" del marco de cada sala cae en la
  // izquierda o en la derecha del mundo, según su espejo horizontal. Los
  // espejos verticales no cambian un rumbo horizontal, así que arriba y abajo
  // siguen vacías: eso es correcto y vale asertarlo.
  assert.ok(con.izquierda > 40, `Con espejos debe haber agentes a la izquierda; hubo ${con.izquierda}`);
  assert.ok(con.derecha > 40, `Con espejos debe haber agentes a la DERECHA; hubo ${con.derecha}`);
  const razon = Math.max(con.izquierda, con.derecha) / Math.max(1, Math.min(con.izquierda, con.derecha));
  assert.ok(razon < 1.6, `El reparto izquierda/derecha debería ser parejo; salió ${razon.toFixed(2)}:1`);

  console.log(`  ✓ Cableado en el entorno: un rumbo fijo pasa de ${sin.izquierda}/${sin.derecha} (izq/der) sin espejos a ${con.izquierda}/${con.derecha} con espejos`);
}

console.log("\n¡Todos los tests de simetría de escapecv pasaron exitosamente!");
