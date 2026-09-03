"use client"
import { useState, useEffect, useRef } from 'react';
import { useSocialCredit } from '../SocialCreditContext';
import Link from 'next/link';

export default function EscapeCVPage() {
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const requestRef = useRef();
  const canvasRef = useRef(null);
  
  const stateRef = useRef({
    player: { x: 0, y: 0, size: 48, baseSpeed: 3.5, normalSpeed: 3.5, boostSpeed: 7.5, boostTime: 0, speed: 3.5 },
    enemies: [],
    warnings: [],
    powerups: [],
    startTime: 0,
    lastEnemyTime: 0,
    lastRewardTime: 0,
    enemyBaseSpeed: 1.5,
    enemySpawnRate: 3500,
    frozenTime: 0,
    keys: {}
  });

  const { deductCredit, addCredit } = useSocialCredit();
  const addCreditRef = useRef(addCredit);
  useEffect(() => { addCreditRef.current = addCredit; }, [addCredit]);

  useEffect(() => {
    setHighScore(parseInt(localStorage.getItem('escapecv_highscore') || '0'));
    
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth * 0.95,
        height: window.innerHeight * 0.85
      });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const startGame = () => {
    if (!gameStarted) {
      deductCredit(20, 'jugar-/escapecv');
    }
    const canvas = canvasRef.current;
    stateRef.current = {
      player: { x: canvas.width / 2, y: canvas.height / 2, size: 48, baseSpeed: 3.5, normalSpeed: 3.5, boostSpeed: 7.5, boostTime: 0, speed: 3.5 },
      enemies: [{ x: 50, y: 50, size: 36, vx: 0, vy: 0 }],
      warnings: [],
      powerups: [],
      startTime: Date.now(),
      lastEnemyTime: Date.now(),
      lastRewardTime: Date.now(),
      enemyBaseSpeed: 1.5,
      enemySpawnRate: 3500,
      frozenTime: 0,
      keys: stateRef.current.keys
    };
    setGameOver(false);
    setGameStarted(true);
    setScore(0);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    const handleKeyDown = (e) => { 
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].indexOf(e.key) > -1) {
          e.preventDefault();
      }
      stateRef.current.keys[e.key.toLowerCase()] = true; 
    };
    const handleKeyUp = (e) => { stateRef.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const update = () => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const now = Date.now();

    // Reward survival points exactly every 15s using the game loop
    if (now - state.lastRewardTime >= 15000) {
      state.lastRewardTime = now;
      if (addCreditRef.current) addCreditRef.current(5);
    }

    const timeAlive = (now - state.startTime) / 1000;
    const currentScore = Math.floor(Math.pow(timeAlive, 1.6) * 10);
    setScore(currentScore);

    const speedScaling = timeAlive * 0.05; 
    state.player.normalSpeed = state.player.baseSpeed + speedScaling;
    state.player.boostSpeed = state.player.normalSpeed + 4;
    state.enemyBaseSpeed = 1.5 + (timeAlive * 0.055);

    if (state.player.boostTime > now) {
      state.player.speed = state.player.boostSpeed;
    } else {
      state.player.speed = state.player.normalSpeed;
    }

    let dx = 0, dy = 0;
    if (state.keys['w'] || state.keys['arrowup']) dy -= 1;
    if (state.keys['s'] || state.keys['arrowdown']) dy += 1;
    if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
    if (state.keys['d'] || state.keys['arrowright']) dx += 1;
    
    if (dx !== 0 && dy !== 0) {
      const length = Math.sqrt(dx*dx + dy*dy);
      dx /= length; dy /= length;
    }
    
    state.player.x += dx * state.player.speed;
    state.player.y += dy * state.player.speed;
    
    state.player.x = Math.max(state.player.size/2, Math.min(canvas.width - state.player.size/2, state.player.x));
    state.player.y = Math.max(state.player.size/2, Math.min(canvas.height - state.player.size/2, state.player.y));

    if (now - state.lastEnemyTime > state.enemySpawnRate) {
      state.lastEnemyTime = now;
      if (Math.random() < 0.25) { 
        // 25% chance to spawn new enemy, first schedule a warning
        let ex, ey;
        if (Math.random() < 0.5) {
          ex = Math.random() < 0.5 ? -40 : canvas.width + 40;
          ey = Math.random() * canvas.height;
        } else {
          ex = Math.random() * canvas.width;
          ey = Math.random() < 0.5 ? -40 : canvas.height + 40;
        }
        
        // Push warning. Clamp coordinates to edge of screen so dot is visible
        const clamp = (val, max) => Math.max(10, Math.min(val, max - 10));
        state.warnings.push({ 
          x: ex, 
          y: ey, 
          dotX: clamp(ex, canvas.width), 
          dotY: clamp(ey, canvas.height), 
          spawnAt: now + 1500 
        });
      } else {
         state.enemySpawnRate = Math.max(1000, state.enemySpawnRate - 150);
      }
    }

    // Process warnings to actual enemies
    for (let i = state.warnings.length - 1; i >= 0; i--) {
      const w = state.warnings[i];
      if (now >= w.spawnAt) {
        state.enemies.push({ x: w.x, y: w.y, size: 36, vx: 0, vy: 0 });
        state.warnings.splice(i, 1);
      }
    }

    // Powerups spawn randomly (~1% chance per frame if < 3 on screen)
    if (Math.random() < 0.005 && state.powerups.length < 3) {
      state.powerups.push({
        x: Math.random() * (canvas.width - 60) + 30,
        y: Math.random() * (canvas.height - 60) + 30,
        type: Math.random() < 0.5 ? 'boost' : 'freeze',
        size: 30,
        createdAt: now
      });
    }

    // Remove old powerups after 8s
    state.powerups = state.powerups.filter(p => now - p.createdAt < 8000);

    const pr = { x: state.player.x, y: state.player.y, r: state.player.size / 2 };

    // Check powerup collisions
    for (let i = state.powerups.length - 1; i >= 0; i--) {
      const p = state.powerups[i];
      const dist = Math.hypot(p.x - pr.x, p.y - pr.y);
      if (dist < pr.r + p.size/2) {
        if (p.type === 'boost') {
          state.player.boostTime = now + 1500;
        } else if (p.type === 'freeze') {
          state.frozenTime = now + 500; 
        }
        state.powerups.splice(i, 1);
      }
    }

    const isFrozen = state.frozenTime > now;

    // Move enemies (with some inertia/smoothing so they don't instaturn perfectly)
    for (const e of state.enemies) {
      if (!isFrozen) {
        let edx = state.player.x - e.x;
        let edy = state.player.y - e.y;
        const dist = Math.sqrt(edx*edx + edy*edy);
        if (dist > 0) {
          const targetVx = (edx / dist) * state.enemyBaseSpeed;
          const targetVy = (edy / dist) * state.enemyBaseSpeed;
          // Interpolate velocity for a tiny bit of drift/inertia
          e.vx += (targetVx - e.vx) * 0.1;
          e.vy += (targetVy - e.vy) * 0.1;
        }
        e.x += e.vx;
        e.y += e.vy;
      }

      // Check collision
      const hitboxR = 12; // Generous small hitbox for the shovel
      const collisionDist = Math.hypot(state.player.x - e.x, state.player.y - e.y);
      if (collisionDist < pr.r + hitboxR) {
        setGameOver(true);
        if (currentScore > highScore) {
          setHighScore(currentScore);
          localStorage.setItem('escapecv_highscore', currentScore);
        }
        return; 
      }
    }

    // Enemies collision with each other so they don't overlap
    for (let i = 0; i < state.enemies.length; i++) {
      for (let j = i + 1; j < state.enemies.length; j++) {
        const e1 = state.enemies[i];
        const e2 = state.enemies[j];
        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = 28; // Enemy collision radius
        if (dist > 0 && dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          e1.x -= (nx * overlap) / 2;
          e1.y -= (ny * overlap) / 2;
          e2.x += (nx * overlap) / 2;
          e2.y += (ny * overlap) / 2;
        }
      }
    }

    draw(state, canvas);
    requestRef.current = requestAnimationFrame(update);
  };

  const draw = (state, canvas) => {
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid pattern
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for(let i = 0; i < canvas.width; i+=40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for(let i = 0; i < canvas.height; i+=40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Draw spawn warnings (Red dot pulsing)
    const now = Date.now();
    for (const w of state.warnings) {
      const remaining = w.spawnAt - now;
      if (remaining > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(now / 100) * 0.5; // Pulse alpha
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(w.dotX, w.dotY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Draw powerups
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of state.powerups) {
      // Small floating animation
      const floatY = Math.sin((Date.now() - p.createdAt) / 200) * 4;
      ctx.fillText(p.type === 'boost' ? '🧉' : '❄️', p.x, p.y + floatY);
    }

    // Draw player
    const playerImg = document.getElementById('img-player');
    if (playerImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, state.player.size/2, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(playerImg, state.player.x - state.player.size/2, state.player.y - state.player.size/2, state.player.size, state.player.size);
      
      // Boost aura
      if (state.player.boostTime > Date.now()) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#4caf50';
        ctx.stroke();
      }
      ctx.restore();
    }
    
    // Draw enemies
    const enemyImg = document.getElementById('img-enemy');
    const isFrozen = state.frozenTime > Date.now();
    for (const e of state.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      // Face movement direction
      const angle = Math.atan2(e.vy, e.vx);
      // Adding Math.PI to reverse the pointing direction (opposite corner)
      ctx.rotate(angle + Math.PI/4 + Math.PI); 
      
      if (enemyImg) {
        if (isFrozen) {
           ctx.filter = 'grayscale(100%) brightness(1.5)';
        }
        ctx.drawImage(enemyImg, -e.size/2, -e.size/2, e.size, e.size);
      }
      ctx.restore();
    }
  };

  useEffect(() => {
    if (canvasRef.current && !gameStarted) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.fillStyle = '#141414';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [gameStarted, dimensions]);

  return (
    <div className="game-container">
      <style>{`
        .game-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #080808;
          color: white;
          font-family: system-ui, sans-serif;
          overflow: hidden;
        }
        .header {
          display: flex;
          justify-content: space-between;
          width: 95vw;
          margin-bottom: 10px;
          align-items: center;
        }
        .score-board {
          display: flex;
          gap: 20px;
          font-size: 1.2rem;
          font-weight: 800;
        }
        .score { color: #fff; font-variant-numeric: tabular-nums; }
        .highscore { color: #ffeb3b; font-variant-numeric: tabular-nums; }
        .canvas-wrapper {
          position: relative; 
          width: 95vw; 
          height: 85vh;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.6);
          background: #141414;
        }
        canvas {
          border-radius: 12px;
        }
        .overlay {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.85);
          border-radius: 12px;
          z-index: 10;
          backdrop-filter: blur(4px);
        }
        .btn {
          background: #ffeb3b;
          color: #000;
          border: none;
          padding: 14px 32px;
          font-size: 1.2rem;
          font-weight: 800;
          border-radius: 8px;
          cursor: pointer;
          margin-top: 25px;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 15px rgba(255, 235, 59, 0.3);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 235, 59, 0.5);
        }
        .hidden { display: none; }
        .back-link {
          color: #888;
          text-decoration: none;
          font-size: 1rem;
          font-weight: 500;
          transition: color 0.2s;
        }
        .back-link:hover { color: #fff; }
        .instructions {
          margin-top: 20px;
          color: #aaa;
          font-size: 1rem;
          text-align: center;
          line-height: 1.6;
        }
      `}</style>

      {/* Hidden images for canvas */}
      <img id="img-player" src="/imgs/goat/Pelado Feliz.jpeg" className="hidden" alt="Player" />
      <img id="img-enemy" src="/imgs/labura/shovel.jpeg" className="hidden" alt="Enemy" />

      <div className="header">
        <Link href="/menu" className="back-link">← Volver al menú</Link>
        <div className="score-board">
          <div className="score">PTS: {score}</div>
          <div className="highscore">TOP: {highScore}</div>
        </div>
      </div>

      <div className="canvas-wrapper">
        <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} />
        
        {(!gameStarted || gameOver) && (
          <div className="overlay">
            <h1 style={{ color: gameOver ? '#ff4444' : '#fff', fontSize: '3.5rem', margin: '0 0 10px 0', textShadow: '0 4px 10px rgba(0,0,0,0.5)', textAlign: 'center' }}>
              {gameOver ? 'TE AGARRÓ LA PALA' : 'ESCAPÁ A LA PALA'}
            </h1>
            {gameOver && <p style={{ fontSize: '1.8rem', margin: '0', color: '#ccc', fontWeight: 600 }}>Puntaje: {score}</p>}
            <button className="btn" onClick={startGame}>
              {gameOver ? 'REINTENTAR (-20 Reserva)' : 'JUGAR (-20 Reserva)'}
            </button>
            <div className="instructions">
              <strong>Mecánica:</strong> Esquivá las palas con <b>WASD</b> o <b>Flechas</b>.<br/>
              La velocidad de ambos aumenta con el tiempo.<br/><br/>
              🧉 Velocidad extra por 1.5s<br/>
              ❄️ Congelar palas por 0.5s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
