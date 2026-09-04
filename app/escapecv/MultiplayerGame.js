"use client"
import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useSocialCredit } from '../SocialCreditContext';

// Tienen que coincidir con multiplayer-server/rooms.js: no hay build step
// compartido entre ese proceso standalone y esta app, así que el mundo del
// juego vive duplicado en los dos lados a propósito.
const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 900;
const CORRAL_W = WORLD_WIDTH * 0.707;
const CORRAL_H = WORLD_HEIGHT * 0.707;
const CORRAL_X = (WORLD_WIDTH - CORRAL_W) / 2;
const CORRAL_Y = (WORLD_HEIGHT - CORRAL_H) / 2;

const NAME_KEY = 'pela_player_name';
const INPUT_INTERVAL_MS = 50;

function multiplayerUrl() {
  if (typeof window === 'undefined') return undefined;
  // En dev el juego (9314) y el server de sockets (9315) son procesos
  // distintos. En producción Traefik rutea /socket.io del mismo dominio
  // hacia el server de sockets, así que basta con el origin actual.
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:9315'
    : undefined;
}

function fmtTime(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

export default function MultiplayerGame({ onExit }) {
  const [view, setView] = useState('menu'); // 'menu' | 'room'
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null); // último roomUpdate
  const [results, setResults] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const socketRef = useRef(null);
  const keysRef = useRef({});
  const canvasRef = useRef(null);
  const chargedRef = useRef(false); // evita cobrar dos veces la misma partida
  const { deductCredit } = useSocialCredit();
  const deductRef = useRef(deductCredit);
  useEffect(() => { deductRef.current = deductCredit; }, [deductCredit]);

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) || '');
  }, []);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const s = io(multiplayerUrl(), { transports: ['websocket'] });
    s.on('roomUpdate', (snap) => setRoom(snap));
    s.on('gameEnded', (payload) => setResults(payload.results));
    s.on('connect_error', () => setError('No se pudo conectar al servidor multijugador. Probá de nuevo en un rato.'));
    socketRef.current = s;
    return s;
  }, []);

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  // Cobra el peaje una vez por ronda. roundId lo incrementa el servidor en
  // cada beginPlaying(), así que una sala privada rejugada con el mismo
  // código vuelve a cobrar en cada partida nueva (el eventId de deductCredit
  // sólo bloquea duplicados, no cobros legítimos de rondas distintas).
  useEffect(() => {
    if (room?.state === 'playing' && chargedRef.current !== room.roundId) {
      chargedRef.current = room.roundId;
      deductRef.current(20, `jugar-/escapecv-multi-${room.code}-${room.roundId}`);
    }
  }, [room?.state, room?.code, room?.roundId]);

  const persistName = (value) => {
    setName(value);
    localStorage.setItem(NAME_KEY, value);
  };

  const joinPublic = (mode) => {
    setError('');
    setConnecting(true);
    const s = ensureSocket();
    s.emit('join', { name, target: mode === 'battle' ? 'PUBLIC-BATTLE' : 'PUBLIC-COOP' }, (res) => {
      setConnecting(false);
      if (res.error) return setError(res.error);
      setRoom(res.snapshot);
      setView('room');
    });
  };

  const createRoom = (mode) => {
    setError('');
    setConnecting(true);
    const s = ensureSocket();
    s.emit('createRoom', { name, mode }, (res) => {
      setConnecting(false);
      if (res.error) return setError(res.error);
      setRoom(res.snapshot);
      setView('room');
    });
  };

  const joinWithCode = () => {
    if (joinCode.trim().length < 4) return setError('El código tiene 4 caracteres.');
    setError('');
    setConnecting(true);
    const s = ensureSocket();
    s.emit('join', { name, target: joinCode.trim() }, (res) => {
      setConnecting(false);
      if (res.error) return setError(res.error);
      setRoom(res.snapshot);
      setView('room');
    });
  };

  const startPrivateGame = () => {
    socketRef.current?.emit('startGame', {}, (res) => {
      if (res?.error) setError(res.error);
    });
  };

  const leaveRoom = () => {
    socketRef.current?.emit('leave');
    setRoom(null);
    setResults(null);
    setView('menu');
    setError('');
  };

  // Input: se lee el teclado a intervalos fijos y se manda al server, sólo
  // mientras la partida está en curso.
  useEffect(() => {
    if (room?.state !== 'playing') return;

    const handleKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      keysRef.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);

    const interval = setInterval(() => {
      const k = keysRef.current;
      let dx = 0, dy = 0;
      if (k['w'] || k['arrowup']) dy -= 1;
      if (k['s'] || k['arrowdown']) dy += 1;
      if (k['a'] || k['arrowleft']) dx -= 1;
      if (k['d'] || k['arrowright']) dx += 1;
      socketRef.current?.emit('input', { dx, dy });
    }, INPUT_INTERVAL_MS);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(interval);
    };
  }, [room?.state]);

  // Dibuja cada snapshot que llega del servidor. A ~30/s alcanza para que se
  // vea fluido sin necesitar un loop de rAF propio del lado del cliente.
  useEffect(() => {
    if (!room || room.state !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / WORLD_WIDTH;
    const scaleY = canvas.height / WORLD_HEIGHT;

    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#222';
    for (let x = 0; x < WORLD_WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x * scaleX, 0); ctx.lineTo(x * scaleX, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < WORLD_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y * scaleY); ctx.lineTo(canvas.width, y * scaleY); ctx.stroke();
    }

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 4;
    ctx.strokeRect(CORRAL_X * scaleX, CORRAL_Y * scaleY, CORRAL_W * scaleX, CORRAL_H * scaleY);

    const enemyImg = document.getElementById('mp-img-enemy');
    for (const e of room.enemies) {
      const size = e.size * scaleX;
      ctx.save();
      ctx.translate(e.x * scaleX, e.y * scaleY);
      ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI / 4 + Math.PI);
      if (enemyImg) ctx.drawImage(enemyImg, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    const now = Date.now();
    for (const w of room.warnings) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(now / 100) * 0.5;
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(w.x * scaleX, w.y * scaleY, (w.size || 16) * 0.35 * scaleX, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const playerImg = document.getElementById('mp-img-player');
    for (const p of room.players) {
      const size = p.size * scaleX;
      const x = p.x * scaleX, y = p.y * scaleY;
      ctx.save();
      if (!p.alive) ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.save();
      ctx.clip();
      if (playerImg) ctx.drawImage(playerImg, x - size / 2, y - size / 2, size, size);
      ctx.restore();
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.color;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = p.alive ? 1 : 0.5;
      ctx.fillStyle = p.color;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.alive ? p.name : `${p.name} 💀`, x, y - size / 2 - 8);
      ctx.restore();
    }
  }, [room]);

  const backToMenu = () => {
    leaveRoom();
    onExit?.();
  };

  // Derivado del snapshot en cada render, no guardado como state aparte: si
  // el host se desconecta a mitad de partida, el servidor le pasa el rol al
  // siguiente jugador del Map, y acá tiene que reflejarse sin que haga falta
  // ningún evento especial para "sos el nuevo host".
  const isHost = !!room && room.hostId === socketRef.current?.id;

  return (
    <div className="mp-container">
      <style>{`
        .mp-container { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }
        .mp-panel { background: rgba(20,20,20,0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 28px; max-width: 480px; width: 100%; text-align: center; }
        .mp-title { font-size: 1.6rem; font-weight: 900; margin: 0 0 16px; }
        .mp-input { width: 100%; box-sizing: border-box; padding: 10px 14px; border-radius: 8px; border: 1px solid #444; background: #1a1a1a; color: #fff; font-size: 1rem; margin-bottom: 12px; text-align: center; }
        .mp-row { display: flex; gap: 10px; margin-bottom: 12px; }
        .mp-btn { flex: 1; background: #ffeb3b; color: #000; border: none; padding: 12px; font-weight: 800; border-radius: 8px; cursor: pointer; font-size: 0.95rem; }
        .mp-btn.secondary { background: #333; color: #fff; }
        .mp-btn.battle { background: #ff5722; color: #fff; }
        .mp-btn:disabled { opacity: 0.5; cursor: default; }
        .mp-error { color: #ff5252; font-size: 0.85rem; margin: 8px 0; min-height: 1.2em; }
        .mp-section-title { font-size: 0.8rem; color: #999; text-transform: uppercase; letter-spacing: 0.05em; margin: 18px 0 8px; }
        .mp-code { font-size: 2rem; font-weight: 900; letter-spacing: 0.2em; color: #ffeb3b; margin: 10px 0; }
        .mp-players { list-style: none; padding: 0; margin: 12px 0; text-align: left; }
        .mp-players li { padding: 6px 10px; border-radius: 6px; background: rgba(255,255,255,0.04); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
        .mp-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .mp-countdown { font-size: 2.5rem; font-weight: 900; color: #ffeb3b; }
        .mp-canvas-wrap { width: 95vw; height: 82vh; position: relative; border-radius: 12px; overflow: hidden; }
        .mp-hud { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; justify-content: space-between; font-size: 0.85rem; color: #ccc; z-index: 2; }
        .mp-results-list { list-style: none; padding: 0; margin: 14px 0; text-align: left; }
        .mp-results-list li { display: flex; justify-content: space-between; padding: 8px 10px; border-radius: 6px; background: rgba(255,255,255,0.04); margin-bottom: 4px; }
        .mp-hidden { display: none; }
      `}</style>

      <img id="mp-img-player" src="/imgs/goat/Pelado Feliz.jpeg" className="mp-hidden" alt="" />
      <img id="mp-img-enemy" src="/imgs/labura/shovel.jpeg" className="mp-hidden" alt="" />

      {view === 'menu' && (
        <div className="mp-panel">
          <h2 className="mp-title">🎮 Multijugador</h2>
          <input
            className="mp-input"
            placeholder="Tu nombre de pelado"
            value={name}
            maxLength={16}
            onChange={(e) => persistName(e.target.value)}
          />
          <div className="mp-error">{error}</div>

          <div className="mp-section-title">Lobby público (-20 al arrancar)</div>
          <div className="mp-row">
            <button className="mp-btn" disabled={connecting || !name.trim()} onClick={() => joinPublic('coop')}>Coop</button>
            <button className="mp-btn battle" disabled={connecting || !name.trim()} onClick={() => joinPublic('battle')}>Battle Royale</button>
          </div>

          <div className="mp-section-title">Sala privada</div>
          <div className="mp-row">
            <button className="mp-btn secondary" disabled={connecting || !name.trim()} onClick={() => createRoom('coop')}>Crear (Coop)</button>
            <button className="mp-btn secondary" disabled={connecting || !name.trim()} onClick={() => createRoom('battle')}>Crear (Battle)</button>
          </div>
          <div className="mp-row">
            <input
              className="mp-input"
              style={{ marginBottom: 0 }}
              placeholder="CÓDIGO"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
            <button className="mp-btn secondary" disabled={connecting || !name.trim()} onClick={joinWithCode}>Unirme</button>
          </div>

          <button className="mp-btn secondary" style={{ marginTop: 10 }} onClick={onExit}>← Volver</button>
        </div>
      )}

      {view === 'room' && room && (room.state === 'lobby' || room.state === 'countdown' || room.state === 'ended') && (
        <div className="mp-panel">
          <h2 className="mp-title">{room.isPublic ? `Lobby ${room.mode === 'battle' ? 'Battle Royale' : 'Coop'}` : `Sala privada`}</h2>
          {!room.isPublic && <div className="mp-code">{room.code}</div>}
          {!room.isPublic && <p style={{ color: '#999', fontSize: '0.85rem' }}>Pasale este código a tus amigos.</p>}

          <div className="mp-error">{error}</div>

          {room.state === 'ended' && results && (
            <>
              <h3 style={{ color: '#ffeb3b' }}>Resultados</h3>
              <ol className="mp-results-list">
                {results.map((r, i) => (
                  <li key={r.id}>
                    <span>#{i + 1} {r.name}</span>
                    <span>{fmtTime(r.survivedMs)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {room.state === 'countdown' && (
            <div className="mp-countdown">{Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))}</div>
          )}

          <ul className="mp-players">
            {room.players.map((p) => (
              <li key={p.id}>
                <span className="mp-dot" style={{ background: p.color }} />
                {p.name} {p.id === room.hostId && !room.isPublic ? '👑' : ''}
              </li>
            ))}
          </ul>

          {!room.isPublic && room.state !== 'countdown' && isHost && (
            <button className="mp-btn" onClick={startPrivateGame}>
              {room.state === 'ended' ? 'Jugar de nuevo' : 'Empezar partida (-20)'}
            </button>
          )}
          {!room.isPublic && !isHost && room.state !== 'countdown' && (
            <p style={{ color: '#999', fontSize: '0.85rem' }}>Esperando a que el anfitrión arranque la partida...</p>
          )}
          {room.isPublic && room.state === 'lobby' && (
            <p style={{ color: '#999', fontSize: '0.85rem' }}>Esperando otro jugador para arrancar...</p>
          )}

          <button className="mp-btn secondary" style={{ marginTop: 10 }} onClick={leaveRoom}>Salir de la sala</button>
        </div>
      )}

      {view === 'room' && room && room.state === 'playing' && (
        <>
          <div className="mp-hud">
            <span>{room.mode === 'battle' ? '⚔️ Battle Royale' : '🤝 Coop'} · {fmtTime(room.elapsedMs)}</span>
            <span>{room.players.filter((p) => p.alive).length}/{room.players.length} vivos</span>
          </div>
          <div className="mp-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={typeof window !== 'undefined' ? window.innerWidth * 0.95 : 1200}
              height={typeof window !== 'undefined' ? window.innerHeight * 0.82 : 700}
              style={{ width: '100%', height: '100%', borderRadius: 12 }}
            />
          </div>
        </>
      )}
    </div>
  );
}
