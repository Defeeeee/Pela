import assert from "node:assert/strict";
import { Room, COUNTDOWN_MS, REVIVE_TIME_MS, IMMUNITY_TIME_MS, TICK_MS } from "./rooms.js";

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

console.log("\n¡Todos los tests de Room pasaron exitosamente!");
