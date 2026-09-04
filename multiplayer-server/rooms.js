// Mundo fijo en coordenadas de servidor. El cliente escala su canvas a este
// tamaño para dibujar, así todos los jugadores ven el mismo mapa sin importar
// la resolución de su pantalla. Estos números tienen que coincidir con los
// del cliente (app/escapecv/MultiplayerGame.js) porque no hay build step
// compartido entre este proceso standalone y la app Next.
export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 900;
export const CORRAL_W = WORLD_WIDTH * 0.707;
export const CORRAL_H = WORLD_HEIGHT * 0.707;
export const CORRAL_X = (WORLD_WIDTH - CORRAL_W) / 2;
export const CORRAL_Y = (WORLD_HEIGHT - CORRAL_H) / 2;

export const TICK_MS = 1000 / 30;
export const MAX_PLAYERS = 8;
export const PUBLIC_LOBBY_MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 10_000;
export const RESULTS_DISPLAY_MS = 12_000;
export const NAME_MAX_LEN = 16;

const PLAYER_SIZE = 48;
const COLLISION_ITERATIONS = 3;
const PLAYER_BASE_SPEED = 3.2;
const ENEMY_BASE_SPEED = 1.6;
const ENEMY_SPAWN_RATE_START = 1600;
const ENEMY_SPAWN_RATE_MIN = 700;

const COLORS = ["#ffeb3b", "#4caf50", "#2196f3", "#ff5722", "#e91e63", "#00bcd4", "#ff9800", "#9c27b0"];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I, se confunden al dictar por WhatsApp

function randomCode(len = 4) {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeName(name) {
  const trimmed = String(name || "").trim().slice(0, NAME_MAX_LEN);
  return trimmed || "Pelado Anónimo";
}

export class Room {
  constructor(code, { isPublic = false, mode = "coop" } = {}) {
    this.code = code;
    this.isPublic = isPublic;
    this.mode = mode; // 'coop' | 'battle'
    this.state = "lobby"; // 'lobby' | 'countdown' | 'playing' | 'ended'
    this.hostId = null;
    this.players = new Map(); // socketId -> player
    this.enemies = [];
    this.warnings = [];
    this.countdownEndsAt = null;
    this.startTime = null;
    this.lastEnemyTime = 0;
    this.enemySpawnRate = ENEMY_SPAWN_RATE_START;
    this.interval = null;
    this.endedAt = null;
    // Se incrementa en cada beginPlaying(): identifica la ronda para que el
    // cliente pueda cobrar el peaje de Reserva de Pala una vez por partida,
    // incluso cuando una sala privada se rejuega con el mismo código.
    this.roundId = 0;
  }

  get playerCount() {
    return this.players.size;
  }

  addPlayer(socketId, name) {
    const color = COLORS[this.players.size % COLORS.length];
    const player = {
      id: socketId,
      name: sanitizeName(name),
      color,
      x: CORRAL_X + CORRAL_W / 2,
      y: CORRAL_Y + CORRAL_H / 2,
      size: PLAYER_SIZE,
      speed: PLAYER_BASE_SPEED,
      dx: 0,
      dy: 0,
      alive: true,
      survivedMs: 0,
    };
    this.players.set(socketId, player);
    if (!this.hostId) this.hostId = socketId;
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.hostId === socketId) {
      const next = this.players.keys().next();
      this.hostId = next.done ? null : next.value;
    }
  }

  setInput(socketId, dx, dy) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    // El cliente ya normaliza el vector, pero no confiamos en eso: un cliente
    // modificado podría mandar dx=5 para moverse más rápido que el resto.
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    p.dx = Number.isFinite(dx) ? dx : 0;
    p.dy = Number.isFinite(dy) ? dy : 0;
  }

  alivePlayers() {
    return [...this.players.values()].filter((p) => p.alive);
  }

  canStart() {
    return this.playerCount >= 1 && (this.state === "lobby" || this.state === "ended");
  }

  startCountdown() {
    if (this.state !== "lobby") return;
    this.state = "countdown";
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  }

  cancelCountdown() {
    if (this.state !== "countdown") return;
    this.state = "lobby";
    this.countdownEndsAt = null;
  }

  beginPlaying() {
    this.state = "playing";
    this.roundId++;
    this.startTime = Date.now();
    this.lastEnemyTime = this.startTime;
    this.enemySpawnRate = ENEMY_SPAWN_RATE_START;
    this.enemies = [];
    this.warnings = [];
    for (const p of this.players.values()) {
      p.alive = true;
      p.survivedMs = 0;
      p.x = CORRAL_X + CORRAL_W / 2 + (Math.random() - 0.5) * 100;
      p.y = CORRAL_Y + CORRAL_H / 2 + (Math.random() - 0.5) * 100;
    }
  }

  /** Un tick de simulación. Devuelve true si la partida terminó en este tick. */
  tick(dtMs) {
    const now = Date.now();
    const elapsedS = (now - this.startTime) / 1000;

    // Movimiento de jugadores vivos, con velocidad creciente igual que el
    // modo solitario (ver app/escapecv/page.js): así se siente parecido.
    const speed = PLAYER_BASE_SPEED + elapsedS * 0.05;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.speed = speed;
      p.x += p.dx * p.speed;
      p.y += p.dy * p.speed;
      p.x = clamp(p.x, CORRAL_X + p.size / 2, CORRAL_X + CORRAL_W - p.size / 2);
      p.y = clamp(p.y, CORRAL_Y + p.size / 2, CORRAL_Y + CORRAL_H - p.size / 2);
      p.survivedMs = now - this.startTime;
    }

    // Battle royale: los jugadores se empujan entre sí, así que te pueden
    // mandar contra una pala. Coop: se atraviesan, nadie estorba a nadie.
    //
    // Varias pasadas con el clamp de pared intercalado en cada una, no sólo
    // al final: separar un par cerca de una esquina puede volver a encimarlo
    // contra la pared si el clamp corre después. Mismo bug (y mismo arreglo)
    // que la colisión entre los pelados de /escapa.
    if (this.mode === "battle") {
      const alive = this.alivePlayers();
      for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
        for (let i = 0; i < alive.length; i++) {
          for (let j = i + 1; j < alive.length; j++) {
            const a = alive[i], b = alive[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            let dist = Math.hypot(dx, dy);
            const minDist = (a.size + b.size) / 2;
            if (dist >= minDist) continue;

            if (dist === 0) {
              // Superpuestos exactos: dirección fija en vez de dividir por cero.
              dx = 1; dy = 0; dist = 0.0001;
            }
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
          }
        }
        for (const p of alive) {
          p.x = clamp(p.x, CORRAL_X + p.size / 2, CORRAL_X + CORRAL_W - p.size / 2);
          p.y = clamp(p.y, CORRAL_Y + p.size / 2, CORRAL_Y + CORRAL_H - p.size / 2);
        }
      }
    }

    const enemyBaseSpeed = ENEMY_BASE_SPEED + elapsedS * 0.05;

    // Spawns: mismo patrón que el modo Dodge solitario — oleadas que entran
    // desde afuera del mundo apuntando a un punto random del corral.
    if (now - this.lastEnemyTime > this.enemySpawnRate) {
      this.lastEnemyTime = now;
      const numToSpawn = 1 + Math.floor(Math.random() * (1 + elapsedS / 15));
      for (let i = 0; i < numToSpawn; i++) {
        let ex, ey;
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { ex = Math.random() * WORLD_WIDTH; ey = -60; }
        else if (side === 1) { ex = WORLD_WIDTH + 60; ey = Math.random() * WORLD_HEIGHT; }
        else if (side === 2) { ex = Math.random() * WORLD_WIDTH; ey = WORLD_HEIGHT + 60; }
        else { ex = -60; ey = Math.random() * WORLD_HEIGHT; }

        const tx = CORRAL_X + Math.random() * CORRAL_W;
        const ty = CORRAL_Y + Math.random() * CORRAL_H;
        const dx = tx - ex, dy = ty - ey;
        const dist = Math.hypot(dx, dy) || 1;

        const isGiant = Math.random() < 0.1 + elapsedS / 200;
        const size = isGiant ? 60 + Math.random() * 40 : 20 + Math.random() * 20;
        const speedFactor = isGiant ? 0.8 + Math.random() * 0.5 : 1 + Math.random();
        const espeed = Math.max(2, enemyBaseSpeed * speedFactor);

        this.warnings.push({
          x: ex, y: ey,
          vx: (dx / dist) * espeed, vy: (dy / dist) * espeed,
          spawnAt: now + 900 + Math.random() * 500,
          size,
        });
      }
      this.enemySpawnRate = Math.max(ENEMY_SPAWN_RATE_MIN, this.enemySpawnRate - 40);
    }

    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      if (now >= w.spawnAt) {
        this.enemies.push({ x: w.x, y: w.y, vx: w.vx, vy: w.vy, size: w.size });
        this.warnings.splice(i, 1);
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.x += e.vx;
      e.y += e.vy;

      const hitboxR = e.size * 0.35;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < p.size / 2 + hitboxR) {
          p.alive = false;
          p.survivedMs = now - this.startTime;
        }
      }

      if (e.x < -200 || e.x > WORLD_WIDTH + 200 || e.y < -200 || e.y > WORLD_HEIGHT + 200) {
        this.enemies.splice(i, 1);
      }
    }

    // Fin de partida: coop termina cuando no queda nadie vivo; battle royale
    // también corta apenas queda un único sobreviviente (ganó).
    const aliveCount = this.alivePlayers().length;
    const shouldEnd =
      this.playerCount > 0 &&
      (aliveCount === 0 || (this.mode === "battle" && this.playerCount > 1 && aliveCount <= 1));

    if (shouldEnd) {
      this.state = "ended";
      this.endedAt = now;
      return true;
    }
    return false;
  }

  snapshot() {
    return {
      code: this.code,
      isPublic: this.isPublic,
      mode: this.mode,
      state: this.state,
      hostId: this.hostId,
      roundId: this.roundId,
      countdownEndsAt: this.countdownEndsAt,
      elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color,
        x: p.x, y: p.y, size: p.size, alive: p.alive, survivedMs: p.survivedMs,
      })),
      enemies: this.enemies.map((e) => ({ x: e.x, y: e.y, size: e.size, vx: e.vx, vy: e.vy })),
      warnings: this.warnings
        .filter((w) => w.spawnAt - Date.now() < 1200)
        .map((w) => ({ x: clamp(w.x, 0, WORLD_WIDTH), y: clamp(w.y, 0, WORLD_HEIGHT), size: w.size, spawnAt: w.spawnAt })),
    };
  }

  results() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, color: p.color, survivedMs: p.survivedMs, alive: p.alive }))
      .sort((a, b) => (b.alive - a.alive) || (b.survivedMs - a.survivedMs));
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    // Dos lobbies públicos fijos, uno por modo. Evita tener que negociar el
    // modo entre desconocidos que ni se conocen entre sí.
    this.rooms.set("PUBLIC-COOP", new Room("PUBLIC-COOP", { isPublic: true, mode: "coop" }));
    this.rooms.set("PUBLIC-BATTLE", new Room("PUBLIC-BATTLE", { isPublic: true, mode: "battle" }));
  }

  getPublicRoom(mode) {
    return this.rooms.get(mode === "battle" ? "PUBLIC-BATTLE" : "PUBLIC-COOP");
  }

  createPrivateRoom(mode) {
    let code;
    do { code = randomCode(4); } while (this.rooms.has(code));
    const room = new Room(code, { isPublic: false, mode });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(code);
  }

  /** Sala privada vacía: se borra. Las dos públicas son permanentes. */
  cleanupIfEmpty(room) {
    if (!room.isPublic && room.playerCount === 0) {
      if (room.interval) clearInterval(room.interval);
      this.rooms.delete(room.code);
    }
  }
}
