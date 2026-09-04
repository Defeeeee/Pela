import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LeaderboardStore } from "./leaderboard.js";

console.log("Iniciando tests de LeaderboardStore (Pelardle)...");

const testDir = path.join(os.tmpdir(), `pela-test-leaderboard-${Date.now()}`);

// 1. Contador de intentos y anti-trampa (autoridad del servidor)
{
  const store = new LeaderboardStore({ dataDir: testDir });
  await store.init();

  const puzzle = 10;
  const p1 = "player_abc";

  // Intento 1
  const res1 = store.registerAttempt({
    puzzle,
    playerId: p1,
    playerName: "Pelado 1",
    guess: "PELOS",
    solved: false,
  });
  assert.strictEqual(res1.attempt, 1, "Primer intento debe ser 1");
  assert.strictEqual(res1.solved, false);

  // Intento 2 (incluso si un cliente tramposo mandara attempt: 1)
  const res2 = store.registerAttempt({
    puzzle,
    playerId: p1,
    playerName: "Pelado 1",
    guess: "CALVO",
    solved: false,
  });
  assert.strictEqual(res2.attempt, 2, "Segundo intento debe ser 2 aunque el cliente mienta");

  // Intento 3: Acierta
  const res3 = store.registerAttempt({
    puzzle,
    playerId: p1,
    playerName: "Pelado 1",
    guess: "PELADA",
    solved: true,
  });
  assert.strictEqual(res3.attempt, 3, "Debe registrar 3 intentos al ganar");
  assert.strictEqual(res3.solved, true);
  assert.strictEqual(res3.finished, true);

  // Intento 4 posterior: debe ser ignorado porque ya terminó
  const res4 = store.registerAttempt({
    puzzle,
    playerId: p1,
    playerName: "Pelado 1",
    guess: "OTRAA",
    solved: true,
  });
  assert.strictEqual(res4.alreadyFinished, true, "No debe permitir alterar un juego ya terminado");
  store.clearSaveTimer();
  console.log("  ✓ Autoridad del servidor: cuenta intentos reales y bloquea reescrituras");
}

// 2. Ordenamiento del ranking diario
{
  const store = new LeaderboardStore({ dataDir: testDir });
  await store.init();

  const pz = 20;

  // Jugador A gana en 4 intentos
  store.registerAttempt({ puzzle: pz, playerId: "A", playerName: "A", guess: "1", solved: false });
  store.registerAttempt({ puzzle: pz, playerId: "A", playerName: "A", guess: "2", solved: false });
  store.registerAttempt({ puzzle: pz, playerId: "A", playerName: "A", guess: "3", solved: false });
  store.registerAttempt({ puzzle: pz, playerId: "A", playerName: "A", guess: "4", solved: true });

  // Jugador B gana en 2 intentos (debe quedar 1ro)
  store.registerAttempt({ puzzle: pz, playerId: "B", playerName: "B", guess: "1", solved: false });
  store.registerAttempt({ puzzle: pz, playerId: "B", playerName: "B", guess: "2", solved: true });

  // Jugador C no gana (agota 6 intentos)
  for (let i = 1; i <= 6; i++) {
    store.registerAttempt({ puzzle: pz, playerId: "C", playerName: "C", guess: String(i), solved: false });
  }

  const board = store.getBoard(pz);
  assert.strictEqual(board.daily.length, 3, "Deben figurar los 3 jugadores");
  assert.strictEqual(board.daily[0].playerId, "B", "El de 2 intentos debe ser 1ro");
  assert.strictEqual(board.daily[1].playerId, "A", "El de 4 intentos debe ser 2do");
  assert.strictEqual(board.daily[2].playerId, "C", "El que no acertó debe quedar al final");
  store.clearSaveTimer();
  console.log("  ✓ Ordenamiento del ranking diario por aciertos e intentos");
}

// 3. Poda de puzzles viejos (Bounded size en disco)
{
  const store = new LeaderboardStore({ dataDir: testDir });
  await store.init();

  // Generar 35 días distintos
  for (let pz = 1; pz <= 35; pz++) {
    store.daily[pz] = [{ playerId: "x", playerName: "x", attempts: 1, solved: true, solvedAt: Date.now() }];
  }

  await store.flushToDisk();

  // Al guardar a disco debe podar a máximo 30
  const savedKeys = Object.keys(store.daily);
  assert.strictEqual(savedKeys.length, 30, "Debe podar el ranking diario a los últimos 30 días");
  assert.strictEqual(savedKeys.includes("1"), false, "El día 1 (más viejo) debió ser eliminado");
  assert.strictEqual(savedKeys.includes("35"), true, "El día 35 debe conservarse");
  console.log("  ✓ Poda automática a 30 días mantiene el tamaño en disco acotado");
}

// 4. Tolerancia a fallos: archivo JSON corrupto
{
  const corruptDir = path.join(os.tmpdir(), `pela-corrupt-${Date.now()}`);
  fs.mkdirSync(corruptDir, { recursive: true });
  const corruptFile = path.join(corruptDir, "leaderboard.json");
  fs.writeFileSync(corruptFile, "{ esto no es json valido !!!", "utf-8");

  const store = new LeaderboardStore({ dataDir: corruptDir });
  await store.init();

  // Debe arrancar vacío sin crashear
  assert.deepStrictEqual(store.daily, {}, "Debe reiniciar daily si está corrupto");
  assert.deepStrictEqual(store.history, {}, "Debe reiniciar history si está corrupto");

  // El archivo corrupto debió ser respaldado con extensión .corrupto
  const files = fs.readdirSync(corruptDir);
  const backupFound = files.some((f) => f.includes(".corrupto"));
  assert.ok(backupFound, "El archivo dañado debe ser respaldado como .corrupto.*");
  console.log("  ✓ Recuperación automática y respaldo ante JSON corrupto");

  // Limpieza
  fs.rmSync(corruptDir, { recursive: true, force: true });
}

// La racha se corta si te salteaste un día hábil. Antes incrementaba con
// cualquier victoria, así que era el total de victorias disfrazado de racha, y
// contradecía al número que el cliente muestra en el mismo modal.
{
  const dir = `${testDir}-racha`;
  fs.rmSync(dir, { recursive: true, force: true });
  const store = new LeaderboardStore({ dataDir: dir });
  await store.init();

  const ganar = (puzzle) =>
    store.registerAttempt({ puzzle, playerId: "p1", playerName: "Fede", guess: "FIRMA", solved: true });

  ganar(100);
  assert.strictEqual(store.history["p1"].currentStreak, 1, "Primera victoria arranca la racha en 1");

  ganar(101);
  assert.strictEqual(store.history["p1"].currentStreak, 2, "Día hábil consecutivo suma a la racha");

  ganar(150);
  assert.strictEqual(store.history["p1"].currentStreak, 1, "Saltearse días hábiles reinicia la racha");
  assert.strictEqual(store.history["p1"].maxStreak, 2, "La mejor racha se conserva");
  assert.strictEqual(store.history["p1"].gamesWon, 3, "Las victorias totales siguen sumando");

  console.log("  ✓ La racha se corta al saltearse días hábiles");
  fs.rmSync(dir, { recursive: true, force: true });
}

// Un reinicio del proceso (pasa en CADA deploy) no debe permitir re-jugar el
// puzzle del día ya sabiendo la palabra y pisar el propio puntaje.
{
  const dir = `${testDir}-reinicio`;
  fs.rmSync(dir, { recursive: true, force: true });

  const s1 = new LeaderboardStore({ dataDir: dir });
  await s1.init();
  for (let i = 0; i < 4; i++) {
    s1.registerAttempt({ puzzle: 137, playerId: "p1", playerName: "Fede", guess: "CALVO", solved: false });
  }
  s1.registerAttempt({ puzzle: 137, playerId: "p1", playerName: "Fede", guess: "FIRMA", solved: true });
  assert.strictEqual(s1.daily["137"][0].attempts, 5, "Resolvió en 5 intentos");
  await s1.flushToDisk();

  // Proceso nuevo: inProgress arranca vacío, sólo se recupera lo persistido.
  const s2 = new LeaderboardStore({ dataDir: dir });
  await s2.init();
  const reintento = s2.registerAttempt({ puzzle: 137, playerId: "p1", playerName: "Fede", guess: "FIRMA", solved: true });

  assert.strictEqual(reintento.alreadyFinished, true, "Tras reiniciar debe seguir bloqueado");
  assert.strictEqual(s2.daily["137"][0].attempts, 5, "No debe pisar el 5/6 original con un 1/6");

  console.log("  ✓ Un reinicio no permite re-jugar ni mejorar el puntaje del día");
  fs.rmSync(dir, { recursive: true, force: true });
}

// Los intentos en curso se podan: el Map vive en un proceso que corre meses.
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-poda` });
  for (let p = 1; p <= 60; p++) {
    store.registerAttempt({ puzzle: p, playerId: "p1", playerName: "Fede", guess: "CALVO", solved: false });
  }
  assert.strictEqual(store.inProgress.size, 60, "Antes de podar están los 60");
  store.podarEnCurso();
  assert.ok(store.inProgress.size <= 31, `Debe podar los viejos (quedaron ${store.inProgress.size})`);
  console.log("  ✓ Los intentos en curso se podan y no crecen sin techo");
  fs.rmSync(`${testDir}-poda`, { recursive: true, force: true });
}

// Limpieza de testDir
try {
  fs.rmSync(testDir, { recursive: true, force: true });
} catch (e) {}

console.log("\n¡Todos los tests de LeaderboardStore pasaron exitosamente!");
