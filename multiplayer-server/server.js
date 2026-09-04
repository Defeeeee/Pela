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

const PORT = process.env.MP_PORT || 9315;

const httpServer = createServer((req, res) => {
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

const manager = new RoomManager();

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
    if (room.playerCount === 0) {
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

  socket.on("startGame", (_payload, ack) => {
    const room = manager.get(socket.data.roomCode);
    if (!room) return ack?.({ error: "No estás en ninguna sala." });
    if (room.isPublic) return ack?.({ error: "Las salas públicas arrancan solas cuando hay suficientes jugadores." });
    if (room.hostId !== socket.id) return ack?.({ error: "Sólo quien creó la sala puede arrancar la partida." });
    if (!room.canStart()) return ack?.({ error: "La sala ya está jugando." });
    room.beginPlaying();
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
    if (room.playerCount === 0 && !room.isPublic) continue;

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
const agarraArena = new Arena();

agarraIo.on("connection", (socket) => {
  socket.on("join", ({ name } = {}, ack) => {
    const player = agarraArena.addPlayer(socket.id, name);
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

  socket.on("disconnect", () => {
    agarraArena.removePlayer(socket.id);
  });
});

let agarraTickCount = 0;
const AGARRA_TICK_MS = 1000 / 30; // 30 Hz simulación
setInterval(() => {
  agarraArena.tick(AGARRA_TICK_MS);
  agarraTickCount++;

  // Difusión a 15 Hz (cada 2 ticks) para optimizar ancho de banda
  if (agarraTickCount % 2 === 0) {
    const delta = agarraArena.deltaSnapshot();
    agarraIo.emit("tick", delta);
  }
}, AGARRA_TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`[pela-multiplayer] escuchando en :${PORT}`);
});
