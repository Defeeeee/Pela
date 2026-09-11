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
export const COUNTDOWN_MS = 5_000;
export const RESULTS_DISPLAY_MS = 12_000;
export const REVIVE_TIME_MS = 3_000;
export const IMMUNITY_TIME_MS = 1_000;
export const NAME_MAX_LEN = 16;

const PLAYER_SIZE = 48;
const COLLISION_ITERATIONS = 3;
const PLAYER_BASE_SPEED = 3.2;
const ENEMY_BASE_SPEED = 1.6;
const ENEMY_SPAWN_RATE_START = 1600;
const ENEMY_SPAWN_RATE_MIN = 700;

const COLORS = ["#ffeb3b", "#4caf50", "#2196f3", "#ff5722", "#e91e63", "#00bcd4", "#ff9800", "#9c27b0"];

const BOT_NAMES = [
  "Bot Yeyo", "AFIP-ela", "Peluca Fake", "Monotributo B", "DNI Folicular",
  "Piquete Capilar", "Don Barba", "Sirase Bot", "Pelado Sindical", "Gremialista",
];

/**
 * Niveles de dificultad de los bots, como frecuencia de decisión.
 *
 * `cada` es cada cuántos pasos de decisión vuelve a pensar: la política se
 * entrenó decidiendo a 10 Hz, y hacerla decidir menos seguido la hace reaccionar
 * más tarde sin mentirle sobre el mundo ni romperle la física. Es el handicap
 * honesto — no es un bot tonto, es un bot lento, que es exactamente en qué es
 * peor un jugador humano.
 *
 * El espaciado NO es lineal en `cada` porque la supervivencia no lo es: con
 * 9/6/4/1 los dos primeros niveles daban lo mismo (27,8 y 28,1 s) y entre los
 * dos últimos había un salto de 40 a 124. Con 9/4/2/1 queda repartido.
 *
 * Los segundos de cada nivel NO se cablean acá ni se muestran en la interfaz:
 * la política sigue entrenando y mejora, así que cualquier número absoluto
 * envejece. Lo que no envejece es el orden.
 *
 * Un solo checkpoint sirve toda la escalera, así que el entrenamiento puede
 * seguir mejorando sin que haya que archivar versiones por nivel.
 */
export const DIFICULTADES = {
  facil: { cada: 9, etiqueta: "Fácil" },
  normal: { cada: 4, etiqueta: "Normal" },
  dificil: { cada: 2, etiqueta: "Difícil" },
  imposible: { cada: 1, etiqueta: "Imposible" },
};
export const MAX_BOTS = MAX_PLAYERS - 1; // siempre queda lugar para un humano

/**
 * Ticks por decisión de un bot al nivel más alto.
 *
 * La política se entrenó decidiendo a 10 Hz y la sala tickea a 30, así que son
 * tres. Hacerla decidir a 30 Hz no la mejora: la saca de la distribución con la
 * que aprendió —los impulsos y las distancias se recorren en un tercio del
 * tiempo que ella espera— y encima triplica el costo. Medido: con un tick por
 * decisión el nivel "Imposible" rendía PEOR que "Difícil".
 */
const TICKS_POR_DECISION = 3;

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
  constructor(code, { isPublic = false, mode = "coop", random, politica = null } = {}) {
    this.code = code;
    this.isPublic = isPublic;
    this.mode = mode; // 'coop' | 'battle'

    /**
     * Reloj de la partida, en milisegundos simulados, que avanza SOLO en
     * `tick()`. Todo lo de adentro de la simulación —velocidades, oleadas,
     * inmunidad, tiempo sobrevivido— se mide contra esto y nunca contra
     * `Date.now()`.
     *
     * Es lo que permite correr la sala mil veces más rápido que el tiempo real
     * para entrenar. Con el reloj de pared, simular un tick tras otro sin
     * esperar deja los temporizadores clavados: para el código pasaron 33 ms y
     * para el reloj cero, así que las oleadas no entran nunca y la inmunidad no
     * se termina jamás. Ya rompió tres veces el entrenamiento del Agarrá.
     *
     * El lobby y la cuenta regresiva siguen en reloj de pared a propósito: los
     * maneja el loop del servidor, no la simulación, y en entrenamiento no
     * existen porque las salas arrancan ya jugando.
     */
    this.tiempo = 0;

    // Inyectable para que una sala con semilla sea reproducible. Sin esto no se
    // puede comparar dos políticas sobre las mismas oleadas.
    this.random = random || Math.random;

    /**
     * Política entrenada para manejar a los bots. Opcional a propósito: si no
     * viene, la sala no puede tener bots y el multijugador funciona igual. Un
     * modelo que falta nunca rompe el juego.
     *
     * El entrenamiento NO la pasa: sus agentes son los que aprenden.
     */
    this.politica = politica || null;
    this.bots = 0;                 // cuántos quiere el host
    this.dificultad = "normal";
    this.proximoBot = 1;
    this.ticksBot = 0;
    this.state = "lobby"; // 'lobby' | 'countdown' | 'playing' | 'ended'
    this.hostId = null;
    this.players = new Map(); // socketId -> player
    this.enemies = [];
    this.warnings = [];
    this.countdownEndsAt = null;
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

  /**
   * Cuántas personas hay. Es lo que decide si la sala sigue existiendo: con
   * bots, `playerCount` nunca llega a cero cuando se va el último humano, y una
   * sala abandonada quedaría tickeando bots para siempre.
   */
  get humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.esBot) n++;
    return n;
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
      reviveProgressMs: 0,
      isBeingRevived: false,
      immuneUntil: 0,
    };
    this.players.set(socketId, player);
    if (!this.hostId) this.hostId = socketId;
    // Un humano que entra puede desplazar a un bot: su lugar vale más.
    this.sincronizarBots();
    return player;
  }

  /**
   * Ajusta la cantidad de bots que pide el host.
   *
   * Se llama desde el lobby y en cada alta o baja de humano: los bots ceden el
   * lugar, porque una persona que entra vale más que un bot que ya está.
   */
  configurarBots(cantidad, dificultad) {
    if (DIFICULTADES[dificultad]) this.dificultad = dificultad;
    this.bots = Math.max(0, Math.min(MAX_BOTS, Math.floor(Number(cantidad) || 0)));
    this.sincronizarBots();
  }

  sincronizarBots() {
    const humanos = [...this.players.values()].filter((p) => !p.esBot).length;
    const actuales = [...this.players.values()].filter((p) => p.esBot);
    // Sin política no hay bots posibles, y el lugar de los humanos manda.
    const quiero = this.politica ? Math.min(this.bots, MAX_PLAYERS - humanos) : 0;

    for (let i = actuales.length; i > quiero; i--) this.players.delete(actuales[i - 1].id);
    for (let i = actuales.length; i < quiero; i++) this.#altaBot();

    // Y se le aplica la dificultad vigente a los que YA estaban. Sin esto,
    // cambiar el nivel sin cambiar la cantidad no hacía nada: ninguno de los
    // dos bucles de arriba corre, y los bots seguían con el nivel con el que
    // nacieron mientras la interfaz mostraba el nuevo.
    const dif = DIFICULTADES[this.dificultad] || DIFICULTADES.normal;
    let i = 0;
    for (const b of this.players.values()) {
      if (!b.esBot) continue;
      i++;
      b.cada = dif.cada * TICKS_POR_DECISION;
      b.fase = (i * TICKS_POR_DECISION) % Math.max(1, b.cada);
      b.name = `${b.nombreBase} · ${dif.etiqueta}`;
    }
  }

  #altaBot() {
    const n = this.proximoBot++;
    const id = `bot_${this.code}_${n}`;
    const dif = DIFICULTADES[this.dificultad] || DIFICULTADES.normal;
    const nombreBase = BOT_NAMES[(n - 1) % BOT_NAMES.length];
    const bot = {
      id,
      nombreBase,
      // El nivel va en el nombre: sin esto no se puede saber si al que te está
      // ganando lo maneja un bot lento o el de 10 Hz.
      name: `${nombreBase} · ${dif.etiqueta}`,
      color: COLORS[this.players.size % COLORS.length],
      x: CORRAL_X + CORRAL_W / 2,
      y: CORRAL_Y + CORRAL_H / 2,
      size: PLAYER_SIZE,
      speed: PLAYER_BASE_SPEED,
      dx: 0, dy: 0,
      alive: true,
      survivedMs: 0,
      reviveProgressMs: 0,
      isBeingRevived: false,
      immuneUntil: 0,
      esBot: true,
      // Cada bot juega en su propio espejo, sorteado al nacer. La política se
      // entrenó con los cuatro, así que le da igual — y en la cancha hace que
      // unos se vayan a una pared y otros a otra, en vez de amontonarse todos
      // en el mismo borde.
      espejo: this.politica.espejoAlAzar(this.random()),
      // En ticks, no en pasos de decisión: la sala cuenta ticks.
      cada: dif.cada * TICKS_POR_DECISION,
      // Fase para que no piensen todos en el mismo tick: con ocho bots y una
      // red de 1,75M de parámetros, hacerlos coincidir mete un tirón visible.
      fase: (n * TICKS_POR_DECISION) % Math.max(1, dif.cada * TICKS_POR_DECISION),
      accion: 0,
    };
    this.players.set(id, bot);
    return bot;
  }

  /** Deja que la política elija el rumbo de cada bot que le toque pensar. */
  #pensarBots() {
    if (!this.politica) return;
    const paso = this.ticksBot;
    for (const b of this.players.values()) {
      if (!b.esBot || !b.alive) continue;
      if (paso % b.cada !== b.fase % b.cada) continue;
      b.accion = this.politica.accionEnEspejo(this, b.id, b.espejo);
    }
    for (const b of this.players.values()) {
      if (!b.esBot || !b.alive) continue;
      const { dx, dy } = this.politica.vectorDe(b.accion);
      b.dx = dx; b.dy = dy;
    }
    this.ticksBot++;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    // Se liberó un lugar: si el host pidió bots, entra uno.
    this.sincronizarBots();
    if (this.hostId === socketId) {
      const next = [...this.players.values()].filter((p) => !p.esBot).map((p) => p.id)[Symbol.iterator]().next();
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
    // Hace falta al menos un humano: una sala de puros bots no le sirve a nadie
    // y el fin de ronda depende de que haya alguien a quien le importe.
    const humanos = [...this.players.values()].filter((p) => !p.esBot).length;
    return humanos >= 1 && (this.state === "lobby" || this.state === "ended");
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
    this.tiempo = 0;
    this.lastEnemyTime = 0;
    this.enemySpawnRate = ENEMY_SPAWN_RATE_START;
    this.enemies = [];
    this.warnings = [];
    for (const p of this.players.values()) {
      p.alive = true;
      p.survivedMs = 0;
      p.reviveProgressMs = 0;
      p.isBeingRevived = false;
      p.immuneUntil = 0;
      p.x = CORRAL_X + CORRAL_W / 2 + (this.random() - 0.5) * 100;
      p.y = CORRAL_Y + CORRAL_H / 2 + (this.random() - 0.5) * 100;
    }
  }

  /** Un tick de simulación. Devuelve true si la partida terminó en este tick. */
  tick(dtMs) {
    this.tiempo += dtMs;
    const now = this.tiempo;

    // Los bots deciden antes de que se mueva nadie, igual que un humano cuyo
    // input llegó entre dos ticks.
    this.#pensarBots();
    const elapsedS = now / 1000;

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
      p.survivedMs = now;
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

    // Revivir en modo cooperativo: si un compañero vivo se para encima durante 3s acumulativos
    if (this.mode === "coop") {
      const REVIVE_DIST = PLAYER_SIZE;

      for (const deadP of this.players.values()) {
        if (deadP.alive) continue;

        let hasTeammateOver = false;
        for (const aliveP of this.players.values()) {
          if (!aliveP.alive || aliveP.id === deadP.id) continue;
          const dist = Math.hypot(aliveP.x - deadP.x, aliveP.y - deadP.y);
          if (dist <= REVIVE_DIST) {
            hasTeammateOver = true;
            break;
          }
        }

        deadP.isBeingRevived = hasTeammateOver;

        if (hasTeammateOver) {
          deadP.reviveProgressMs = (deadP.reviveProgressMs || 0) + dtMs;
          if (deadP.reviveProgressMs >= REVIVE_TIME_MS) {
            deadP.alive = true;
            deadP.reviveProgressMs = 0;
            deadP.isBeingRevived = false;
            deadP.immuneUntil = now + IMMUNITY_TIME_MS; // 1 segundo de inmunidad al revivir
          }
        }
      }
    }

    const enemyBaseSpeed = ENEMY_BASE_SPEED + elapsedS * 0.05;

    // Spawns: mismo patrón que el modo Dodge solitario — oleadas que entran
    // desde afuera del mundo apuntando a un punto random del corral.
    if (now - this.lastEnemyTime > this.enemySpawnRate) {
      this.lastEnemyTime = now;
      const numToSpawn = 1 + Math.floor(this.random() * (1 + elapsedS / 15));
      for (let i = 0; i < numToSpawn; i++) {
        let ex, ey;
        const side = Math.floor(this.random() * 4);
        if (side === 0) { ex = this.random() * WORLD_WIDTH; ey = -60; }
        else if (side === 1) { ex = WORLD_WIDTH + 60; ey = this.random() * WORLD_HEIGHT; }
        else if (side === 2) { ex = this.random() * WORLD_WIDTH; ey = WORLD_HEIGHT + 60; }
        else { ex = -60; ey = this.random() * WORLD_HEIGHT; }

        const tx = CORRAL_X + this.random() * CORRAL_W;
        const ty = CORRAL_Y + this.random() * CORRAL_H;
        const dx = tx - ex, dy = ty - ey;
        const dist = Math.hypot(dx, dy) || 1;

        const isGiant = this.random() < 0.1 + elapsedS / 200;
        const size = isGiant ? 60 + this.random() * 40 : 20 + this.random() * 20;
        const speedFactor = isGiant ? 0.8 + this.random() * 0.5 : 1 + this.random();
        const espeed = Math.max(2, enemyBaseSpeed * speedFactor);

        this.warnings.push({
          x: ex, y: ey,
          vx: (dx / dist) * espeed, vy: (dy / dist) * espeed,
          spawnAt: now + 900 + this.random() * 500,
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
        if (p.immuneUntil && now < p.immuneUntil) continue; // Inmunidad activa tras revivir
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < p.size / 2 + hitboxR) {
          p.alive = false;
          p.survivedMs = now;
          p.reviveProgressMs = 0;
          p.isBeingRevived = false;
        }
      }

      if (e.x < -200 || e.x > WORLD_WIDTH + 200 || e.y < -200 || e.y > WORLD_HEIGHT + 200) {
        this.enemies.splice(i, 1);
      }
    }

    /**
     * Fin de partida.
     *
     * COOP espera a que caigan TODOS, humanos y bots. Que te reanimen es la
     * mecánica del modo, y para eso el bot necesita tiempo de caminar hasta el
     * cuerpo — no alcanza con darle margen sólo si ya está encima. Mientras
     * quede alguien en pie hay esperanza, y cuando cae el último se terminó
     * para todos a la vez.
     *
     * BATTLE corta cuando queda un solo sobreviviente, y además cuando no queda
     * ningún humano en pie: ahí no hay reanimación posible, así que seguir sería
     * hacerte mirar a dos bots peleando entre ellos por una ronda que ya
     * perdiste.
     */
    const aliveCount = this.alivePlayers().length;
    const humanos = [...this.players.values()].filter((p) => !p.esBot);
    const humanoEnPie = humanos.some((p) => p.alive);

    const shouldEnd =
      this.playerCount > 0 &&
      (aliveCount === 0 ||
        (this.mode === "battle" &&
          ((this.playerCount > 1 && aliveCount <= 1) || (humanos.length > 0 && !humanoEnPie))));

    if (shouldEnd) {
      this.state = "ended";
      this.endedAt = now;
      return true;
    }
    return false;
  }

  snapshot() {
    // `now` es el reloj simulado porque con él se comparan `immuneUntil` y
    // `spawnAt`, que ahora viven en esa línea de tiempo. `serverTime` en
    // cambio sigue siendo de pared: es la marca que el cliente usa para
    // interpolar entre snapshots, y tiene que ser comparable con su reloj.
    const now = this.tiempo;
    return {
      code: this.code,
      isPublic: this.isPublic,
      mode: this.mode,
      state: this.state,
      hostId: this.hostId,
      roundId: this.roundId,
      bots: this.bots,
      dificultad: this.dificultad,
      botsDisponibles: !!this.politica,
      maxBots: MAX_BOTS,
      countdownEndsAt: this.countdownEndsAt,
      countdownRemainingSec: this.countdownEndsAt ? Math.max(0, Math.ceil((this.countdownEndsAt - Date.now()) / 1000)) : null,
      serverTime: Date.now(),
      elapsedMs: this.state === "playing" || this.state === "ended" ? this.tiempo : 0,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color,
        x: p.x, y: p.y, size: p.size, alive: p.alive, survivedMs: p.survivedMs,
        reviveProgress: p.alive ? 0 : Math.min(1, (p.reviveProgressMs || 0) / REVIVE_TIME_MS),
        isBeingRevived: !!p.isBeingRevived,
        isImmune: !!(p.immuneUntil && now < p.immuneUntil),
      })),
      enemies: this.enemies.map((e) => ({ x: e.x, y: e.y, size: e.size, vx: e.vx, vy: e.vy })),
      warnings: this.warnings
        .filter((w) => w.spawnAt - now < 1200)
        .map((w) => ({ x: clamp(w.x, 0, WORLD_WIDTH), y: clamp(w.y, 0, WORLD_HEIGHT), size: w.size, spawnAt: w.spawnAt })),
    };
  }

  results() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, color: p.color, survivedMs: p.survivedMs, alive: p.alive, esBot: !!p.esBot }))
      .sort((a, b) => (b.alive - a.alive) || (b.survivedMs - a.survivedMs));
  }
}

export class RoomManager {
  constructor(politica = null) {
    this.politica = politica;
    this.rooms = new Map();
    // Dos lobbies públicos fijos, uno por modo. Evita tener que negociar el
    // modo entre desconocidos que ni se conocen entre sí.
    // Las públicas no llevan bots a propósito: nadie es dueño de la decisión y
    // los bots dispararían el arranque automático por cantidad de jugadores.
    this.rooms.set("PUBLIC-COOP", new Room("PUBLIC-COOP", { isPublic: true, mode: "coop" }));
    this.rooms.set("PUBLIC-BATTLE", new Room("PUBLIC-BATTLE", { isPublic: true, mode: "battle" }));
  }

  getPublicRoom(mode) {
    return this.rooms.get(mode === "battle" ? "PUBLIC-BATTLE" : "PUBLIC-COOP");
  }

  createPrivateRoom(mode) {
    let code;
    do { code = randomCode(4); } while (this.rooms.has(code));
    const room = new Room(code, { isPublic: false, mode, politica: this.politica });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(code);
  }

  /** Sala privada vacía: se borra. Las dos públicas son permanentes. */
  cleanupIfEmpty(room) {
    // Por humanos: una sala con bots pero sin nadie que los mire es basura que
    // sigue consumiendo un forward de 1,75M de parámetros por tick.
    if (!room.isPublic && room.humanCount === 0) {
      if (room.interval) clearInterval(room.interval);
      this.rooms.delete(room.code);
    }
  }
}
