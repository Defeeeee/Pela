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

  // Los tres necesitan cuenta y apodo: el ranking sólo muestra identidades
  // registradas, así que sin esto la tabla saldría vacía.
  for (const id of ["A", "B", "C"]) {
    store.vincularCuenta({ googleSub: `sub_${id}`, playerIdAnonimo: id });
    store.reservarApodo({ playerId: id, apodo: id });
  }

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

// Actualización de nombre de legajo: sincroniza los registros guardados.
// Se comprueba contra el almacén y no contra getBoard porque el ranking sólo
// muestra identidades con cuenta, y ésas justamente no pasan por este camino.
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-name` });
  await store.init();

  store.registerAttempt({ puzzle: 10, playerId: "p_name_1", playerName: "Nombre Viejo", guess: "CALVO", solved: true });
  assert.strictEqual(store.daily["10"][0].playerName, "Nombre Viejo");
  assert.strictEqual(store.history["p_name_1"].playerName, "Nombre Viejo");

  const updateRes = store.updatePlayerName("p_name_1", "Nombre Nuevo");
  assert.strictEqual(updateRes.ok, true);
  assert.strictEqual(updateRes.playerName, "Nombre Nuevo");

  assert.strictEqual(store.daily["10"][0].playerName, "Nombre Nuevo", "Debe actualizar nombre en daily");
  assert.strictEqual(store.history["p_name_1"].playerName, "Nombre Nuevo", "Debe actualizar nombre en history");

  console.log("  ✓ updatePlayerName actualiza el nombre en los registros guardados");
  fs.rmSync(`${testDir}-name`, { recursive: true, force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas: migración de rachas, dueño del apodo y quién entra al ranking
// ─────────────────────────────────────────────────────────────────────────────

// La cuenta adopta la identidad anónima: es lo que salva la racha al migrar
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-cuentas` });
  await store.init();

  const res = store.vincularCuenta({
    googleSub: "google_1",
    email: "uno@ejemplo.com",
    nombreGoogle: "Uno",
    playerIdAnonimo: "anon_1",
  });

  assert.strictEqual(res.playerId, "anon_1", "Debe quedarse con el id que ya venía usando");
  assert.strictEqual(res.adoptoAnonimo, true);
  assert.strictEqual(res.apodo, null, "Sin apodo elegido todavía");

  // Entrar desde otro navegador no cambia de identidad ni adopta el id de ahí
  const otraVez = store.vincularCuenta({ googleSub: "google_1", playerIdAnonimo: "anon_otro" });
  assert.strictEqual(otraVez.playerId, "anon_1", "El vínculo existente manda");

  // Y otra persona en la misma computadora no hereda la identidad ajena
  const segunda = store.vincularCuenta({ googleSub: "google_2", playerIdAnonimo: "anon_1" });
  assert.notStrictEqual(segunda.playerId, "anon_1", "No se roba una identidad ya reclamada");

  store.clearSaveTimer();
  console.log("  ✓ La cuenta adopta la identidad anónima sin pisar la de otro");
  fs.rmSync(`${testDir}-cuentas`, { recursive: true, force: true });
}

// Sólo se importa una racha viva: una vieja ya estaba cortada igual
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-import` });
  await store.init();

  const viva = store.importarProgresoLocal({
    playerId: "p_viva",
    puzzleActual: 100,
    stats: { played: 30, wins: 25, streak: 12, maxStreak: 15, lastPuzzle: 99 },
  });
  assert.strictEqual(viva.rachaImportada, 12, "Ayer jugó: la racha sigue viva");
  assert.strictEqual(store.history["p_viva"].currentStreak, 12);

  const vieja = store.importarProgresoLocal({
    playerId: "p_vieja",
    puzzleActual: 210,
    stats: { played: 30, wins: 25, streak: 99, maxStreak: 99, lastPuzzle: 100 },
  });
  assert.strictEqual(vieja.rachaImportada, 0, "Racha de hace 110 días: no se importa");
  assert.strictEqual(store.history["p_vieja"].currentStreak, 0);
  assert.strictEqual(store.history["p_vieja"].gamesWon, 25, "Los acumulados sí se conservan");

  store.clearSaveTimer();
  console.log("  ✓ Sólo se importa la racha que sigue viva");
  fs.rmSync(`${testDir}-import`, { recursive: true, force: true });
}

// El apodo tiene un solo dueño y no lo pisa nadie desde el cliente
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-apodo` });
  await store.init();

  store.vincularCuenta({ googleSub: "g_a", playerIdAnonimo: "pa" });
  assert.strictEqual(store.reservarApodo({ playerId: "pa", apodo: "Pelado Real" }).ok, true);

  // Sin distinguir mayúsculas: "pelado real" es el mismo apodo
  const robo = store.reservarApodo({ playerId: "pb", apodo: "pelado real" });
  assert.ok(robo.error, "No puede haber dos dueños del mismo apodo");

  // El camino sin sesión no puede cambiar un apodo reservado
  const porLaVentana = store.updatePlayerName("pa", "Impostor");
  assert.strictEqual(porLaVentana.ok, false, "updatePlayerName no toca un apodo reservado");
  assert.strictEqual(store.apodoDe("pa"), "Pelado Real");

  // Ni mandando otro nombre en el intento
  store.registerAttempt({ puzzle: 50, playerId: "pa", playerName: "Nombre Falso", guess: "CALVO", solved: true });
  assert.strictEqual(store.daily["50"][0].playerName, "Pelado Real", "Vale el apodo, no lo que mandó el cliente");

  store.clearSaveTimer();
  console.log("  ✓ El apodo tiene un solo dueño y no se pisa desde el cliente");
  fs.rmSync(`${testDir}-apodo`, { recursive: true, force: true });
}

// Al ranking entran sólo los que tienen cuenta Y apodo
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-rank` });
  await store.init();

  // Con cuenta y apodo: entra
  store.vincularCuenta({ googleSub: "g_ok", playerIdAnonimo: "completo" });
  store.reservarApodo({ playerId: "completo", apodo: "Completo" });

  // Con cuenta pero sin apodo elegido: todavía no
  store.vincularCuenta({ googleSub: "g_medio", playerIdAnonimo: "sin_apodo" });

  // Sin nada: es un anónimo cualquiera
  for (const id of ["completo", "sin_apodo", "anonimo"]) {
    store.registerAttempt({ puzzle: 60, playerId: id, playerName: id, guess: "CALVO", solved: true });
  }

  const board = store.getBoard(60);
  assert.strictEqual(board.daily.length, 1, "Sólo entra el que tiene cuenta y apodo");
  assert.strictEqual(board.daily[0].playerId, "completo");
  assert.strictEqual(board.daily[0].rank, 1, "El puesto se numera después de filtrar");
  assert.strictEqual(board.history.length, 1);

  store.clearSaveTimer();
  console.log("  ✓ Al ranking entran sólo las identidades registradas");
  fs.rmSync(`${testDir}-rank`, { recursive: true, force: true });
}

// 13. Récords unificados por cuenta (EscapeCV, Agarrá, Pelardle, Clicker)
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-records` });
  await store.init();

  const pid = "player_records_1";

  // Estado inicial vacío devuelve estructura coherente
  const inicial = store.getRecords(pid);
  assert.strictEqual(inicial.escapecv.chase, 0);
  assert.strictEqual(inicial.escapecv.dodge, 0);
  assert.strictEqual(inicial.agarra.maxMass, 0);
  assert.strictEqual(inicial.pelardle.played, 0);
  assert.strictEqual(inicial.clicker, null);

  // Primera actualización: local anónimo
  const res1 = store.updateRecords(pid, {
    escapecv: { chase: 250, dodge: 120 },
    agarra: { maxMass: 400 },
    pelardle: { played: 5, wins: 4, maxStreak: 3, currentStreak: 2 },
    clicker: { palas: 1000, brillo: 0, upgrades: { pala_madera: 2 }, achievements: { primer_click: true } },
  });
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.records.escapecv.chase, 250);
  assert.strictEqual(res1.records.escapecv.dodge, 120);
  assert.strictEqual(res1.records.agarra.maxMass, 400);
  assert.strictEqual(res1.records.pelardle.wins, 4);
  assert.strictEqual(res1.records.clicker.palas, 1000);

  // Segunda actualización: se inicia sesión desde un dispositivo con menor progreso en unos juegos
  // y mayor en otros -> gana SIEMPRE el mejor valor (máximo)
  const res2 = store.updateRecords(pid, {
    escapecv: { chase: 100, dodge: 300 }, // chase es menor (debe quedar 250), dodge es mayor (debe subir a 300)
    agarra: { maxMass: 350 }, // menor (debe quedar 400)
    pelardle: { played: 6, wins: 3, maxStreak: 4 }, // maxStreak sube a 4, wins queda en 4
    clicker: {
      palas: 500, // menor palas
      brillo: 1,  // mayor brillo (prestigio ganado en el otro dispositivo)
      upgrades: { pala_madera: 1, pala_hierro: 1 }, // debe unir mejoras
      achievements: { segundo_click: true }, // debe unir logros
    },
  });

  assert.strictEqual(res2.records.escapecv.chase, 250, "EscapeCV chase debe conservar el máximo previo");
  assert.strictEqual(res2.records.escapecv.dodge, 300, "EscapeCV dodge debe actualizarse al nuevo máximo");
  assert.strictEqual(res2.records.agarra.maxMass, 400, "Agarrá debe conservar la masa máxima alcanzada");
  assert.strictEqual(res2.records.pelardle.wins, 4, "Pelardle debe conservar el máximo de victorias");
  assert.strictEqual(res2.records.pelardle.maxStreak, 4, "Pelardle debe tomar la mayor racha");
  assert.strictEqual(res2.records.clicker.brillo, 1, "Clicker debe tomar el mayor brillo");
  assert.strictEqual(res2.records.clicker.upgrades.pala_madera, 2, "Clicker debe conservar nivel 2 de madera");
  assert.strictEqual(res2.records.clicker.upgrades.pala_hierro, 1, "Clicker debe incluir nivel 1 de hierro");
  assert.strictEqual(res2.records.clicker.achievements.primer_click, true, "Clicker conserva primer logro");
  assert.strictEqual(res2.records.clicker.achievements.segundo_click, true, "Clicker incluye segundo logro");

  // Forzar guardado a disco y reiniciar store desde disco
  await store.flushToDisk();

  const storeReiniciado = new LeaderboardStore({ dataDir: `${testDir}-records` });
  await storeReiniciado.init();
  const desdeDisco = storeReiniciado.getRecords(pid);

  assert.strictEqual(desdeDisco.escapecv.chase, 250, "Persistencia en disco de EscapeCV");
  assert.strictEqual(desdeDisco.escapecv.dodge, 300);
  assert.strictEqual(desdeDisco.agarra.maxMass, 400, "Persistencia en disco de Agarrá");
  assert.strictEqual(desdeDisco.pelardle.wins, 4, "Persistencia en disco de Pelardle");
  assert.strictEqual(desdeDisco.clicker.brillo, 1, "Persistencia en disco de Clicker");
  assert.strictEqual(desdeDisco.clicker.upgrades.pala_hierro, 1);

  store.clearSaveTimer();
  storeReiniciado.clearSaveTimer();
  console.log("  ✓ Récords unificados se fusionan por el máximo y persisten a disco");
  fs.rmSync(`${testDir}-records`, { recursive: true, force: true });
}

// La racha en curso no se resucita desde un dispositivo con datos viejos
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-zombie` });
  await store.init();

  // Venía con racha 5 y hoy la cortó: el servidor lo sabe porque él cuenta.
  store.history["z"] = {
    playerId: "z", playerName: "Z", gamesPlayed: 20, gamesWon: 15,
    currentStreak: 0, maxStreak: 9, lastPuzzle: 200,
  };

  // Abre el sitio en otro dispositivo cuyo localStorage quedó en el puzzle 190.
  store.updateRecords("z", {
    pelardle: { played: 20, wins: 15, currentStreak: 5, maxStreak: 9, lastPuzzle: 190 },
  });

  assert.strictEqual(store.history["z"].currentStreak, 0, "La racha cortada no puede volver");
  assert.strictEqual(store.history["z"].maxStreak, 9, "Pero los acumulados sí se fusionan");
  assert.strictEqual(store.history["z"].gamesWon, 15);

  store.clearSaveTimer();
  console.log("  ✓ Una racha ya cortada no vuelve desde un dispositivo viejo");
  fs.rmSync(`${testDir}-zombie`, { recursive: true, force: true });
}

// La masa del Agarrá la escribe el servidor, no el navegador
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-masa` });
  await store.init();

  // Primera sincronización: se acepta, es la migración de quien ya jugaba.
  store.updateRecords("m", { agarra: { maxMass: 340 } });
  assert.strictEqual(store.records["m"].agarra.maxMass, 340, "La primera vez se acepta");

  // Después ya no: un POST no puede inflar el récord.
  store.updateRecords("m", { agarra: { maxMass: 999999 } });
  assert.strictEqual(store.records["m"].agarra.maxMass, 340, "Un POST no infla el récord");

  // Lo medido por la arena sí entra.
  store.updateRecords("m", { agarra: { maxMass: 812 } }, { deConfianza: true });
  assert.strictEqual(store.records["m"].agarra.maxMass, 812, "Lo que mide el servidor sí manda");

  // Y ni siquiera el servidor baja un récord ya logrado.
  store.updateRecords("m", { agarra: { maxMass: 5 } }, { deConfianza: true });
  assert.strictEqual(store.records["m"].agarra.maxMass, 812, "El récord no baja");

  store.clearSaveTimer();
  console.log("  ✓ La masa del Agarrá la escribe el servidor, no el cliente");
  fs.rmSync(`${testDir}-masa`, { recursive: true, force: true });
}

// Perfil público: se busca por apodo y sólo publica lo que el servidor mide
{
  const store = new LeaderboardStore({ dataDir: `${testDir}-perfil` });
  await store.init();

  store.vincularCuenta({ googleSub: "gp", email: "secreto@ejemplo.com", playerIdAnonimo: "pp" });
  store.reservarApodo({ playerId: "pp", apodo: "Pelado Sindical" });
  store.registerAttempt({ puzzle: 300, playerId: "pp", playerName: "x", guess: "CALVO", solved: true });
  store.updateRecords("pp", { agarra: { maxMass: 648 } });
  // Récords que el servidor no puede verificar: no deben salir publicados.
  store.updateRecords("pp", { escapecv: { chase: 99, dodge: 99 }, clicker: { palas: 1e9 } });

  const perfil = store.perfilPublico("pELADO sINDICAL"); // sin distinguir mayúsculas
  assert.ok(perfil, "Se encuentra por apodo sin importar mayúsculas");
  assert.strictEqual(perfil.apodo, "Pelado Sindical", "Devuelve el apodo como se escribió");
  assert.strictEqual(perfil.pelardle.wins, 1);
  assert.strictEqual(perfil.agarra.maxMass, 648);
  assert.strictEqual(perfil.puestoHistorico, 1);

  const publicado = JSON.stringify(perfil);
  assert.ok(!publicado.includes("secreto@ejemplo.com"), "El email no se publica");
  assert.ok(!publicado.includes("escapecv"), "Los récords del navegador no se publican");
  assert.ok(!publicado.includes("clicker"), "El Clicker tampoco");

  assert.strictEqual(store.perfilPublico("no-existe"), null);
  assert.strictEqual(store.perfilPublico(""), null);

  store.clearSaveTimer();
  console.log("  ✓ El perfil público sale por apodo y sin datos que no se puedan verificar");
  fs.rmSync(`${testDir}-perfil`, { recursive: true, force: true });
}

// Limpieza de testDir
try {
  fs.rmSync(testDir, { recursive: true, force: true });
} catch (e) {}

console.log("\n¡Todos los tests de LeaderboardStore pasaron exitosamente!");

