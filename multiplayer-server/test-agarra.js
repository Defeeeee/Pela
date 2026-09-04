import assert from "node:assert/strict";
import {
  Arena,
  radiusForMass,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  INITIAL_MASS,
  PALA_MASS,
  EAT_MASS_RATIO,
} from "./agarra.js";

console.log("Iniciando tests deterministas de Arena (Agarrá.io)...");

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
  p.x = 500;
  p.y = 500;
  p.mass = 20;
  p.radius = radiusForMass(20);

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

  const pBig = arena.addPlayer("big", "Gigante");
  const pSmall = arena.addPlayer("small", "Chiquito");

  pBig.x = 1000;
  pBig.y = 1000;
  pSmall.x = 1010;
  pSmall.y = 1000;

  // Caso A: Masas iguales (20 vs 20) -> ninguno debe comerse al otro
  pBig.mass = 20;
  pBig.radius = radiusForMass(20);
  pSmall.mass = 20;
  pSmall.radius = radiusForMass(20);

  arena.tick(33);
  assert.strictEqual(pBig.alive, true, "Con masas iguales ninguno come al otro");
  assert.strictEqual(pSmall.alive, true, "Con masas iguales ninguno come al otro");

  // Caso B: Borde del 24% (124 vs 100) -> 124 < 100 * 1.25 -> NO lo come
  pBig.mass = 124;
  pBig.radius = radiusForMass(124);
  pSmall.mass = 100;
  pSmall.radius = radiusForMass(100);
  pBig.x = 1000;
  pSmall.x = 1010;

  arena.tick(33);
  assert.strictEqual(pSmall.alive, true, "Con 24% de ventaja NO se debe comer al rival");

  // Caso C: Exactamente 25% (125 vs 100) -> SÍ lo come
  pBig.mass = 125;
  pBig.radius = radiusForMass(125);
  pSmall.mass = 100;
  pSmall.radius = radiusForMass(100);
  pBig.x = 1000;
  pSmall.x = 1010; // distancia 10px < radio ~44px

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
  p.mass = 25;
  p.radius = radiusForMass(25);

  // Tratar de salir por la izquierda (x < 0)
  p.x = 5;
  p.dx = -1;
  p.dy = 0;
  arena.tick(1000); // 1 segundo moviéndose a la izquierda

  assert.ok(p.x >= p.radius, `x (${p.x}) no debe ser menor al radio (${p.radius})`);

  // Tratar de salir por abajo a la derecha
  p.x = WORLD_WIDTH - 5;
  p.y = WORLD_HEIGHT - 5;
  p.dx = 1;
  p.dy = 1;
  arena.tick(1000);

  assert.ok(p.x <= WORLD_WIDTH - p.radius, `x (${p.x}) no debe superar el ancho`);
  assert.ok(p.y <= WORLD_HEIGHT - p.radius, `y (${p.y}) no debe superar el alto`);
  console.log("  ✓ Clamping de bordes mantiene al jugador dentro del mapa");
}

// 5. Decaimiento de masa por encima de 200
{
  const arena = new Arena();
  arena.players.clear();
  arena.palas.clear();
  const p = arena.addPlayer("p1", "Gordo");
  p.mass = 1000;

  arena.tick(1000); // 1 segundo
  assert.ok(p.mass < 1000, `La masa (${p.mass}) debió decaer al estar por encima de 200`);
  console.log("  ✓ Masa mayor a 200 decae gradualmente");
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

console.log("\n¡Todos los tests de Arena pasaron exitosamente!");
