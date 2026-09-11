import assert from "node:assert/strict";
import { Room, COUNTDOWN_MS, REVIVE_TIME_MS, IMMUNITY_TIME_MS, TICK_MS, DIFICULTADES, MAX_BOTS } from "./rooms.js";

console.log("Iniciando tests de Room (EscapeCV Multijugador)...");

// 1. Cuenta regresiva y transición a playing
{
  const room = new Room("TEST", { isPublic: true, mode: "coop" });
  room.addPlayer("s1", "Jugador 1");
  room.addPlayer("s2", "Jugador 2");

  assert.strictEqual(room.state, "lobby");
  assert.strictEqual(room.countdownEndsAt, null);

  room.startCountdown();
  assert.strictEqual(room.state, "countdown");
  assert.ok(room.countdownEndsAt > Date.now());

  const snap = room.snapshot();
  assert.strictEqual(snap.state, "countdown");
  assert.ok(snap.countdownRemainingSec > 0 && snap.countdownRemainingSec <= 5);

  // Cancelar cuenta regresiva si cae por debajo del mínimo de jugadores
  room.removePlayer("s2");
  room.cancelCountdown();
  assert.strictEqual(room.state, "lobby");
  assert.strictEqual(room.countdownEndsAt, null);

  console.log("  ✓ Cuenta regresiva se activa, reporta segundos restantes y se cancela correctamente");
}

// 2. Mecánica de revivir en modo Coop (acumulativo entre jugadores y tiempo)
{
  const room = new Room("TEST-COOP", { isPublic: false, mode: "coop" });
  const p1 = room.addPlayer("s1", "Caído");
  const p2 = room.addPlayer("s2", "Médico 1");
  const p3 = room.addPlayer("s3", "Médico 2");

  room.beginPlaying();

  // Posicionar a todos
  p1.x = 800; p1.y = 450;
  p2.x = 200; p2.y = 200; // lejos
  p3.x = 300; p3.y = 300; // lejos

  // P1 muere
  p1.alive = false;
  p1.reviveProgressMs = 0;

  // Tick con p2 lejos: no debe progresar
  room.tick(100);
  assert.strictEqual(p1.alive, false);
  assert.strictEqual(p1.reviveProgressMs, 0);

  // Médico 1 se para encima de P1 durante 1 segundo (1000ms)
  p2.x = 800; p2.y = 450;
  room.tick(1000);
  assert.strictEqual(p1.alive, false, "Aún no debe revivir con 1s");
  assert.strictEqual(p1.reviveProgressMs, 1000, "Debe acumular 1000ms");

  const snapMid = room.snapshot();
  const p1Snap = snapMid.players.find((p) => p.id === "s1");
  assert.ok(Math.abs(p1Snap.reviveProgress - (1000 / REVIVE_TIME_MS)) < 0.01, "reviveProgress en snapshot debe ser ~0.33");

  // Médico 1 se aleja: el progreso debe mantenerse acumulado (no reiniciarse)
  p2.x = 200; p2.y = 200;
  room.tick(500);
  assert.strictEqual(p1.reviveProgressMs, 1000, "El progreso debe mantenerse al alejarse el compañero");

  // Médico 2 viene y se para encima los otros 2 segundos (2000ms)
  p3.x = 800; p3.y = 450;
  room.tick(2000);

  // Ahora debe haber revivido!
  assert.strictEqual(p1.alive, true, "P1 debe haber revivido tras completar 3 segundos acumulados");
  assert.strictEqual(p1.reviveProgressMs, 0, "reviveProgressMs se resetea a 0");
  assert.ok(p1.immuneUntil > room.tiempo, "Debe tener inmunidad activa");

  console.log("  ✓ Revivir en Coop acumula tiempo entre distintos compañeros y revive a los 3s");
}

// 3. Inmunidad de 1 segundo tras revivir protege de daño
{
  const room = new Room("TEST-IMMUNITY", { isPublic: false, mode: "coop" });
  const p1 = room.addPlayer("s1", "Revivido");
  room.beginPlaying();

  p1.x = 500; p1.y = 500;
  p1.alive = true;
  p1.immuneUntil = room.tiempo + 1000; // 1s de inmunidad, en tiempo simulado

  // Aparece un enemigo justo encima de P1
  room.enemies = [{ x: 500, y: 500, vx: 0, vy: 0, size: 40 }];

  room.tick(100);
  assert.strictEqual(p1.alive, true, "No debe morir por pala mientras la inmunidad está activa");

  // Simular que expira la inmunidad
  p1.immuneUntil = room.tiempo - 10;
  room.enemies = [{ x: 500, y: 500, vx: 0, vy: 0, size: 40 }];

  room.tick(100);
  assert.strictEqual(p1.alive, false, "Debe morir por pala cuando la inmunidad expira");

  console.log("  ✓ Inmunidad de 1 segundo protege al jugador recién revivido de cualquier pala");
}

// 4. Modo Battle Royale: NO se puede revivir
{
  const room = new Room("TEST-BATTLE", { isPublic: false, mode: "battle" });
  const p1 = room.addPlayer("s1", "Muerto");
  const p2 = room.addPlayer("s2", "Rival");
  room.beginPlaying();

  p1.x = 600; p1.y = 600;
  p1.alive = false;

  // El rival se para encima
  p2.x = 600; p2.y = 600;
  room.tick(4000);

  assert.strictEqual(p1.alive, false, "En Battle Royale no se debe revivir jamás");
  assert.strictEqual(p1.reviveProgressMs, 0);

  console.log("  ✓ Modo Battle Royale ignora la mecánica de revivir");
}

// 5. El reloj de la partida es simulado, no de pared
{
  // Ésta es LA propiedad que hace entrenable la sala, y el bug que ya rompió
  // tres veces el entrenamiento del Agarrá: con Date.now() adentro del tick,
  // simular mil ticks seguidos sin esperar deja todos los temporizadores
  // clavados —para el código pasó tiempo, para el reloj no— así que las
  // oleadas no entran nunca y la inmunidad no se termina jamás.
  const room = new Room("TEST-RELOJ", { isPublic: false, mode: "coop" });
  room.addPlayer("s1", "Solo");
  room.beginPlaying();

  const relojReal = Date.now();
  for (let i = 0; i < 900; i++) room.tick(TICK_MS); // 30 s simulados

  assert.ok(Math.abs(room.tiempo - 30000) < 1, `El reloj simulado avanzó ${room.tiempo} ms, esperaba 30000`);
  assert.ok(Date.now() - relojReal < 5000, "Y todo eso tomó mucho menos tiempo real del que simuló");

  const snap = room.snapshot();
  assert.ok(Math.abs(snap.elapsedMs - 30000) < 1, "elapsedMs sale del reloj simulado");

  // Y lo que importa: las oleadas EFECTIVAMENTE entraron.
  assert.ok(
    room.enemies.length > 0 || room.warnings.length > 0,
    "Tras 30 s simulados tienen que haber entrado palas: si no, los temporizadores están clavados"
  );

  console.log(`  ✓ El reloj de la partida es simulado (30 s en ${Date.now() - relojReal} ms reales, ${room.enemies.length} palas en pantalla)`);
}

// 6. Con semilla, la sala es reproducible
{
  // Sin esto no se puede comparar dos políticas: cada una jugaría contra
  // oleadas distintas y la diferencia mediría la suerte, no la habilidad.
  const semilla = (s) => {
    let x = s >>> 0;
    return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  };

  const correr = (sem) => {
    const room = new Room("TEST-SEMILLA", { isPublic: false, mode: "coop", random: semilla(sem) });
    room.addPlayer("s1", "Uno");
    room.beginPlaying();
    for (let i = 0; i < 600; i++) {
      room.setInput("s1", Math.sin(i / 10), Math.cos(i / 10));
      room.tick(TICK_MS);
    }
    const p = room.players.get("s1");
    return {
      enemigos: room.enemies.length,
      x: Math.round(p.x * 1000),
      y: Math.round(p.y * 1000),
      tamaños: room.enemies.map((e) => Math.round(e.size * 1000)).join(","),
    };
  };

  const a = correr(12345);
  const b = correr(12345);
  const c = correr(999);

  assert.deepStrictEqual(a, b, "Con la misma semilla, dos corridas dan exactamente lo mismo");
  assert.notDeepStrictEqual(a, c, "Con semillas distintas, las oleadas cambian");

  console.log("  ✓ Con semilla, la sala es reproducible y con otra semilla cambia");
}


// 7. Bots: alta, baja y prioridad de los humanos
{
  // Política de mentira: alcanza con que devuelva rumbos. Cargar los pesos de
  // verdad haría el test lento y dependiente de un archivo de 7 MB.
  const falsa = {
    paso: 0,
    accionEnEspejo: () => 3,
    vectorDe: (a) => ({ dx: a === 0 ? 0 : 1, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1, acciones: new Int32Array(17).map((_, i) => i) }),
  };

  const room = new Room("BOTS", { isPublic: false, mode: "coop", politica: falsa });
  room.addPlayer("h1", "Humano");

  assert.strictEqual(room.humanCount, 1);
  room.configurarBots(3, "normal");
  assert.strictEqual(room.playerCount, 4, "Tres bots más el humano");
  assert.strictEqual(room.humanCount, 1, "Los bots no cuentan como humanos");

  const bots = [...room.players.values()].filter((p) => p.esBot);
  assert.strictEqual(bots.length, 3);
  assert.ok(bots.every((b) => b.name.includes("Normal")),
    "El nivel va en el nombre: si no, no se sabe si al que te gana lo maneja un bot lento o el de 10 Hz");
  // `cada` está en TICKS, no en pasos de decisión: la política se entrenó a
  // 10 Hz y la sala tickea a 30, así que el nivel más alto decide cada 3 ticks
  // y no cada uno. Con un tick por decisión queda fuera de su distribución y
  // rinde peor — medido: "Imposible" daba menos supervivencia que "Difícil".
  assert.ok(bots.every((b) => b.cada === DIFICULTADES.normal.cada * 3),
    `El nivel Normal debe decidir cada ${DIFICULTADES.normal.cada * 3} ticks (${(30 / (DIFICULTADES.normal.cada * 3)).toFixed(1)} Hz)`);
  const hzMax = 30 / (DIFICULTADES.imposible.cada * 3);
  assert.ok(Math.abs(hzMax - 10) < 1e-9,
    `El nivel más alto tiene que decidir a los 10 Hz con los que se entrenó, y da ${hzMax}`);
  // Fases distintas: sin esto los ocho piensan en el mismo tick.
  assert.ok(new Set(bots.map((b) => b.fase)).size > 1, "Las fases de decisión tienen que estar escalonadas");

  // Se llena la sala de humanos: los bots ceden el lugar.
  for (let i = 2; i <= 8; i++) room.addPlayer(`h${i}`, `H${i}`);
  assert.strictEqual(room.humanCount, 8);
  assert.strictEqual([...room.players.values()].filter((p) => p.esBot).length, 0,
    "Con la sala llena de gente no queda ningún bot");

  // Se va un humano: vuelve a entrar un bot.
  room.removePlayer("h8");
  assert.strictEqual([...room.players.values()].filter((p) => p.esBot).length, 1,
    "Al liberarse un lugar entra un bot de los que pidió el host");

  assert.ok(room.configurarBots(99, "normal") === undefined);
  assert.ok([...room.players.values()].filter((p) => p.esBot).length <= MAX_BOTS,
    `Nunca más de ${MAX_BOTS} bots: siempre queda lugar para un humano`);

  console.log(`  ✓ Los bots entran, ceden el lugar a los humanos y nunca pasan de ${MAX_BOTS}`);
}

// 8. Sin política no hay bots, y eso no rompe nada
{
  const room = new Room("SINPOL", { isPublic: false, mode: "coop" });
  room.addPlayer("h1", "Humano");
  room.configurarBots(4, "imposible");
  assert.strictEqual(room.playerCount, 1, "Sin modelo cargado no se crean bots");
  assert.strictEqual(room.snapshot().botsDisponibles, false, "Y el lobby se entera para no ofrecerlos");
  room.beginPlaying();
  room.tick(TICK_MS); // no tiene que tirar
  console.log("  ✓ Sin el archivo de pesos no hay bots, y el multijugador sigue funcionando");
}

// 9. La ronda no sigue para los bots
{
  /**
   * El problema de RITMO que traen bots buenos: en "Imposible" aguantan 96 s y
   * un jugador promedio bastante menos. Sin esta regla, la partida seguiría con
   * el humano muerto mirando cómo esquivan.
   */
  const falsa = {
    paso: 0, accionEnEspejo: () => 0, vectorDe: () => ({ dx: 0, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1 }),
  };
  const room = new Room("RITMO", { isPublic: false, mode: "coop", politica: falsa });
  const h = room.addPlayer("h1", "Humano");
  room.configurarBots(2, "imposible");
  room.beginPlaying();
  room.enemies = []; room.warnings = [];

  const bots = [...room.players.values()].filter((p) => p.esBot);
  // Los bots lejos, para que no reanimen a nadie.
  bots.forEach((b, i) => { b.x = 300 + i * 60; b.y = 200; });
  h.x = 900; h.y = 700;

  assert.strictEqual(room.tick(TICK_MS), false, "Con el humano vivo la ronda sigue");

  h.alive = false;
  h.isBeingRevived = false;
  const termino = room.tick(TICK_MS);
  assert.strictEqual(termino, true, "Muerto el último humano, la ronda termina aunque los bots sigan vivos");
  assert.ok(bots.some((b) => b.alive), "Y los bots estaban efectivamente vivos");

  console.log("  ✓ La ronda termina cuando cae el último humano: no se juega para los bots");
}

// 10. Pero un bot sí puede reanimarte
{
  // La excepción a la regla de arriba, y es la mecánica del modo cooperativo:
  // si un bot ya está parado encima de un humano caído, se le da la chance.
  const falsa = {
    paso: 0, accionEnEspejo: () => 0, vectorDe: () => ({ dx: 0, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1 }),
  };
  const room = new Room("REANIM", { isPublic: false, mode: "coop", politica: falsa });
  const h = room.addPlayer("h1", "Humano");
  room.configurarBots(1, "normal");
  room.beginPlaying();
  room.enemies = []; room.warnings = [];

  const bot = [...room.players.values()].find((p) => p.esBot);
  h.x = 800; h.y = 450;
  bot.x = 800; bot.y = 450; // encima del humano
  h.alive = false;
  h.reviveProgressMs = 0;

  assert.strictEqual(room.tick(TICK_MS), false, "Con el bot encima, la ronda no corta: puede levantarlo");
  assert.ok(h.isBeingRevived, "Y el humano figura como en reanimación");

  room.tick(REVIVE_TIME_MS);
  assert.strictEqual(h.alive, true, "El bot lo revivió");

  console.log("  ✓ Un bot puede reanimar al último humano caído, y la ronda le da la chance");
}

// 11. Arrancar exige un humano
{
  const falsa = {
    paso: 0, accionEnEspejo: () => 0, vectorDe: () => ({ dx: 0, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1 }),
  };
  const room = new Room("SOLOBOTS", { isPublic: false, mode: "battle", politica: falsa });
  room.addPlayer("h1", "Humano");
  room.configurarBots(3, "facil");
  assert.strictEqual(room.canStart(), true);
  room.removePlayer("h1");
  assert.strictEqual(room.humanCount, 0);
  assert.strictEqual(room.canStart(), false, "Una sala de puros bots no puede arrancar");
  console.log("  ✓ Una sala sin humanos no arranca, y se limpia sola");
}

console.log("\n¡Todos los tests de Room pasaron exitosamente!");
