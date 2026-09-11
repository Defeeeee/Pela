import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  RoomManager,
  TICK_MS,
  MAX_PLAYERS,
  PUBLIC_LOBBY_MIN_PLAYERS,
  RESULTS_DISPLAY_MS,
} from "./rooms.js";
import {
  Arena,
  WORLD_WIDTH as AGARRA_WORLD_W,
  WORLD_HEIGHT as AGARRA_WORLD_H,
} from "./agarra.js";
import { cargarPoliticas } from "./politica-bots.js";
import { cargarPolitica as cargarPoliticaEscape } from "./politica-escape.js";
import { LeaderboardStore } from "./leaderboard.js";
import { escenaPublica, registrarIntento as registrarPalas } from "./palas.js";
import { puzzleDelDia, registrarIntento as registrarBitGolf } from "./bitgolf.js";
import { secuenciaPublica, registrarIntento as registrarPila } from "./pila.js";

const PORT = process.env.MP_PORT || 9315;
// Override por si hace falta probar desde otro dispositivo de la LAN (por
// ejemplo el celular, para los controles táctiles del Agarrá).
const MP_HOST = process.env.MP_HOST || "127.0.0.1";
// Dónde preguntar quién es cada jugador. Se le delega la validación al sitio
// en vez de duplicar acá la criptografía de la sesión: un solo lugar sabe
// verificar tokens, y si mañana cambia el formato no hay que tocar dos procesos.
const URL_SITIO = process.env.APP_INTERNAL_URL || "http://127.0.0.1:9314";

/**
 * Resuelve la identidad de quien abre un socket. Devuelve null si no hay
 * sesión válida, y el multijugador lo rechaza: jugar con otros pide cuenta.
 */
/**
 * Quién es el que abre el socket, según el sitio.
 *
 * Devuelve la identidad, `null` si no hay sesión válida, o `"sin-login"` si el
 * sitio contesta que el login no está configurado. Esa tercera respuesta
 * importa: sin credenciales de Google, `autenticado` es false para todo el
 * mundo, y tratar eso como "no tiene sesión" dejaría el multijugador cerrado
 * para todos — en un clon del repo sin secretos, y en producción si alguna vez
 * falta el archivo. Cuando no hay login que exigir, no se exige.
 */
async function identidadDeSocket(socket) {
  const token = socket.handshake?.auth?.sesion;
  try {
    const res = await fetch(`${URL_SITIO}/api/auth/me`, {
      headers: token ? { "x-pela-sesion": token } : {},
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const datos = await res.json();
    if (datos?.autenticado) return datos;
    if (datos?.loginDisponible === false) return "sin-login";
    return null;
  } catch (e) {
    return null;
  }
}

const leaderboardStore = new LeaderboardStore();
leaderboardStore.init().catch((err) => {
  console.error("[pela-multiplayer] Error iniciando LeaderboardStore:", err);
});

/**
 * Store de "¿Cuántas palas?", con archivo propio.
 *
 * No comparte el de Pelardle porque `daily` se indexa por número de día y
 * colisionaría, y `history` es por jugador y no por juego, así que las rachas de
 * uno sobrescribirían las del otro. Las cuentas y los apodos SÍ se comparten:
 * son de la persona, no del juego, y viven en un solo lugar.
 */
const palasStore = new LeaderboardStore({
  archivo: "palas.json",
  identidades: leaderboardStore,
});
palasStore.init().catch((err) => {
  console.error("[pela-multiplayer] Error iniciando el store de palas:", err);
});

/**
 * Los dos juegos de Orga, cada uno con su archivo y compartiendo identidades por
 * el mismo motivo que palas: el ranking es del juego, la cuenta es de la persona.
 */
const bitgolfStore = new LeaderboardStore({ archivo: "bitgolf.json", identidades: leaderboardStore });
const pilaStore = new LeaderboardStore({ archivo: "pila.json", identidades: leaderboardStore });
for (const [nombre, store] of [["bitgolf", bitgolfStore], ["pila", pilaStore]]) {
  store.init().catch((err) => {
    console.error(`[pela-multiplayer] Error iniciando el store de ${nombre}:`, err);
  });
}

// Guardar a disco de inmediato al recibir señales de apagado
const gracefulShutdown = async () => {
  console.log("[pela-multiplayer] Guardando leaderboard antes de apagar...");
  await leaderboardStore.flushToDisk().catch(() => {});
  await palasStore.flushToDisk().catch(() => {});
  await bitgolfStore.flushToDisk().catch(() => {});
  await pilaStore.flushToDisk().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

const httpServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Endpoints REST de Leaderboard de Pelardle
  if (url.pathname === "/pelardle/board" && req.method === "GET") {
    const puzzle = url.searchParams.get("puzzle") || "";
    const board = leaderboardStore.getBoard(puzzle);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...board }));
    return;
  }

  /**
   * Los puzzles del día. Los tres tienen exactamente la misma forma —validar el
   * día y devolver lo generado— así que van por tabla: repetir el bloque tres
   * veces es tres lugares donde arreglar el mismo bug.
   *
   * Cada uno devuelve SÓLO lo que el jugador puede ver antes de contestar. En
   * palas eso excluye el total; en la pila, el estado final. En bit golf no
   * excluye nada, y está documentado en el módulo: ahí no hay nada secreto.
   */
  const puzzlesDelDia = {
    "/palas/escena": (dia) => ({ escena: escenaPublica(dia) }),
    "/bitgolf/hoyo": (dia) => ({ hoyo: puzzleDelDia(dia) }),
    "/pila/secuencia": (dia) => ({ secuencia: secuenciaPublica(dia) }),
  };
  const generador = puzzlesDelDia[url.pathname];
  if (generador && req.method === "GET") {
    const dia = Number(url.searchParams.get("dia"));
    if (!Number.isFinite(dia) || dia < 1) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Falta el día." }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...generador(dia) }));
    return;
  }

  // Y sus rankings, por la misma razón.
  const boardsDiarios = {
    "/palas/board": palasStore,
    "/bitgolf/board": bitgolfStore,
    "/pila/board": pilaStore,
  };
  const storeDelBoard = boardsDiarios[url.pathname];
  if (storeDelBoard && req.method === "GET") {
    const board = storeDelBoard.getBoard(url.searchParams.get("dia") || "");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...board }));
    return;
  }

  // Perfil público por apodo
  if (url.pathname === "/cuentas/perfil" && req.method === "GET") {
    const perfil = leaderboardStore.perfilPublico(url.searchParams.get("apodo") || "");
    res.writeHead(perfil ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(perfil ? { ok: true, perfil } : { ok: false, error: "No existe ese apodo." }));
    return;
  }

  // Consulta de récords unificados de la cuenta
  if (url.pathname === "/cuentas/records" && req.method === "GET") {
    const playerId = url.searchParams.get("playerId") || "";
    const records = leaderboardStore.getRecords(playerId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, records }));
    return;
  }

  // Endpoints que reciben un JSON y devuelven lo que responda el store. Todos
  // siguen el mismo molde, así que se resuelven con una tabla en vez de repetir
  // el manejo del cuerpo cinco veces.
  const postHandlers = {
    "/pelardle/attempt": (body) => leaderboardStore.registerAttempt(body),
    "/cuentas/vincular": (body) => leaderboardStore.vincularCuenta(body),
    "/cuentas/importar": (body) => leaderboardStore.importarProgresoLocal(body),
    "/cuentas/apodo": (body) => leaderboardStore.reservarApodo(body),
    "/cuentas/records": (body) => leaderboardStore.updateRecords(body.playerId, body.records),
    "/palas/intento": (body) => registrarPalas(palasStore, body),
    "/bitgolf/intento": (body) => registrarBitGolf(bitgolfStore, body),
    "/pila/intento": (body) => registrarPila(pilaStore, body),
  };

  const handler = postHandlers[url.pathname];
  if (handler && req.method === "POST") {
    let bodyStr = "";
    req.on("data", (chunk) => {
      bodyStr += chunk;
      // Seguridad: limitar a 64KB
      if (bodyStr.length > 65536) req.destroy();
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(bodyStr || "{}");
        const result = handler(body);
        res.writeHead(result?.error ? 400 : 200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "JSON inválido" }));
      }
    });
    return;
  }

  if (url.pathname === "/pelardle/name" && req.method === "POST") {
    let bodyStr = "";
    req.on("data", (chunk) => {
      bodyStr += chunk;
      if (bodyStr.length > 65536) req.destroy();
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(bodyStr || "{}");
        const result = leaderboardStore.updatePlayerName(body.playerId, body.playerName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "JSON inválido" }));
      }
    });
    return;
  }

  // Traefik hace un healthcheck HTTP plano antes de rutear WebSockets; sin
  // esta respuesta, cualquier GET normal a / se cuelga sin contestar.
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("pela-multiplayer ok");
});

const io = new Server(httpServer, {
  // No hay datos sensibles en juego (ni cookies, ni auth) así que un CORS
  // abierto es suficiente y evita tener que mantener una allowlist de origins
  // entre dev (localhost:9314) y producción (pela.signai.ar).
  cors: { origin: "*" },
});

/**
 * Política de los bots de escapecv. Si el archivo de pesos no está, queda en
 * null y las salas simplemente no ofrecen bots: el multijugador funciona igual.
 */
const politicaEscape = cargarPoliticaEscape();

const manager = new RoomManager(politicaEscape);

function broadcastRoom(room) {
  if (room.playerCount === 0) return;
  const snapshot = room.snapshot();
  io.to(room.code).emit("roomUpdate", snapshot);
}

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = manager.get(code);
  if (room) {
    room.removePlayer(socket.id);
    socket.leave(code);
    // Por humanos y no por `playerCount`: con bots, el total nunca llega a cero
    // y la sala abandonada seguiría tickeando para siempre.
    if (room.humanCount === 0) {
      room.configurarBots(0, room.dificultad); // sacar los bots antes de limpiar
      manager.cleanupIfEmpty(room);
    } else {
      broadcastRoom(room);
    }
  }
  socket.data.roomCode = null;
}

function joinRoom(socket, room, name) {
  if (room.playerCount >= MAX_PLAYERS) {
    return { error: "La sala está llena." };
  }
  if (room.state === "playing" || room.state === "countdown") {
    return { error: "La partida ya arrancó. Esperá a que termine para entrar." };
  }
  leaveCurrentRoom(socket);
  room.addPlayer(socket.id, name);
  socket.join(room.code);
  socket.data.roomCode = room.code;
  broadcastRoom(room);
  return { snapshot: room.snapshot(), isHost: room.hostId === socket.id };
}

// Jugar con otros pide cuenta. Se valida en el handshake, antes de que el
// socket entre a ninguna sala: así no hay forma de colarse en una partida y
// después quedar sin identidad. Los modos de un jugador de /escapecv no pasan
// por acá y siguen abiertos.
io.use(async (socket, next) => {
  const identidad = await identidadDeSocket(socket);
  if (!identidad) return next(new Error("LOGIN_REQUERIDO"));
  if (identidad !== "sin-login") {
    socket.data.playerId = identidad.playerId;
    socket.data.nombreCuenta = identidad.nombre;
  }
  next();
});

io.on("connection", (socket) => {
  socket.data.roomCode = null;

  socket.on("join", ({ name, target } = {}, ack) => {
    const room =
      target === "PUBLIC-COOP" || target === "PUBLIC-BATTLE"
        ? manager.getPublicRoom(target === "PUBLIC-BATTLE" ? "battle" : "coop")
        : manager.get(String(target || "").toUpperCase());

    if (!room) {
      ack?.({ error: "No existe ninguna sala con ese código." });
      return;
    }
    ack?.(joinRoom(socket, room, name));
  });

  socket.on("createRoom", ({ name, mode } = {}, ack) => {
    const room = manager.createPrivateRoom(mode === "battle" ? "battle" : "coop");
    ack?.(joinRoom(socket, room, name));
  });

  socket.on("configurarBots", ({ cantidad, dificultad } = {}, ack) => {
    const room = manager.get(socket.data.roomCode);
    if (!room) return ack?.({ error: "No estás en ninguna sala." });
    // Sólo salas privadas: en una pública nadie es dueño de la decisión, y los
    // bots dispararían el arranque automático por cantidad de jugadores.
    if (room.isPublic) return ack?.({ error: "Las salas públicas no llevan bots." });
    if (room.hostId !== socket.id) return ack?.({ error: "Sólo quien creó la sala puede poner bots." });
    if (room.state === "playing" || room.state === "countdown") {
      return ack?.({ error: "No se pueden cambiar los bots con la partida en curso." });
    }
    if (!politicaEscape) return ack?.({ error: "Los bots no están disponibles en este servidor." });

    room.configurarBots(cantidad, dificultad);
    broadcastRoom(room);
    ack?.({ ok: true, bots: room.bots, dificultad: room.dificultad });
  });

  socket.on("startGame", (_payload, ack) => {
    const room = manager.get(socket.data.roomCode);
    if (!room) return ack?.({ error: "No estás en ninguna sala." });
    if (room.isPublic) return ack?.({ error: "Las salas públicas arrancan solas cuando hay suficientes jugadores." });
    if (room.hostId !== socket.id) return ack?.({ error: "Sólo quien creó la sala puede arrancar la partida." });
    if (!room.canStart()) return ack?.({ error: "La sala ya está jugando." });
    room.startCountdown();
    broadcastRoom(room);
    ack?.({ ok: true });
  });

  socket.on("input", ({ dx, dy } = {}) => {
    const room = manager.get(socket.data.roomCode);
    if (!room) return;
    room.setInput(socket.id, Number(dx) || 0, Number(dy) || 0);
  });

  socket.on("leave", () => leaveCurrentRoom(socket));
  socket.on("disconnect", () => leaveCurrentRoom(socket));
});

// Loop único para todas las salas, en vez de un setInterval por sala: evita
// drift entre salas y escala mejor para el puñado de salas concurrentes que
// este proyecto va a tener en la práctica.
setInterval(() => {
  const now = Date.now();

  for (const room of manager.rooms.values()) {
    if (room.humanCount === 0 && !room.isPublic) continue;

    if (room.isPublic && room.state === "lobby" && room.playerCount >= PUBLIC_LOBBY_MIN_PLAYERS) {
      room.startCountdown();
      broadcastRoom(room);
    } else if (room.state === "countdown") {
      if (room.isPublic && room.playerCount < PUBLIC_LOBBY_MIN_PLAYERS) {
        room.cancelCountdown();
        broadcastRoom(room);
      } else if (now >= room.countdownEndsAt) {
        room.beginPlaying();
        broadcastRoom(room);
      } else {
        // Transmitir continuamente durante la cuenta regresiva para refrescar el reloj
        broadcastRoom(room);
      }
    } else if (room.state === "playing") {
      const ended = room.tick(TICK_MS);
      if (ended) {
        io.to(room.code).emit("gameEnded", { results: room.results() });
      }
      broadcastRoom(room);
    } else if (room.state === "ended" && room.isPublic && now - room.endedAt > RESULTS_DISPLAY_MS) {
      room.state = "lobby";
      room.enemies = [];
      room.warnings = [];
      broadcastRoom(room);
    }
  }
}, TICK_MS);

// ==========================================
// Agarrá.io Namespace (/agarra)
// ==========================================
const agarraIo = io.of("/agarra");
// Los bots de la arena pública juegan con la política entrenada si sus pesos
// están presentes; si no, con la heurística de siempre. Medido en la misma
// arena contra bots heurísticos, la red junta 69 de masa contra 46 y muere
// cinco veces menos.
// Los ocho bots con red juegan todos la misma política, la ganadora del duelo
// cara a cara: contra la que venía desplegada saca 24% más de masa, 39% más de
// kills y muere la mitad.
//
// `cargarPoliticas` acepta varias entradas justamente para volver a poner dos
// en la misma arena cuando haya otra candidata que medir. Comparar por métricas
// históricas no sirve —la vara cambia— y la única comparación válida es la
// misma arena, con las mismas palas y los mismos rivales.
const politicasBots = cargarPoliticas([{ etiqueta: "🧠", archivo: "pesos-bots" }]);
const agarraArena = new Arena({ politicas: politicasBots });

agarraIo.use(async (socket, next) => {
  const identidad = await identidadDeSocket(socket);
  if (!identidad) return next(new Error("LOGIN_REQUERIDO"));
  if (identidad !== "sin-login") {
    socket.data.playerId = identidad.playerId;
    socket.data.nombreCuenta = identidad.nombre;
  }
  next();
});

agarraIo.on("connection", (socket) => {
  socket.on("join", ({ name } = {}, ack) => {
    const player = agarraArena.addPlayer(socket.id, name, socket.data.playerId);
    ack?.({
      ok: true,
      playerId: socket.id,
      player,
      world: { width: AGARRA_WORLD_W, height: AGARRA_WORLD_H },
      palas: agarraArena.allPalas(),
    });
  });

  socket.on("respawn", (_payload, ack) => {
    const player = agarraArena.respawnPlayer(socket.id);
    ack?.({ ok: true, player });
  });

  socket.on("input", ({ dx, dy } = {}) => {
    agarraArena.setInput(socket.id, dx, dy);
  });

  socket.on("split", () => {
    agarraArena.splitPlayer(socket.id);
  });

  socket.on("disconnect", () => {
    agarraArena.removePlayer(socket.id);
  });
});

let agarraTickCount = 0;
let agarraVacioDesde = 0;
const AGARRA_TICK_MS = 1000 / 30; // 30 Hz simulación
setInterval(() => {
  /**
   * La arena no simula si no hay nadie mirando.
   *
   * Medido en el VPS: los ocho bots con red cuestan 9,34 ms por tick, el 28% del
   * presupuesto de 33,3 ms, y este intervalo corría sin ningún guard — o sea que
   * el proceso quemaba más de un cuarto de core las veinticuatro horas para una
   * arena vacía. Con los bots de escapecv sumando hasta 12 ms más por sala, eso
   * dejaba el loop a un paso de no llegar, y cuando un loop de ticks no llega el
   * juego se pone lento para TODOS: /agarra, /escapecv y el leaderboard viven en
   * el mismo proceso mono-hilo.
   *
   * Se sigue emitiendo el snapshot final una vez al vaciarse, para que el último
   * que se va no quede con la pantalla congelada a mitad de un movimiento.
   */
  const hayPublico = agarraIo.sockets.size > 0;
  if (!hayPublico) {
    if (agarraVacioDesde === 0) {
      agarraVacioDesde = 1;
      agarraIo.emit("tick", agarraArena.deltaSnapshot());
    }
    return;
  }
  agarraVacioDesde = 0;

  agarraArena.tick(AGARRA_TICK_MS);
  agarraTickCount++;

  // La mejor masa la escribe el servidor, no el navegador: la arena es suya y
  // ya la tiene medida. El cliente sigue guardando su copia local para poder
  // mostrarla sin estar logueado, pero lo que queda en la cuenta sale de acá.
  for (const { playerId, maxMass } of agarraArena.drenarRecords()) {
    leaderboardStore.updateRecords(playerId, { agarra: { maxMass } }, { deConfianza: true });
  }

  // Difusión a 15 Hz (cada 2 ticks) para optimizar ancho de banda
  if (agarraTickCount % 2 === 0) {
    const delta = agarraArena.deltaSnapshot();
    agarraIo.emit("tick", delta);
  }
}, AGARRA_TICK_MS);

// Sólo localhost: en producción quien entra es Traefik, que corre en el mismo
// host. El endpoint /pelardle/attempt confía en el campo `solved` que le manda
// quien lo llama, así que exponerlo a la red permitiría entrar primero al
// ranking con un curl sin adivinar nada. Hoy lo tapa el firewall, pero esto
// no depende de que esa regla siga estando.
httpServer.listen(PORT, MP_HOST, () => {
  console.log(`[pela-multiplayer] escuchando en ${MP_HOST}:${PORT}`);
});
