export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;
export const PALAS_COUNT = 600;
export const INITIAL_MASS = 20;
export const PALA_MASS = 1;
export const EAT_MASS_RATIO = 1.25;
export const TARGET_POPULATION = 12;
export const BASE_SPEED = 260; // px/segundo a masa 1

// División (barra espaciadora). Un jugador deja de ser un círculo y pasa a ser
// una lista de células; p.x/p.y/p.mass quedan como agregados derivados.
export const MIN_SPLIT_MASS = 36;        // por debajo de esto no te podés dividir
export const MAX_CELLS = 8;              // el Agar original usa 16; 8 acota el costo del tick
export const SPLIT_IMPULSE = 520;        // px/s con los que sale disparado el pedazo
export const MERGE_COOLDOWN_MS = 12000;  // cuánto tarda en poder volver a juntarse
export const IMPULSE_DECAY = 4.5;        // 1/s: qué tan rápido se frena el impulso
export const MERGE_PULL = 90;            // px/s con los que se buscan una vez que pueden fusionarse

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

export function crearCelula(x, y, mass, mergeAt = 0) {
  return { x, y, mass, radius: radiusForMass(mass), vx: 0, vy: 0, mergeAt };
}

/**
 * Recalcula x/y/mass/radius del jugador a partir de sus células: el centroide
 * pesado por masa y la masa total. Mantener estos agregados es lo que permite
 * que los bots, el ranking en vivo y el snapshot sigan leyendo p.x y p.mass sin
 * enterarse de que ahora un jugador puede estar partido en varios pedazos.
 * El radio agregado es "equivalente" (el que tendría si estuviera entero) y se
 * usa sólo para la cámara y las decisiones de los bots, nunca para colisiones:
 * esas van célula por célula.
 */
export function sincronizarAgregados(p) {
  if (!p.cells || p.cells.length === 0) {
    p.alive = false;
    p.mass = 0;
    p.radius = 0;
    return;
  }

  let masa = 0;
  let sx = 0;
  let sy = 0;
  for (const c of p.cells) {
    masa += c.mass;
    sx += c.x * c.mass;
    sy += c.y * c.mass;
  }

  p.mass = masa;
  p.x = sx / masa;
  p.y = sy / masa;
  p.radius = radiusForMass(masa);
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
      cells: [crearCelula(x, y, mass)],
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

    const x = Math.round(200 + Math.random() * (WORLD_WIDTH - 400));
    const y = Math.round(200 + Math.random() * (WORLD_HEIGHT - 400));

    player.cells = [crearCelula(x, y, INITIAL_MASS)];
    player.dx = 0;
    player.dy = 0;
    player.alive = true;
    sincronizarAgregados(player);
    return player;
  }

  /**
   * Divide cada célula suficientemente grande en dos, lanzando la mitad nueva
   * hacia donde apunta el jugador. Es la mecánica que te deja alcanzar a alguien
   * más rápido que vos, a cambio de quedar partido y vulnerable un rato.
   */
  splitPlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;

    const now = Date.now();
    const nuevas = [];

    // Dirección del lanzamiento: hacia donde apunta el mouse. Si está quieto,
    // se dispara a la derecha para que la tecla nunca quede sin efecto.
    const len = Math.hypot(p.dx, p.dy);
    const ux = len > 0 ? p.dx / len : 1;
    const uy = len > 0 ? p.dy / len : 0;

    for (const c of p.cells) {
      if (p.cells.length + nuevas.length >= MAX_CELLS) break;
      if (c.mass < MIN_SPLIT_MASS) continue;

      const mitad = c.mass / 2;
      c.mass = mitad;
      c.radius = radiusForMass(mitad);
      c.mergeAt = now + MERGE_COOLDOWN_MS;

      const hija = crearCelula(
        c.x + ux * c.radius,
        c.y + uy * c.radius,
        mitad,
        now + MERGE_COOLDOWN_MS
      );
      hija.vx = ux * SPLIT_IMPULSE;
      hija.vy = uy * SPLIT_IMPULSE;
      nuevas.push(hija);
    }

    if (!nuevas.length) return;
    p.cells.push(...nuevas);
    sincronizarAgregados(p);
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
      cells: [crearCelula(x, y, mass)],
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

    // 1. Mover cada célula. La velocidad depende de la masa DE LA CÉLULA, no
    //    del jugador: por eso al dividirte los pedazos corren más que el entero.
    for (const p of this.players.values()) {
      if (!p.alive) continue;

      const frenado = Math.exp(-IMPULSE_DECAY * dtSeconds);

      for (const c of p.cells) {
        const speed = BASE_SPEED / Math.pow(c.mass, 0.32);
        c.x += (p.dx * speed + c.vx) * dtSeconds;
        c.y += (p.dy * speed + c.vy) * dtSeconds;

        // El envión de la división se va apagando solo.
        c.vx *= frenado;
        c.vy *= frenado;

        c.radius = radiusForMass(c.mass);
        c.x = clamp(c.x, c.radius, WORLD_WIDTH - c.radius);
        c.y = clamp(c.y, c.radius, WORLD_HEIGHT - c.radius);
      }
    }

    // 1b. Células propias entre sí: o se vuelven a fusionar (si ya pasó el
    //     enfriamiento) o se empujan para no quedar apiladas una encima de otra.
    for (const p of this.players.values()) {
      if (!p.alive || p.cells.length < 2) continue;

      for (let i = 0; i < p.cells.length; i++) {
        for (let j = i + 1; j < p.cells.length; j++) {
          const a = p.cells[i];
          const b = p.cells[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = a.radius + b.radius;
          const puedenFusionarse = now >= a.mergeAt && now >= b.mergeAt;

          if (puedenFusionarse) {
            if (dist < Math.max(a.radius, b.radius)) {
              a.mass += b.mass;
              a.radius = radiusForMass(a.mass);
              a.vx = 0;
              a.vy = 0;
              p.cells.splice(j, 1);
              j--;
              continue;
            }

            // Ya venció el enfriamiento pero todavía no se tocan: se atraen
            // despacio hasta juntarse. Sin esto quedan flotando en paralelo
            // para siempre, porque todas siguen el mismo input y nunca se
            // cruzan solas: te quedabas partido y débil de forma permanente.
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            const acercar = MERGE_PULL * dtSeconds;
            a.x += nx * acercar;
            a.y += ny * acercar;
            b.x -= nx * acercar;
            b.y -= ny * acercar;
            continue;
          }

          // Todavía no pueden fusionarse: sólo se despegan si se solapan.
          if (dist >= minDist) continue;

          const nx = dist === 0 ? 1 : dx / dist;
          const ny = dist === 0 ? 0 : dy / dist;
          const solape = (minDist - (dist === 0 ? 0.0001 : dist)) / 2;
          a.x -= nx * solape;
          a.y -= ny * solape;
          b.x += nx * solape;
          b.y += ny * solape;
        }
      }

      // El clamp de pared va DESPUÉS de separar, no antes: si no, empujar dos
      // células contra un borde las deja fuera del mapa. Mismo error que ya
      // apareció dos veces en este proyecto (/escapa y el battle de /escapecv).
      for (const c of p.cells) {
        c.x = clamp(c.x, c.radius, WORLD_WIDTH - c.radius);
        c.y = clamp(c.y, c.radius, WORLD_HEIGHT - c.radius);
      }
    }

    // 2. Colisión de cada célula con las palas
    for (const p of this.players.values()) {
      if (!p.alive) continue;

      for (const c of p.cells) {
        const r = c.radius;
        const rSq = r * r;

        for (const pala of this.palas.values()) {
          const dx = pala.x - c.x;
          const dy = pala.y - c.y;
          if (Math.abs(dx) > r || Math.abs(dy) > r) continue;

          if (dx * dx + dy * dy < rSq) {
            this.palas.delete(pala.id);
            this.eatenPalasSinceSnapshot.push(pala.id);
            c.mass += PALA_MASS;
            c.radius = radiusForMass(c.mass);
          }
        }
      }
    }

    // 3. Comerse entre jugadores, célula contra célula. Un jugador recién muere
    //    cuando le comieron TODAS sus células.
    const aliveList = [...this.players.values()].filter((p) => p.alive);
    for (const a of aliveList) {
      if (!a.alive) continue;

      for (const b of aliveList) {
        if (a === b || !b.alive) continue;

        for (const ca of a.cells) {
          for (let j = 0; j < b.cells.length; j++) {
            const cb = b.cells[j];
            if (ca.mass < cb.mass * EAT_MASS_RATIO) continue;

            const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y);
            if (dist >= ca.radius) continue;

            ca.mass += cb.mass;
            ca.radius = radiusForMass(ca.mass);
            b.cells.splice(j, 1);
            j--;

            if (b.cells.length === 0) {
              b.alive = false;
              a.kills = (a.kills || 0) + 1;

              if (b.isBot) {
                setTimeout(() => {
                  if (this.players.has(b.id)) {
                    this.respawnPlayer(b.id);
                  }
                }, 2000);
              }
              break;
            }
          }
          if (!b.alive) break;
        }
      }
    }

    // 4. Recalcular los agregados una sola vez, ya con todo resuelto.
    for (const p of this.players.values()) {
      if (p.alive) sincronizarAgregados(p);
    }

    // 5. Reponer palas si bajaron de PALAS_COUNT
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
        // x/y/mass/radius son el agregado: los usa el ranking en vivo y la
        // cámara. El dibujo real va por `cells`, que es lo que puede ser más
        // de un círculo cuando el jugador se dividió.
        x: Math.round(p.x),
        y: Math.round(p.y),
        mass: Math.round(p.mass),
        radius: Math.round(p.radius),
        cells: (p.cells || []).map((c) => ({
          x: Math.round(c.x),
          y: Math.round(c.y),
          r: Math.round(c.radius),
        })),
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
