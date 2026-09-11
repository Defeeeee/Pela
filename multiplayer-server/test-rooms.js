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
  // `cadaTicks` está en ticks de simulación. La sala tickea a 30 Hz, así que
  // 3 ticks son los 10 Hz con los que se entrenó la política y 1 es el techo
  // que el juego permite.
  assert.ok(bots.every((b) => b.cada === DIFICULTADES.normal.cadaTicks),
    `El nivel Normal debe decidir cada ${DIFICULTADES.normal.cadaTicks} ticks`);
  assert.strictEqual(DIFICULTADES.imposible.cadaTicks, 3,
    "Imposible decide a los 10 Hz con los que se entrenó la política");
  assert.strictEqual(DIFICULTADES.sobrehumano.cadaTicks, 1,
    "Sobrehumano decide en cada tick: es el techo, no se puede decidir más seguido de lo que el mundo se actualiza");
  // El orden tiene que ser estrictamente decreciente en ticks, o sea creciente
  // en frecuencia. Si dos niveles empatan, uno de los dos no sirve de nada.
  const ticks = Object.values(DIFICULTADES).map((d) => d.cadaTicks);
  for (let i = 1; i < ticks.length; i++) {
    assert.ok(ticks[i] < ticks[i - 1], "Cada nivel tiene que decidir más seguido que el anterior");
  }
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

// 9. En coop la ronda espera a que caigan todos
{
  /**
   * Que te reanimen es la mecánica del cooperativo, y para eso el bot necesita
   * tiempo de CAMINAR hasta el cuerpo. Una versión anterior sólo daba margen si
   * el bot ya estaba encima, y con eso la ronda cortaba en el instante en que
   * caía el humano: nunca llegaba nadie.
   */
  const falsa = {
    paso: 0, accionEnEspejo: () => 0, vectorDe: () => ({ dx: 0, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1 }),
  };
  const room = new Room("COOPFIN", { isPublic: false, mode: "coop", politica: falsa });
  const h = room.addPlayer("h1", "Humano");
  room.configurarBots(2, "imposible");
  room.beginPlaying();
  room.enemies = []; room.warnings = [];

  const bots = [...room.players.values()].filter((p) => p.esBot);
  // Los bots LEJOS: ni siquiera están reanimando, y la ronda igual sigue.
  bots.forEach((b, i) => { b.x = 300 + i * 60; b.y = 200; });
  h.x = 900; h.y = 700;
  h.alive = false;
  h.isBeingRevived = false;

  assert.strictEqual(room.tick(TICK_MS), false,
    "Con el humano caído pero bots vivos, la ronda sigue: pueden venir a levantarlo");

  // Ahora sí caen todos.
  bots.forEach((b) => { b.alive = false; });
  assert.strictEqual(room.tick(TICK_MS), true, "Recién cuando cae el último se termina");

  console.log("  ✓ En coop la ronda espera a que caigan todos, así el bot puede llegar a reanimarte");
}

// 10. En battle no, porque ahí no hay reanimación
{
  const falsa = {
    paso: 0, accionEnEspejo: () => 0, vectorDe: () => ({ dx: 0, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1 }),
  };
  const room = new Room("BATFIN", { isPublic: false, mode: "battle", politica: falsa });
  const h = room.addPlayer("h1", "Humano");
  room.configurarBots(3, "normal");
  room.beginPlaying();
  room.enemies = []; room.warnings = [];

  h.alive = false;
  const bots = [...room.players.values()].filter((p) => p.esBot);
  assert.ok(bots.filter((b) => b.alive).length >= 2, "Quedan al menos dos bots vivos");
  assert.strictEqual(room.tick(TICK_MS), true,
    "En battle no hay reanimación: sin humanos en pie la ronda termina en vez de hacerte mirar bots peleando");

  console.log("  ✓ En battle la ronda termina al caer el último humano: ahí no hay nada que esperar");
}

// 10b. Un bot puede reanimarte de verdad
{
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
  bot.x = 800; bot.y = 450;
  h.alive = false;
  h.reviveProgressMs = 0;

  room.tick(REVIVE_TIME_MS);
  assert.strictEqual(h.alive, true, "El bot lo revivió");
  assert.ok(h.immuneUntil > room.tiempo, "Y quedó con la inmunidad de un segundo");

  console.log("  ✓ Un bot reanima al humano caído y le deja la inmunidad de siempre");
}

// 10c. Cambiar el nivel afecta a los bots que YA existen
{
  /**
   * El bug que reportó el usuario: seleccionar "Imposible" dejaba los bots en
   * Normal. `sincronizarBots` sólo creaba o borraba según la cantidad, así que
   * con el número igual ninguno de los dos bucles corría y los bots seguían con
   * el nivel con el que nacieron — mientras la interfaz mostraba el nuevo.
   */
  const falsa = {
    paso: 0, accionEnEspejo: () => 0, vectorDe: () => ({ dx: 0, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1 }),
  };
  const room = new Room("NIVEL", { isPublic: false, mode: "coop", politica: falsa });
  room.addPlayer("h1", "Humano");

  room.configurarBots(3, "normal");
  let bots = [...room.players.values()].filter((p) => p.esBot);
  assert.ok(bots.every((b) => b.cada === DIFICULTADES.normal.cadaTicks));
  assert.ok(bots.every((b) => b.name.endsWith("Normal")));

  // MISMA cantidad, otro nivel: es el caso que estaba roto.
  room.configurarBots(3, "imposible");
  bots = [...room.players.values()].filter((p) => p.esBot);
  assert.strictEqual(bots.length, 3, "No se recrean los bots, se actualizan");
  assert.ok(bots.every((b) => b.cada === DIFICULTADES.imposible.cadaTicks),
    "Los bots que ya existían tienen que pasar al nivel nuevo");
  assert.ok(bots.every((b) => b.name.endsWith("Imposible")),
    "Y el nombre tiene que decir el nivel real, no el viejo");
  assert.strictEqual(room.snapshot().dificultad, "imposible");

  // Y para abajo también.
  room.configurarBots(3, "facil");
  bots = [...room.players.values()].filter((p) => p.esBot);
  assert.ok(bots.every((b) => b.cada === DIFICULTADES.facil.cadaTicks));
  assert.ok(bots.every((b) => b.name.endsWith("Fácil")));

  console.log("  ✓ Cambiar el nivel sin cambiar la cantidad actualiza los bots que ya están");
}

// 10d. El nivel Sobrehumano limita la cantidad por costo
{
  /**
   * El costo es lineal en las decisiones por segundo y el servidor es
   * mono-hilo. Medido en el VPS: siete bots a 30 Hz piden unos 36 ms por tick
   * contra un presupuesto de 33,3 — más que todo el presupuesto de una sala, y
   * el mismo loop atiende /agarra y /escapecv.
   */
  const falsa = {
    paso: 0, accionEnEspejo: () => 0, vectorDe: () => ({ dx: 0, dy: 0 }),
    espejoAlAzar: () => ({ nombre: "identidad", sx: 1, sy: 1 }),
  };
  const room = new Room("TOPE", { isPublic: false, mode: "battle", politica: falsa });
  room.addPlayer("h1", "Humano");

  room.configurarBots(7, "imposible");
  assert.strictEqual([...room.players.values()].filter((p) => p.esBot).length, 7,
    "A 10 Hz entran los siete");

  room.configurarBots(7, "sobrehumano");
  const n = [...room.players.values()].filter((p) => p.esBot).length;
  assert.strictEqual(n, DIFICULTADES.sobrehumano.maxBots,
    `Sobrehumano se topa en ${DIFICULTADES.sobrehumano.maxBots}, y pidieron 7`);
  assert.strictEqual(room.snapshot().maxBots, DIFICULTADES.sobrehumano.maxBots,
    "Y el lobby se entera del tope para no ofrecer más");
  assert.ok([...room.players.values()].filter((p) => p.esBot).every((b) => b.cada === 1),
    "Los que quedaron deciden en cada tick");

  console.log(`  ✓ Sobrehumano decide a 30 Hz y se topa en ${DIFICULTADES.sobrehumano.maxBots} bots por costo de CPU`);
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
