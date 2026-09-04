import assert from "node:assert/strict";
import {
  Arena,
  radiusForMass,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  INITIAL_MASS,
  PALA_MASS,
  EAT_MASS_RATIO,
  MIN_SPLIT_MASS,
  MAX_CELLS,
  crearCelula,
  sincronizarAgregados,
} from "./agarra.js";

console.log("Iniciando tests deterministas de Arena (Agarrá.io)...");

// Un jugador ahora es una lista de células y p.x/p.mass son agregados
// derivados, así que escribirlos directo no cambia la simulación. Este helper
// deja al jugador como un único pedazo en la posición y masa que pide el test.
function ubicar(p, x, y, mass) {
  p.cells = [crearCelula(x, y, mass)];
  sincronizarAgregados(p);
}

// 1. Radio crece como raíz de la masa
{
  const r20 = radiusForMass(20);
  const r80 = radiusForMass(80);
  // Al cuadruplicar masa (20 -> 80), el radio se debe duplicar: sqrt(80)/sqrt(20) = 2
  assert.ok(Math.abs(r80 / r20 - 2) < 0.05, `El radio debe crecer con sqrt(masa). r20=${r20}, r80=${r80}`);
  console.log("  ✓ Radio crece proporcional a sqrt(masa)");
}

// 2. Colisión jugador con palas
{
  const arena = new Arena();
  // Limpiar bots para prueba aislada
  arena.players.clear();

  const p = arena.addPlayer("p1", "Tester");
  ubicar(p, 500, 500, 20);

  // Colocar una pala justo en su posición
  const palaId = 99999;
  arena.palas.set(palaId, { id: palaId, x: 505, y: 505 });

  arena.tick(33);

  assert.strictEqual(arena.palas.has(palaId), false, "La pala debió ser comida");
  assert.strictEqual(p.mass, 20 + PALA_MASS, "La masa debió aumentar por la pala");
  console.log("  ✓ Comer pala incrementa masa y remueve la pala");
}

// 3. Colisión entre jugadores (Umbral 25% y cobertura del centro)
{
  const arena = new Arena();
  arena.players.clear();
  // También hay que sacar las palas: se comen ANTES que la colisión entre
  // jugadores dentro del mismo tick, así que una pala suelta cerca del grande
  // lo empuja por encima del umbral y el test falla una de cada tres corridas.
  arena.palas.clear();

  const pBig = arena.addPlayer("big", "Gigante");
  const pSmall = arena.addPlayer("small", "Chiquito");

  // Caso A: Masas iguales (20 vs 20) -> ninguno debe comerse al otro
  ubicar(pBig, 1000, 1000, 20);
  ubicar(pSmall, 1010, 1000, 20);

  arena.tick(33);
  assert.strictEqual(pBig.alive, true, "Con masas iguales ninguno come al otro");
  assert.strictEqual(pSmall.alive, true, "Con masas iguales ninguno come al otro");

  // Caso B: Borde del 24% (124 vs 100) -> 124 < 100 * 1.25 -> NO lo come
  ubicar(pBig, 1000, 1000, 124);
  ubicar(pSmall, 1010, 1000, 100);

  arena.tick(33);
  assert.strictEqual(pSmall.alive, true, "Con 24% de ventaja NO se debe comer al rival");

  // Caso C: Exactamente 25% (125 vs 100) -> SÍ lo come
  ubicar(pBig, 1000, 1000, 125);
  ubicar(pSmall, 1010, 1000, 100); // distancia 10px < radio ~44px

  arena.tick(33);
  assert.strictEqual(pSmall.alive, false, "Con 25% de ventaja el rival debe ser comido");
  assert.strictEqual(pBig.mass, 125 + 100, "El cazador debe absorber toda la masa de la víctima");
  console.log("  ✓ Regla de comida respeta el umbral estricto del 25% y transfiere masa");
}

// 4. Clamping contra los bordes del mapa
{
  const arena = new Arena();
  arena.players.clear();
  const p = arena.addPlayer("p1", "Borde");

  // Tratar de salir por la izquierda (x < 0)
  ubicar(p, 5, 2000, 25);
  p.dx = -1;
  p.dy = 0;
  arena.tick(1000); // 1 segundo moviéndose a la izquierda

  assert.ok(p.x >= p.radius, `x (${p.x}) no debe ser menor al radio (${p.radius})`);

  // Tratar de salir por abajo a la derecha
  ubicar(p, WORLD_WIDTH - 5, WORLD_HEIGHT - 5, 25);
  p.dx = 1;
  p.dy = 1;
  arena.tick(1000);

  assert.ok(p.x <= WORLD_WIDTH - p.radius, `x (${p.x}) no debe superar el ancho`);
  assert.ok(p.y <= WORLD_HEIGHT - p.radius, `y (${p.y}) no debe superar el alto`);
  console.log("  ✓ Clamping de bordes mantiene al jugador dentro del mapa");
}

// 5. La masa NO decae: lo que ganaste, te lo quedás
{
  const arena = new Arena();
  arena.players.clear();
  arena.palas.clear();
  const p = arena.addPlayer("p1", "Gordo");
  ubicar(p, 2000, 2000, 1000);

  // Se comprueba en cada tick, no sólo al final: el arena repone palas y el
  // gordo puede comer alguna, así que un chequeo final por igualdad exacta
  // sería frágil. Lo que importa es que nunca baje sola.
  let minima = p.mass;
  for (let i = 0; i < 30; i++) {
    arena.tick(1000); // 30 segundos simulados
    if (p.mass < minima) minima = p.mass;
  }
  assert.ok(minima >= 1000, `La masa nunca debe achicarse sola (bajó a ${minima})`);
  console.log("  ✓ La masa no decae con el tiempo");
}

// 6. Snapshot delta
{
  const arena = new Arena();
  const snap1 = arena.deltaSnapshot();
  assert.ok(Array.isArray(snap1.eaten), "Snapshot debe tener array eaten");
  assert.ok(Array.isArray(snap1.newPalas), "Snapshot debe tener array newPalas");
  assert.ok(Array.isArray(snap1.players), "Snapshot debe tener array players");
  assert.ok(Array.isArray(snap1.leaderboard), "Snapshot debe tener leaderboard");

  // El segundo snapshot inmediatamente después debe tener listas vacías de deltas
  const snap2 = arena.deltaSnapshot();
  assert.strictEqual(snap2.eaten.length, 0, "Deltas eaten deben limpiarse tras emisión");
  assert.strictEqual(snap2.newPalas.length, 0, "Deltas newPalas deben limpiarse tras emisión");
  console.log("  ✓ Snapshots emiten deltas y limpian buffer");
}

// 7. Medición de tamaño de payload de red
{
  const arena = new Arena();
  for (let i = 0; i < 12; i++) {
    arena.addPlayer(`user_${i}`, `Jugador ${i}`);
  }
  // Simular movimiento y comida
  for (let i = 0; i < 5; i++) arena.tick(33);

  const initPalasSize = JSON.stringify(arena.allPalas()).length;
  const deltaSnap = arena.deltaSnapshot();
  const deltaSize = JSON.stringify(deltaSnap).length;

  console.log(`  ✓ Tamaño payload inicial (600 palas): ${(initPalasSize / 1024).toFixed(2)} KB`);
  console.log(`  ✓ Tamaño snapshot delta (12 jugadores + deltas): ${(deltaSize / 1024).toFixed(2)} KB`);
  assert.ok(deltaSize < 3000, `El delta snapshot (${deltaSize} bytes) debe ser menor a 3KB`);
}

// 8. División (split)
{
  const arena = new Arena();
  arena.players.clear();
  arena.palas.clear();

  const p = arena.addPlayer("p1", "Divisor");
  p.cells[0].x = 2000;
  p.cells[0].y = 2000;
  p.cells[0].mass = 100;
  p.cells[0].radius = radiusForMass(100);
  arena.setInput("p1", 1, 0); // apuntando a la derecha
  sincronizarAgregados(p);

  const masaAntes = p.mass;
  arena.splitPlayer("p1");

  assert.strictEqual(p.cells.length, 2, "Dividirse debe dejar dos células");
  assert.ok(Math.abs(p.mass - masaAntes) < 0.001, `La masa total se conserva (${masaAntes} -> ${p.mass})`);
  assert.ok(p.cells.every((c) => Math.abs(c.mass - 50) < 0.001), "Cada mitad se queda con la mitad de la masa");
  console.log("  ✓ Dividirse parte la masa en dos y la conserva");

  // La mitad lanzada sale disparada hacia donde apuntaba
  const xAntes = Math.max(...p.cells.map((c) => c.x));
  arena.tick(100);
  const xDespues = Math.max(...p.cells.map((c) => c.x));
  assert.ok(xDespues > xAntes, "La célula lanzada se aleja en la dirección del input");
  console.log("  ✓ El pedazo lanzado sale con envión hacia donde apuntás");
}

// 9. No te podés dividir por debajo del mínimo ni pasar el máximo de células
{
  const arena = new Arena();
  arena.players.clear();
  arena.palas.clear();

  const chico = arena.addPlayer("chico", "Chico");
  chico.cells[0].mass = MIN_SPLIT_MASS - 1;
  chico.cells[0].radius = radiusForMass(chico.cells[0].mass);
  arena.splitPlayer("chico");
  assert.strictEqual(chico.cells.length, 1, "Por debajo del mínimo no se divide");

  const grande = arena.addPlayer("grande", "Grande");
  grande.cells[0].mass = 100000;
  grande.cells[0].radius = radiusForMass(100000);
  for (let i = 0; i < 10; i++) arena.splitPlayer("grande");
  assert.ok(grande.cells.length <= MAX_CELLS, `Nunca supera ${MAX_CELLS} células (tiene ${grande.cells.length})`);
  console.log("  ✓ Respeta la masa mínima y el techo de células");
}

// 10. Las células vuelven a fusionarse recién después del enfriamiento
{
  const arena = new Arena();
  arena.players.clear();
  arena.palas.clear();

  const p = arena.addPlayer("p1", "Fusion");
  p.cells[0].x = 2000;
  p.cells[0].y = 2000;
  p.cells[0].mass = 100;
  p.cells[0].radius = radiusForMass(100);
  arena.setInput("p1", 0, 0);
  arena.splitPlayer("p1");
  assert.strictEqual(p.cells.length, 2, "Arranca dividido");

  // Con el enfriamiento activo no se fusionan aunque estén encima
  for (let i = 0; i < 30; i++) arena.tick(33);
  assert.strictEqual(p.cells.length, 2, "Durante el enfriamiento NO se fusionan");

  // Se vence el enfriamiento pero se las deja SEPARADAS: tienen que buscarse
  // solas. Sin la atracción quedaban flotando en paralelo para siempre, porque
  // ambas siguen el mismo input y nunca se cruzan por su cuenta.
  for (const c of p.cells) c.mergeAt = 0;
  p.cells[0].x = 2000; p.cells[0].y = 2000;
  p.cells[1].x = 2120; p.cells[1].y = 2000;
  arena.setInput("p1", 0, 0);

  let ticks = 0;
  while (p.cells.length > 1 && ticks < 300) { arena.tick(33); ticks++; }
  assert.strictEqual(p.cells.length, 1, `Separadas y sin enfriamiento deben reencontrarse solas (quedaron ${p.cells.length} tras ${ticks} ticks)`);
  assert.ok(Math.abs(p.mass - 100) < 1, `La masa se conserva al fusionarse (${p.mass})`);
  console.log("  ✓ Se fusionan sólo después del enfriamiento, conservando la masa");
}

// 11. Te comen una célula pero seguís vivo con las otras
{
  const arena = new Arena();
  arena.players.clear();
  arena.palas.clear();

  const victima = arena.addPlayer("v", "Victima");
  victima.cells = [crearCelula(1000, 1000, 30), crearCelula(3000, 3000, 30)];
  sincronizarAgregados(victima);

  const cazador = arena.addPlayer("c", "Cazador");
  cazador.cells = [crearCelula(1000, 1000, 500)];
  sincronizarAgregados(cazador);

  arena.tick(33);

  assert.strictEqual(victima.cells.length, 1, "Le comieron una sola célula");
  assert.strictEqual(victima.alive, true, "Sigue vivo mientras le quede una célula");
  console.log("  ✓ Perder una célula no te mata si te queda otra");

  // Ahora sí, le comen la última
  victima.cells[0].x = 1000;
  victima.cells[0].y = 1000;
  arena.tick(33);
  assert.strictEqual(victima.alive, false, "Sin células, muere");
  console.log("  ✓ Morís recién cuando te comieron todas las células");
}

console.log("\n¡Todos los tests de Arena pasaron exitosamente!");
