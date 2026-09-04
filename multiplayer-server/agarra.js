export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;
export const PALAS_COUNT = 600;
export const INITIAL_MASS = 20;
export const PALA_MASS = 1;
export const EAT_MASS_RATIO = 1.25;
export const MASS_DECAY_THRESHOLD = 200;
export const MASS_DECAY_RATE = 0.001; // 0.1% por segundo
export const TARGET_POPULATION = 12;
export const BASE_SPEED = 260; // px/segundo a masa 1

export const COLORS = [
  "#ffeb3b", "#4caf50", "#2196f3", "#ff5722",
  "#e91e63", "#00bcd4", "#ff9800", "#9c27b0",
  "#00e676", "#ff1744", "#7c4dff", "#ffea00",
];

const BOT_NAMES = [
  "Pelado Sindical",
  "Bot Yeyo",
  "AFIP-ela",
  "Pala Furiosa",
  "Peluca Fake",
  "Monotributo B",
  "Gremialista",
  "DNI Folicular",
  "Piquete Capilar",
  "Don Barba",
  "Sirase Bot",
  "Inspector Pelilargo",
];

export function radiusForMass(mass) {
  return Math.max(14, Math.sqrt(Math.max(1, mass)) * 4);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function sanitizeName(name) {
  const trimmed = String(name || "").trim().slice(0, 16);
  return trimmed || "Pelado Anónimo";
}

export class Arena {
  constructor() {
    this.players = new Map(); // socketId -> player
    this.palas = new Map(); // palaId -> { id, x, y }
    this.nextPalaId = 1;

    this.eatenPalasSinceSnapshot = [];
    this.newPalasSinceSnapshot = [];

    this.nextBotId = 1;

    // Inicializar las 600 palas repartidas por el mapa
    this.initPalas();
    // Las palas iniciales se entregan completas en allPalas() al unirse; no van en deltas
    this.newPalasSinceSnapshot = [];

    // Mantener la población base con bots
    this.syncBots();
  }

  initPalas() {
    for (let i = 0; i < PALAS_COUNT; i++) {
      this.spawnPala();
    }
  }

  spawnPala() {
    const id = this.nextPalaId++;
    const x = Math.round(50 + Math.random() * (WORLD_WIDTH - 100));
    const y = Math.round(50 + Math.random() * (WORLD_HEIGHT - 100));
    const pala = { id, x, y };
    this.palas.set(id, pala);
    this.newPalasSinceSnapshot.push([id, x, y]);
    return pala;
  }

  allPalas() {
    const list = [];
    for (const p of this.palas.values()) {
      list.push([p.id, p.x, p.y]);
    }
    return list;
  }

  addPlayer(socketId, name) {
    if (this.players.has(socketId)) {
      const existing = this.players.get(socketId);
      existing.name = sanitizeName(name);
      if (!existing.alive) this.respawnPlayer(socketId);
      return existing;
    }

    const color = COLORS[this.players.size % COLORS.length];
    const x = Math.round(200 + Math.random() * (WORLD_WIDTH - 400));
    const y = Math.round(200 + Math.random() * (WORLD_HEIGHT - 400));
    const mass = INITIAL_MASS;

    const player = {
      id: socketId,
      name: sanitizeName(name),
      color,
      x,
      y,
      mass,
      radius: radiusForMass(mass),
      dx: 0,
      dy: 0,
      alive: true,
      isBot: false,
      kills: 0,
      joinedAt: Date.now(),
    };

    this.players.set(socketId, player);
    this.syncBots();
    return player;
  }

  respawnPlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    player.mass = INITIAL_MASS;
    player.radius = radiusForMass(player.mass);
    player.x = Math.round(200 + Math.random() * (WORLD_WIDTH - 400));
    player.y = Math.round(200 + Math.random() * (WORLD_HEIGHT - 400));
    player.dx = 0;
    player.dy = 0;
    player.alive = true;
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.syncBots();
  }

  setInput(socketId, dx, dy) {
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;

    let vx = Number(dx) || 0;
    let vy = Number(dy) || 0;
    const len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
    }
    player.dx = vx;
    player.dy = vy;
  }

  syncBots() {
    const humanCount = [...this.players.values()].filter((p) => !p.isBot).length;
    const desiredBots = Math.max(0, TARGET_POPULATION - humanCount);
    const currentBots = [...this.players.values()].filter((p) => p.isBot);

    if (currentBots.length > desiredBots) {
      const toRemove = currentBots.slice(0, currentBots.length - desiredBots);
      for (const bot of toRemove) {
        this.players.delete(bot.id);
      }
    } else if (currentBots.length < desiredBots) {
      const needed = desiredBots - currentBots.length;
      for (let i = 0; i < needed; i++) {
        this.spawnBot();
      }
    }
  }

  spawnBot() {
    const id = `bot_${this.nextBotId++}`;
    const nameIndex = (this.nextBotId - 1) % BOT_NAMES.length;
    const name = BOT_NAMES[nameIndex];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const x = Math.round(200 + Math.random() * (WORLD_WIDTH - 400));
    const y = Math.round(200 + Math.random() * (WORLD_HEIGHT - 400));
    const mass = INITIAL_MASS + Math.floor(Math.random() * 15);

    const bot = {
      id,
      name,
      color,
      x,
      y,
      mass,
      radius: radiusForMass(mass),
      dx: 0,
      dy: 0,
      alive: true,
      isBot: true,
      kills: 0,
      joinedAt: Date.now(),
      botChangeTargetAt: 0,
    };

    this.players.set(id, bot);
    return bot;
  }

  updateBots(now) {
    for (const bot of this.players.values()) {
      if (!bot.isBot || !bot.alive) continue;

      let nearestThreat = null;
      let minThreatDist = Infinity;
      const threatScanRange = bot.radius * 3 + 120;

      let nearestPrey = null;
      let minPreyDist = Infinity;
      const preyScanRange = bot.radius * 2.5 + 160;

      for (const other of this.players.values()) {
        if (other.id === bot.id || !other.alive) continue;
        const d = Math.hypot(other.x - bot.x, other.y - bot.y);

        if (other.mass >= bot.mass * EAT_MASS_RATIO && d < threatScanRange) {
          if (d < minThreatDist) {
            minThreatDist = d;
            nearestThreat = other;
          }
        } else if (bot.mass >= other.mass * EAT_MASS_RATIO && d < preyScanRange) {
          if (d < minPreyDist) {
            minPreyDist = d;
            nearestPrey = other;
          }
        }
      }

      if (nearestThreat) {
        const vx = bot.x - nearestThreat.x;
        const vy = bot.y - nearestThreat.y;
        const len = Math.hypot(vx, vy) || 1;
        bot.dx = vx / len;
        bot.dy = vy / len;
        bot.botChangeTargetAt = now + 400;
        continue;
      }

      if (nearestPrey) {
        const vx = nearestPrey.x - bot.x;
        const vy = nearestPrey.y - bot.y;
        const len = Math.hypot(vx, vy) || 1;
        bot.dx = vx / len;
        bot.dy = vy / len;
        bot.botChangeTargetAt = now + 500;
        continue;
      }

      if (now >= bot.botChangeTargetAt) {
        bot.botChangeTargetAt = now + 1000 + Math.random() * 1000;

        let bestPala = null;
        let bestDist = Infinity;
        let checked = 0;

        for (const pala of this.palas.values()) {
          const d = Math.hypot(pala.x - bot.x, pala.y - bot.y);
          if (d < bestDist) {
            bestDist = d;
            bestPala = pala;
          }
          if (++checked > 60) break;
        }

        if (bestPala && bestDist < 1200) {
          const vx = bestPala.x - bot.x;
          const vy = bestPala.y - bot.y;
          const len = Math.hypot(vx, vy) || 1;
          bot.dx = vx / len;
          bot.dy = vy / len;
        } else {
          const angle = Math.random() * Math.PI * 2;
          bot.dx = Math.cos(angle);
          bot.dy = Math.sin(angle);
        }
      }
    }
  }

  tick(dtMs = 1000 / 30) {
    const now = Date.now();
    const dtSeconds = dtMs / 1000;

    this.updateBots(now);

    // 1. Mover jugadores y bots vivos
    for (const p of this.players.values()) {
      if (!p.alive) continue;

      const speed = BASE_SPEED / Math.pow(p.mass, 0.32);
      p.x += p.dx * speed * dtSeconds;
      p.y += p.dy * speed * dtSeconds;

      p.radius = radiusForMass(p.mass);
      p.x = clamp(p.x, p.radius, WORLD_WIDTH - p.radius);
      p.y = clamp(p.y, p.radius, WORLD_HEIGHT - p.radius);

      if (p.mass > MASS_DECAY_THRESHOLD) {
        p.mass = Math.max(MASS_DECAY_THRESHOLD, p.mass - p.mass * MASS_DECAY_RATE * dtSeconds);
        p.radius = radiusForMass(p.mass);
      }
    }

    // 2. Colisión jugador con palas
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const r = p.radius;
      const rSq = r * r;

      for (const pala of this.palas.values()) {
        const dx = pala.x - p.x;
        const dy = pala.y - p.y;
        if (Math.abs(dx) > r || Math.abs(dy) > r) continue;

        if (dx * dx + dy * dy < rSq) {
          this.palas.delete(pala.id);
          this.eatenPalasSinceSnapshot.push(pala.id);
          p.mass += PALA_MASS;
          p.radius = radiusForMass(p.mass);
        }
      }
    }

    // 3. Colisión jugador con jugador (comerse entre sí)
    const aliveList = [...this.players.values()].filter((p) => p.alive);
    for (let i = 0; i < aliveList.length; i++) {
      const a = aliveList[i];
      if (!a.alive) continue;

      for (let j = 0; j < aliveList.length; j++) {
        if (i === j) continue;
        const b = aliveList[j];
        if (!b.alive) continue;

        if (a.mass >= b.mass * EAT_MASS_RATIO) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < a.radius) {
            b.alive = false;
            a.mass += b.mass;
            a.radius = radiusForMass(a.mass);
            a.kills = (a.kills || 0) + 1;

            if (b.isBot) {
              setTimeout(() => {
                if (this.players.has(b.id)) {
                  this.respawnPlayer(b.id);
                }
              }, 2000);
            }
          }
        }
      }
    }

    // 4. Reponer palas si bajaron de PALAS_COUNT
    const missingPalas = PALAS_COUNT - this.palas.size;
    if (missingPalas > 0) {
      const toSpawn = Math.min(10, missingPalas);
      for (let i = 0; i < toSpawn; i++) {
        this.spawnPala();
      }
    }
  }

  deltaSnapshot() {
    const eaten = this.eatenPalasSinceSnapshot;
    this.eatenPalasSinceSnapshot = [];

    const newPalas = this.newPalasSinceSnapshot;
    this.newPalasSinceSnapshot = [];

    const playersList = [];
    for (const p of this.players.values()) {
      playersList.push({
        id: p.id,
        name: p.name,
        color: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y),
        mass: Math.round(p.mass),
        radius: Math.round(p.radius),
        alive: p.alive,
        isBot: p.isBot,
        kills: p.kills,
      });
    }

    const leaderboard = [...this.players.values()]
      .filter((p) => p.alive)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        name: p.name,
        mass: Math.round(p.mass),
        isBot: p.isBot,
      }));

    return {
      t: Date.now(),
      eaten,
      newPalas,
      players: playersList,
      leaderboard,
    };
  }
}
