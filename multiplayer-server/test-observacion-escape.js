import assert from "node:assert/strict";
import { Room, TICK_MS, CORRAL_X, CORRAL_Y, CORRAL_W, CORRAL_H } from "./rooms.js";
import { codificar, TAM_OBS, ENEMIGOS_DETALLE, SECTORES } from "./observacion-escape.js";
import { decodificar, mascara, NUM_ACCIONES, RUMBOS } from "./acciones-escape.js";

console.log("Iniciando tests de percepción de escapecv...");

const CX = CORRAL_X + CORRAL_W / 2;
const CY = CORRAL_Y + CORRAL_H / 2;

/** Sala vacía, en juego, con un jugador en el centro y sin oleadas propias. */
function escena(mode = "coop") {
  const room = new Room("T", { isPublic: false, mode, random: () => 0.5 });
  const p = room.addPlayer("yo", "Yo");
  room.beginPlaying();
  room.enemies = [];
  room.warnings = [];
  p.x = CX;
  p.y = CY;
  return { room, p };
}

const obs = new Float32Array(TAM_OBS * 4);

// 1. Tamaño fijo, siempre
{
  const { room } = escena();
  obs.fill(-999);
  codificar(room, "yo", obs, 0);
  for (let i = 0; i < TAM_OBS; i++) {
    assert.ok(Number.isFinite(obs[i]), `El canal ${i} no es finito: ${obs[i]}`);
  }
  assert.strictEqual(obs[TAM_OBS], -999, "No debe escribir más allá de TAM_OBS");

  // Jugador inexistente: no escribe basura, deja ceros.
  obs.fill(-999);
  codificar(room, "fantasma", obs, 0);
  for (let i = 0; i < TAM_OBS; i++) assert.strictEqual(obs[i], 0, "Sin jugador, todo en cero");

  console.log(`  ✓ Escribe exactamente ${TAM_OBS} números finitos y no se pasa`);
}

// 2. El tiempo al acercamiento máximo y la distancia de paso
{
  // Un enemigo que pasa de largo por arriba: viene desde la izquierda a la
  // altura del jugador menos 200 px, moviéndose en horizontal. Nunca se
  // acerca a menos de 200.
  const { room, p } = escena();
  room.enemies = [{ x: p.x - 400, y: p.y - 200, vx: 4, vy: 0, size: 30 }];
  codificar(room, "yo", obs, 0);

  const base = 12; // PROPIOS
  const t = obs[base + 5]; // tiempo al acercamiento, /120
  const margen = obs[base + 6]; // (distancia de paso - contacto) / 220
  const choca = obs[base + 7];

  // Pasa a distancia mínima cuando está justo arriba: 400/4 = 100 ticks.
  assert.ok(Math.abs(t * 120 - 100) < 1, `Esperaba ~100 ticks al acercamiento, dio ${t * 120}`);
  // Distancia de paso 200, contacto = 48/2 + 30*0.35 = 34.5 -> margen 165.5
  assert.ok(Math.abs(margen * 220 - 165.5) < 1, `Esperaba margen ~165.5, dio ${margen * 220}`);
  assert.strictEqual(choca, 0, "Pasando a 200 px no choca");

  console.log("  ✓ Calcula bien cuándo y a qué distancia va a pasar un enemigo que cruza de largo");
}

// 3. Un choque frontal se marca como choque
{
  const { room, p } = escena();
  // Viene de frente, exactamente a la altura del jugador.
  room.enemies = [{ x: p.x - 300, y: p.y, vx: 5, vy: 0, size: 30 }];
  codificar(room, "yo", obs, 0);

  const base = 12;
  assert.strictEqual(obs[base + 7], 1, "Un enemigo de frente a la misma altura es un choque");
  assert.ok(Math.abs(obs[base + 5] * 120 - 60) < 1, "Y llega en ~60 ticks (300/5)");
  assert.ok(obs[base + 6] < 0, "Con choque, el margen es negativo");

  console.log("  ✓ Marca el choque inminente y le da margen negativo");
}

// 4. Un enemigo que se aleja no es amenaza
{
  const { room, p } = escena();
  // Está cerca pero ya pasó: se va.
  room.enemies = [{ x: p.x + 60, y: p.y, vx: 6, vy: 0, size: 30 }];
  codificar(room, "yo", obs, 0);

  const base = 12;
  assert.strictEqual(obs[base + 5], 0, "El acercamiento máximo ya ocurrió: t = 0");
  assert.strictEqual(obs[base + 7], 0, "Y no choca");
  assert.ok(obs[base + 6] > 0, "Su margen es la distancia actual, positiva");

  console.log("  ✓ Un enemigo que ya pasó y se aleja no figura como amenaza");
}

// 5. El orden es por amenaza, no por distancia
{
  const { room, p } = escena();
  room.enemies = [
    // Pegado encima pero alejándose: inofensivo.
    { x: p.x + 55, y: p.y, vx: 8, vy: 0, size: 30 },
    // Lejos pero viene de frente a matarte.
    { x: p.x - 500, y: p.y, vx: 6, vy: 0, size: 30 },
  ];
  codificar(room, "yo", obs, 0);

  const base = 12;
  // El primer slot tiene que ser el que choca, no el más cercano.
  assert.strictEqual(obs[base + 7], 1, "El primero en la lista debe ser el que choca");
  assert.ok(obs[base + 0] < 0, "Y viene de la izquierda, así que su x relativa es negativa");

  console.log("  ✓ Ordena por amenaza y no por distancia: el que choca va primero");
}

// 6. Los avisos entran antes de que el enemigo exista
{
  const { room, p } = escena();
  // Un aviso a la derecha, todavía sin enemigo en la arena.
  room.warnings = [{ x: p.x + 300, y: p.y, vx: -5, vy: 0, spawnAt: room.tiempo + 400, size: 80 }];
  codificar(room, "yo", obs, 0);

  const offAvisos = 12 + ENEMIGOS_DETALLE * 8 + SECTORES * 2 * 3;
  // A la derecha exacta es el sector 0.
  assert.ok(obs[offAvisos] > 0, "El aviso tiene que contarse en su sector");
  assert.ok(obs[offAvisos + 1] > 0.5, "Y faltando 400 ms su urgencia es alta");
  assert.ok(Math.abs(obs[offAvisos + 2] - 0.8) < 0.01, "Reporta el tamaño del que viene (80/100)");

  // Sin ningún enemigo real, los slots de detalle quedan en cero.
  for (let i = 0; i < ENEMIGOS_DETALLE * 8; i++) {
    assert.strictEqual(obs[12 + i], 0, "Sin enemigos reales, el detalle queda vacío");
  }

  console.log("  ✓ Los avisos se perciben antes de que el enemigo exista, con urgencia y tamaño");
}

// 7. Las paredes se perciben por separado y con signo correcto
{
  const { room, p } = escena();
  p.x = CORRAL_X + p.size / 2; // pegado a la pared izquierda
  p.y = CY;
  codificar(room, "yo", obs, 0);

  assert.ok(Math.abs(obs[2]) < 1e-6, "Pegado a la izquierda, esa distancia es 0");
  assert.ok(obs[3] > 0.9, "Y la salida a la derecha es casi todo el corral");
  assert.ok(Math.abs(obs[0] + 1) < 0.05, "Su x normalizada está en el extremo -1");

  console.log("  ✓ Cada pared tiene su canal, así la política sabe hacia dónde tiene salida");
}

// 8. Compañeros: el progreso de reanimación se ve
{
  const { room, p } = escena("coop");
  const otro = room.addPlayer("otro", "Otro");
  otro.x = p.x + 20;
  otro.y = p.y;
  otro.alive = false;
  otro.reviveProgressMs = 1500; // mitad de camino
  otro.isBeingRevived = true;
  codificar(room, "yo", obs, 0);

  const offComp = 12 + ENEMIGOS_DETALLE * 8 + SECTORES * 2 * 3 + SECTORES * 3;
  assert.ok(obs[offComp] > 0, "Se ve al compañero a la derecha");
  assert.strictEqual(obs[offComp + 2], 0, "Está muerto");
  assert.ok(Math.abs(obs[offComp + 3] - 0.5) < 0.01, "Y va por la mitad de la reanimación");
  assert.strictEqual(obs[offComp + 4], 1, "Marcado como en reanimación");

  console.log("  ✓ Ve al compañero muerto y cuánto le falta para revivir");
}

// 9. El modo va explícito
{
  const a = escena("coop");
  codificar(a.room, "yo", obs, 0);
  assert.strictEqual(obs[10], 1);
  assert.strictEqual(obs[11], 0);

  const b = escena("battle");
  codificar(b.room, "yo", obs, 0);
  assert.strictEqual(obs[10], 0);
  assert.strictEqual(obs[11], 1);

  console.log("  ✓ El modo entra como canal propio: coop y battle exigen estrategias distintas");
}

// 10. Acciones
{
  const { room } = escena();

  assert.strictEqual(NUM_ACCIONES, 1 + RUMBOS);

  const quieto = decodificar(0);
  assert.deepStrictEqual(quieto, { dx: 0, dy: 0 }, "La acción 0 es quedarse quieto");

  for (let a = 1; a < NUM_ACCIONES; a++) {
    const { dx, dy } = decodificar(a);
    assert.ok(Math.abs(Math.hypot(dx, dy) - 1) < 1e-9, `El rumbo ${a} debe ser unitario`);
  }

  // Rumbos distintos, sin repetidos.
  const vistos = new Set();
  for (let a = 1; a < NUM_ACCIONES; a++) {
    const { dx, dy } = decodificar(a);
    vistos.add(`${dx.toFixed(6)},${dy.toFixed(6)}`);
  }
  assert.strictEqual(vistos.size, RUMBOS, "Los 16 rumbos son distintos");

  const msc = new Uint8Array(NUM_ACCIONES);
  mascara(room, "yo", msc, 0);
  assert.ok([...msc].every((v) => v === 1), "Todas las acciones son siempre legales");

  console.log(`  ✓ ${NUM_ACCIONES} acciones: quieto más ${RUMBOS} rumbos unitarios y distintos`);
}

// 11. La observación sobrevive una partida entera sin producir NaN
{
  // El caso que importa en la práctica: enemigos apareciendo y muriendo,
  // jugadores muriendo, el corral llenándose. Un solo NaN acá envenena el
  // gradiente y el entrenamiento se va a la nada sin decir por qué.
  const rng = (s) => { let x = s >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const room = new Room("LARGA", { isPublic: false, mode: "battle", random: rng(7) });
  for (let i = 0; i < 8; i++) room.addPlayer(`p${i}`, `P${i}`);
  room.beginPlaying();

  let peor = 0;
  for (let t = 0; t < 3600; t++) { // 2 minutos simulados
    for (const p of room.players.values()) {
      codificar(room, p.id, obs, 0);
      for (let i = 0; i < TAM_OBS; i++) {
        assert.ok(Number.isFinite(obs[i]), `NaN/Inf en el canal ${i} al tick ${t}`);
        if (Math.abs(obs[i]) > peor) peor = Math.abs(obs[i]);
      }
      const a = Math.floor(room.random() * NUM_ACCIONES);
      const { dx, dy } = decodificar(a);
      room.setInput(p.id, dx, dy);
    }
    if (room.tick(TICK_MS)) break;
  }

  assert.ok(peor < 20, `Algún canal se fue de escala: máximo ${peor.toFixed(2)}`);
  console.log(`  ✓ Dos minutos con 8 jugadores sin un solo NaN (canal más grande: ${peor.toFixed(2)})`);
}

console.log("\n¡Todos los tests de percepción de escapecv pasaron exitosamente!");
