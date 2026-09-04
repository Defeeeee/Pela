"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import { useSocialCredit } from "../SocialCreditContext";

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;
const NAME_KEY = "pela_player_name";
const ENTRY_COST = 20;

function multiplayerUrl() {
  if (typeof window === "undefined") return undefined;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:9315"
    : undefined;
}

export default function AgarraGame() {
  const [view, setView] = useState("start"); // 'start' | 'playing'
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myPlayerInfo, setMyPlayerInfo] = useState({ mass: 20, kills: 0, alive: true });

  const { deductCredit } = useSocialCredit();
  const deductRef = useRef(deductCredit);
  useEffect(() => {
    deductRef.current = deductCredit;
  }, [deductCredit]);

  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const myIdRef = useRef(null);
  const palasMapRef = useRef(new Map()); // id -> { id, x, y }
  const snapshotsRef = useRef([]); // [{ t, players, leaderboard }]
  const cameraRef = useRef({ x: 2000, y: 2000, zoom: 1 });
  const mousePosRef = useRef({ x: 0, y: 0 }); // offset from center
  const chargedRef = useRef(false);

  // Cargar imágenes
  const peladoImgRef = useRef(null);
  const shovelImgRef = useRef(null);

  useEffect(() => {
    const savedName = localStorage.getItem(NAME_KEY) || "";
    setName(savedName);

    const imgPelado = new Image();
    imgPelado.src = "/imgs/goat/Pelado%20Feliz.jpeg";
    imgPelado.onload = () => {
      peladoImgRef.current = imgPelado;
    };

    const imgShovel = new Image();
    imgShovel.src = "/imgs/labura/shovel.jpeg";
    imgShovel.onload = () => {
      shovelImgRef.current = imgShovel;
    };
  }, []);

  const connectAndJoin = useCallback(() => {
    if (socketRef.current) return socketRef.current;

    const base = multiplayerUrl();
    const url = base ? `${base}/agarra` : "/agarra";
    const s = io(url, { transports: ["websocket"] });

    s.on("connect", () => {
      setError("");
      const cleanName = name.trim() || "Pelado Anónimo";
      localStorage.setItem(NAME_KEY, cleanName);

      s.emit("join", { name: cleanName }, (res) => {
        setConnecting(false);
        if (!res || !res.ok) {
          setError(res?.error || "Error al entrar a la arena.");
          return;
        }

        myIdRef.current = res.playerId;

        // Inicializar mapa de palas
        const pMap = new Map();
        if (Array.isArray(res.palas)) {
          for (const [id, px, py] of res.palas) {
            pMap.set(id, { id, x: px, y: py });
          }
        }
        palasMapRef.current = pMap;
        setView("playing");
      });
    });

    s.on("tick", (delta) => {
      // 1. Actualizar palas por deltas
      if (delta.eaten && Array.isArray(delta.eaten)) {
        for (const id of delta.eaten) {
          palasMapRef.current.delete(id);
        }
      }
      if (delta.newPalas && Array.isArray(delta.newPalas)) {
        for (const [id, px, py] of delta.newPalas) {
          palasMapRef.current.set(id, { id, x: px, y: py });
        }
      }

      // 2. Guardar snapshot para interpolación
      const snap = {
        t: delta.t || Date.now(),
        players: delta.players || [],
        leaderboard: delta.leaderboard || [],
      };

      snapshotsRef.current.push(snap);
      if (snapshotsRef.current.length > 5) {
        snapshotsRef.current.shift();
      }

      setLeaderboard(snap.leaderboard);

      // Actualizar estado del jugador local
      const me = snap.players.find((p) => p.id === myIdRef.current);
      if (me) {
        setMyPlayerInfo({
          mass: me.mass,
          kills: me.kills || 0,
          alive: me.alive,
        });
      }
    });

    s.on("connect_error", () => {
      setConnecting(false);
      setError("No se pudo conectar al servidor de Agarrá.io. Probá de nuevo.");
    });

    socketRef.current = s;
    return s;
  }, [name]);

  const handleStartGame = () => {
    if (connecting) return;
    setError("");

    // Cobrar Reserva de Pala una sola vez al entrar
    if (!chargedRef.current) {
      chargedRef.current = true;
      deductRef.current(ENTRY_COST, "AGARRA_ENTRY");
    }

    setConnecting(true);
    connectAndJoin();
  };

  const handleRespawn = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("respawn", {}, (res) => {
      if (res?.ok) {
        setMyPlayerInfo((prev) => ({ ...prev, alive: true, mass: 20 }));
      }
    });
  };

  // Enviar inputs al servidor continuamente
  useEffect(() => {
    if (view !== "playing") return;

    const interval = setInterval(() => {
      if (!socketRef.current || !socketRef.current.connected) return;
      const { x, y } = mousePosRef.current;
      socketRef.current.emit("input", { dx: x, dy: y });
    }, 45);

    return () => clearInterval(interval);
  }, [view]);

  // Espacio hace las dos cosas según el estado: si estás muerto, respawnea;
  // si estás vivo, te dividís (que es la tecla del Agar original).
  useEffect(() => {
    if (view !== "playing") return;

    const handleKeyDown = (e) => {
      if (e.code !== "Space") return;
      e.preventDefault();

      if (!myPlayerInfo.alive) {
        handleRespawn();
      } else {
        socketRef.current?.emit("split");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, myPlayerInfo.alive]);

  // Cleanup al salir
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Loop de renderizado en Canvas con interpolación y cámara
  useEffect(() => {
    if (view !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const handleMouseMove = (e) => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const len = Math.hypot(dx, dy) || 1;
      const norm = Math.min(1, len / 200); // 200px de distancia = 100% velocidad
      mousePosRef.current = {
        x: (dx / len) * norm,
        y: (dy / len) * norm,
      };
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const dx = touch.clientX - centerX;
      const dy = touch.clientY - centerY;
      const len = Math.hypot(dx, dy) || 1;
      const norm = Math.min(1, len / 150);
      mousePosRef.current = {
        x: (dx / len) * norm,
        y: (dy / len) * norm,
      };
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    const render = () => {
      animId = requestAnimationFrame(render);

      const snaps = snapshotsRef.current;
      if (snaps.length === 0) return;

      // Interpolación entre los dos últimos snapshots
      const s1 = snaps[snaps.length - 1];
      const s0 = snaps.length > 1 ? snaps[snaps.length - 2] : s1;
      const dt = Math.max(1, s1.t - s0.t);
      const renderTime = Date.now() - 60; // 60ms detrás para suavidad
      const alpha = Math.max(0, Math.min(1, (renderTime - s0.t) / dt));

      // Mapear jugadores interpolados
      const playersMap = new Map();
      for (const p1 of s1.players) {
        const p0 = s0.players.find((p) => p.id === p1.id) || p1;

        // Las células se interpolan por índice. Si entre los dos snapshots
        // cambió la cantidad (se dividió o se fusionó), se toma la nueva tal
        // cual: interpolar contra otra célula daría un salto peor que el corte.
        const c0 = p0.cells || [];
        const cells = (p1.cells || []).map((c, i) => {
          const prev = c0.length === (p1.cells || []).length ? c0[i] : c;
          return {
            x: prev.x + (c.x - prev.x) * alpha,
            y: prev.y + (c.y - prev.y) * alpha,
            r: prev.r + (c.r - prev.r) * alpha,
          };
        });

        playersMap.set(p1.id, {
          ...p1,
          x: p0.x + (p1.x - p0.x) * alpha,
          y: p0.y + (p1.y - p0.y) * alpha,
          radius: p0.radius + (p1.radius - p0.radius) * alpha,
          cells,
        });
      }

      // Cámara siguiendo al jugador local
      const me = playersMap.get(myIdRef.current);
      if (me && me.alive) {
        cameraRef.current.x += (me.x - cameraRef.current.x) * 0.1;
        cameraRef.current.y += (me.y - cameraRef.current.y) * 0.1;
        const targetZoom = Math.max(0.35, Math.min(1.2, 1.1 * Math.pow(20 / Math.max(20, me.mass), 0.25)));
        cameraRef.current.zoom += (targetZoom - cameraRef.current.zoom) * 0.08;
      }

      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;
      const zoom = cameraRef.current.zoom;

      const w = canvas.width;
      const h = canvas.height;

      // Limpiar fondo
      ctx.fillStyle = "#0c1017";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // 1. Límites visibles del mundo
      const viewLeft = camX - (w / 2) / zoom;
      const viewRight = camX + (w / 2) / zoom;
      const viewTop = camY - (h / 2) / zoom;
      const viewBottom = camY + (h / 2) / zoom;

      // Grilla de fondo dentro de la vista
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      const gridSize = 100;
      const startX = Math.max(0, Math.floor(viewLeft / gridSize) * gridSize);
      const endX = Math.min(WORLD_WIDTH, Math.ceil(viewRight / gridSize) * gridSize);
      const startY = Math.max(0, Math.floor(viewTop / gridSize) * gridSize);
      const endY = Math.min(WORLD_HEIGHT, Math.ceil(viewBottom / gridSize) * gridSize);

      ctx.beginPath();
      for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, Math.max(0, viewTop));
        ctx.lineTo(x, Math.min(WORLD_HEIGHT, viewBottom));
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(Math.max(0, viewLeft), y);
        ctx.lineTo(Math.min(WORLD_WIDTH, viewRight), y);
      }
      ctx.stroke();

      // Bordes del mundo
      ctx.strokeStyle = "#ff5722";
      ctx.lineWidth = Math.max(4, 6 / zoom);
      ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      // 2. Dibujar Palas (con viewport culling)
      const shovelImg = shovelImgRef.current;
      for (const pala of palasMapRef.current.values()) {
        if (pala.x < viewLeft - 30 || pala.x > viewRight + 30 || pala.y < viewTop - 30 || pala.y > viewBottom + 30) {
          continue;
        }

        if (shovelImg) {
          ctx.drawImage(shovelImg, pala.x - 12, pala.y - 12, 24, 24);
        } else {
          // Icono alternativo si la imagen no terminó de cargar
          ctx.fillStyle = "#ffd54f";
          ctx.beginPath();
          ctx.arc(pala.x, pala.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Dibujar Jugadores (ordenados por masa para que los más grandes tapen a los más chicos)
      const sortedPlayers = [...playersMap.values()].sort((a, b) => a.mass - b.mass);
      const peladoImg = peladoImgRef.current;

      for (const p of sortedPlayers) {
        if (!p.alive) continue;

        // Un jugador puede estar partido en varias células si se dividió. La
        // más grande es la que lleva el nombre, para no repetirlo en cada pedazo.
        const celulas = p.cells && p.cells.length ? p.cells : [{ x: p.x, y: p.y, r: p.radius }];
        let mayor = celulas[0];
        for (const c of celulas) if (c.r > mayor.r) mayor = c;

        for (const c of celulas) {
          const r = c.r;
          if (c.x < viewLeft - r * 2 || c.x > viewRight + r * 2 || c.y < viewTop - r * 2 || c.y > viewBottom + r * 2) {
            continue;
          }

          ctx.save();
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);

          // Fondo del círculo con color
          ctx.fillStyle = p.color || "#4caf50";
          ctx.fill();

          // Borde exterior
          ctx.lineWidth = Math.max(2, r * 0.08);
          ctx.strokeStyle = p.id === myIdRef.current ? "#ffffff" : "rgba(0, 0, 0, 0.4)";
          ctx.stroke();

          // Si tenemos la imagen de Pelado Feliz, recortarla dentro del círculo
          if (peladoImg) {
            ctx.clip();
            ctx.drawImage(peladoImg, c.x - r, c.y - r, r * 2, r * 2);

            // Lustre brillante en la calva
            ctx.beginPath();
            ctx.arc(c.x - r * 0.3, c.y - r * 0.35, r * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
            ctx.fill();
          }

          ctx.restore();
        }

        // Nombre y masa, una sola vez, sobre la célula más grande
        const rl = mayor.r;
        ctx.save();
        ctx.font = `bold ${Math.max(12, Math.round(rl * 0.38))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const label = p.name;
        const sub = celulas.length > 1 ? `${p.mass} (${celulas.length})` : `${p.mass}`;

        // Sombra de texto para alta legibilidad
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 4;
        ctx.strokeText(label, mayor.x, mayor.y - rl * 0.1);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, mayor.x, mayor.y - rl * 0.1);

        ctx.font = `bold ${Math.max(10, Math.round(rl * 0.28))}px system-ui, sans-serif`;
        ctx.strokeText(sub, mayor.x, mayor.y + rl * 0.3);
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText(sub, mayor.x, mayor.y + rl * 0.3);

        ctx.restore();
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [view]);

  return (
    <div className="agarra-container">
      {view === "start" && (
        <div className="agarra-lobby-card">
          <div className="agarra-badge">MULTIJUGADOR EN TIEMPO REAL</div>
          <h1 className="agarra-title">AGARRÁ.IO</h1>
          <p className="agarra-desc">
            El juego donde los pelados comen palas, lustran su vértice capilar y se morfan a los
            más chicos para dominar la tabla general.
          </p>

          <div className="agarra-form">
            <label className="agarra-label" htmlFor="playerName">
              Tu Nombre de Pelado:
            </label>
            <input
              id="playerName"
              type="text"
              className="agarra-input"
              maxLength={16}
              placeholder="Ej: Pelado Sindical"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartGame()}
            />

            {error && <div className="agarra-error">{error}</div>}

            <button
              type="button"
              className="agarra-play-btn"
              disabled={connecting}
              onClick={handleStartGame}
            >
              {connecting ? "CONECTANDO..." : `JUGAR (Cuesta ${ENTRY_COST} de Reserva)`}
            </button>

            <p className="agarra-fee-hint">
              Respawn gratis ilimitado una vez adentro. Movés al pelado con el cursor del mouse
              y te dividís con la barra espaciadora para alcanzar al que se te escapa.
            </p>
          </div>

          <Link href="/menu" className="agarra-back-link">
            ← Volver al Menú Principal
          </Link>
        </div>
      )}

      {view === "playing" && (
        <>
          <canvas ref={canvasRef} className="agarra-canvas" />

          {/* HUD Superior Izquierdo: Branding & Salir */}
          <div className="agarra-hud-topleft">
            <div className="agarra-hud-logo">AGARRÁ.IO</div>
            <Link href="/menu" className="agarra-hud-exit">
              Salir
            </Link>
          </div>

          {/* HUD Superior Derecho: Leaderboard */}
          <div className="agarra-leaderboard">
            <div className="agarra-lb-title">🏆 TOP PELADOS</div>
            {leaderboard.map((item, idx) => {
              const isMe = item.id === myIdRef.current;
              return (
                <div key={item.id} className={`agarra-lb-row ${isMe ? "me" : ""}`}>
                  <span className="agarra-lb-rank">{idx + 1}.</span>
                  <span className="agarra-lb-name">{item.name}</span>
                  <span className="agarra-lb-mass">{item.mass}</span>
                </div>
              );
            })}
          </div>

          {/* HUD Inferior Izquierdo: Estadísticas del Jugador */}
          <div className="agarra-hud-stats">
            <div className="agarra-stat-item">
              <span className="stat-label">MASA:</span>
              <span className="stat-value">{myPlayerInfo.mass}</span>
            </div>
            <div className="agarra-stat-item">
              <span className="stat-label">PELADOS MORFADOS:</span>
              <span className="stat-value">{myPlayerInfo.kills}</span>
            </div>
          </div>

          {/* Pantalla de Muerte / Respawn */}
          {!myPlayerInfo.alive && (
            <div className="agarra-death-overlay">
              <div className="agarra-death-modal">
                <h2 className="agarra-death-title">¡TE MORFARON!</h2>
                <p className="agarra-death-desc">
                  Otro pelado con más masa te comió de un bocado. Respawnear no te descuenta Reserva.
                </p>
                <button
                  type="button"
                  className="agarra-respawn-btn"
                  onClick={handleRespawn}
                >
                  VOLVER A LA ARENA (Espacio o Click)
                </button>
                <Link href="/menu" className="agarra-death-exit">
                  Salir al Menú
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* <style> plano, sin el atributo jsx: con styled-jsx los selectores
          quedan scopeados con un hash y el <a> que genera <Link> no lo recibe,
          así que los links salían con el azul subrayado del navegador. El resto
          del proyecto usa este mismo patrón, con clases prefijadas por feature. */}
      <style>{`
        .agarra-container {
          position: fixed;
          inset: 0;
          background: #090c10;
          color: #ffffff;
          font-family: system-ui, -apple-system, sans-serif;
          overflow: hidden;
          user-select: none;
        }

        .agarra-canvas {
          position: absolute;
          inset: 0;
          width: 100vw;
          height: 100vh;
          cursor: crosshair;
        }

        .agarra-lobby-card {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(13, 17, 23, 0.95);
          border: 1px solid rgba(255, 235, 59, 0.3);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 235, 59, 0.1);
          border-radius: 16px;
          padding: 36px 32px;
          max-width: 460px;
          width: 90%;
          text-align: center;
          backdrop-filter: blur(12px);
          z-index: 10;
        }

        .agarra-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #ffeb3b;
          background: rgba(255, 235, 59, 0.12);
          border: 1px solid rgba(255, 235, 59, 0.25);
          padding: 4px 12px;
          border-radius: 999px;
          margin-bottom: 12px;
        }

        .agarra-title {
          font-size: 42px;
          font-weight: 900;
          letter-spacing: 2px;
          color: #ffffff;
          margin: 0 0 10px;
          text-shadow: 0 0 20px rgba(255, 235, 59, 0.4);
        }

        .agarra-desc {
          color: #8b949e;
          font-size: 14px;
          line-height: 1.5;
          margin: 0 0 24px;
        }

        .agarra-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: left;
        }

        .agarra-label {
          font-size: 13px;
          font-weight: 600;
          color: #c9d1d9;
        }

        .agarra-input {
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 12px 14px;
          color: #ffffff;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
        }

        .agarra-input:focus {
          border-color: #ffeb3b;
        }

        .agarra-error {
          color: #ff5252;
          font-size: 13px;
          text-align: center;
        }

        .agarra-play-btn {
          background: linear-gradient(180deg, #ffeb3b 0%, #fbc02d 100%);
          color: #000000;
          border: none;
          border-radius: 8px;
          padding: 14px;
          font-size: 16px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.1s, filter 0.2s;
          box-shadow: 0 4px 15px rgba(251, 192, 45, 0.4);
          margin-top: 6px;
        }

        .agarra-play-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.08);
        }

        .agarra-play-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .agarra-fee-hint {
          font-size: 11px;
          color: #6e7681;
          text-align: center;
          margin: 4px 0 0;
        }

        .agarra-back-link {
          display: inline-block;
          margin-top: 20px;
          font-size: 13px;
          color: #8b949e;
          text-decoration: none;
          transition: color 0.2s;
        }

        .agarra-back-link:hover {
          color: #ffffff;
        }

        /* HUD */
        .agarra-hud-topleft {
          position: absolute;
          top: 16px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 5;
        }

        .agarra-hud-logo {
          font-size: 18px;
          font-weight: 900;
          color: #ffeb3b;
          letter-spacing: 1px;
          text-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
        }

        .agarra-hud-exit {
          background: rgba(22, 27, 34, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #c9d1d9;
          text-decoration: none;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          transition: background 0.2s, color 0.2s;
        }

        .agarra-hud-exit:hover {
          background: #ff5252;
          color: #ffffff;
          border-color: #ff5252;
        }

        .agarra-leaderboard {
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(13, 17, 23, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 12px 16px;
          min-width: 190px;
          backdrop-filter: blur(8px);
          z-index: 5;
        }

        .agarra-lb-title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #ffeb3b;
          margin-bottom: 8px;
          text-align: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 4px;
        }

        .agarra-lb-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #c9d1d9;
          margin: 3px 0;
          gap: 8px;
        }

        .agarra-lb-row.me {
          color: #ffeb3b;
          font-weight: 800;
        }

        .agarra-lb-name {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .agarra-lb-mass {
          font-weight: 700;
          color: #8b949e;
        }

        .agarra-lb-row.me .agarra-lb-mass {
          color: #ffeb3b;
        }

        .agarra-hud-stats {
          position: absolute;
          bottom: 16px;
          left: 16px;
          background: rgba(13, 17, 23, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 10px 16px;
          display: flex;
          gap: 16px;
          backdrop-filter: blur(8px);
          z-index: 5;
        }

        .agarra-stat-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .stat-label {
          color: #8b949e;
          font-weight: 600;
        }

        .stat-value {
          color: #ffeb3b;
          font-weight: 800;
          font-size: 15px;
        }

        /* Death Overlay */
        .agarra-death-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(6px);
          z-index: 20;
        }

        .agarra-death-modal {
          background: #0d1117;
          border: 1px solid #ff5252;
          box-shadow: 0 10px 40px rgba(255, 82, 82, 0.3);
          border-radius: 14px;
          padding: 32px 28px;
          text-align: center;
          max-width: 380px;
          width: 85%;
        }

        .agarra-death-title {
          font-size: 32px;
          font-weight: 900;
          color: #ff5252;
          margin: 0 0 8px;
        }

        .agarra-death-desc {
          color: #8b949e;
          font-size: 14px;
          margin: 0 0 20px;
          line-height: 1.4;
        }

        .agarra-respawn-btn {
          width: 100%;
          background: #4caf50;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 14px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
        }

        .agarra-respawn-btn:hover {
          background: #43a047;
          transform: translateY(-1px);
        }

        .agarra-death-exit {
          display: inline-block;
          margin-top: 14px;
          font-size: 13px;
          color: #8b949e;
          text-decoration: none;
        }

        .agarra-death-exit:hover {
          color: #ffffff;
        }
      `}</style>
    </div>
  );
}
