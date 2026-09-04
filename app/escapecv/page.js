"use client"
import { useState, useEffect, useRef } from 'react';
import { useSocialCredit } from '../SocialCreditContext';
import Link from 'next/link';

export default function EscapeCVPage() {
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScoreChase, setHighScoreChase] = useState(0);
  const [highScoreDodge, setHighScoreDodge] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [currentMode, setCurrentMode] = useState('chase');
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const requestRef = useRef();
  const canvasRef = useRef(null);
  
  const stateRef = useRef({
    mode: 'chase',
    fenceIndex: 0,
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
    keys: {},
    deviceOrientation: { beta: 0, gamma: 0, initialBeta: null, initialGamma: null }
  });

  const { deductCredit, addCredit } = useSocialCredit();
  const addCreditRef = useRef(addCredit);
  useEffect(() => { addCreditRef.current = addCredit; }, [addCredit]);

  useEffect(() => {
    setHighScoreChase(parseInt(localStorage.getItem('escapecv_highscore_chase') || localStorage.getItem('escapecv_highscore') || '0'));
    setHighScoreDodge(parseInt(localStorage.getItem('escapecv_highscore_dodge') || '0'));
    
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth * 0.95,
        height: window.innerHeight * 0.85
      });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    const handleOrientation = (e) => {
      if (e.beta !== null && e.gamma !== null) {
        stateRef.current.deviceOrientation.beta = e.beta;
        stateRef.current.deviceOrientation.gamma = e.gamma;
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const startGame = async (mode) => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission();
        if (permissionState !== 'granted') {
          console.warn('Permiso de giroscopio denegado');
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (!gameStarted) {
      deductCredit(20, `jugar-/escapecv-${mode}`);
    }
    const canvas = canvasRef.current;
    setCurrentMode(mode);
    
    stateRef.current = {
      mode: mode,
      fenceIndex: Math.floor(Math.random() * 4),
      player: { x: canvas.width / 2, y: canvas.height / 2, size: 48, baseSpeed: 3.5, normalSpeed: 3.5, boostSpeed: 7.5, boostTime: 0, speed: 3.5 },
      enemies: mode === 'chase' ? [{ x: 50, y: 50, size: 36, vx: 0, vy: 0, type: 'chaser' }] : [],
      warnings: [],
      powerups: [],
      startTime: Date.now(),
      lastEnemyTime: Date.now(),
      lastRewardTime: Date.now(),
      enemyBaseSpeed: 1.5,
      enemySpawnRate: mode === 'chase' ? 3500 : 2000,
      frozenTime: 0,
      keys: stateRef.current.keys,
      deviceOrientation: { 
        beta: stateRef.current.deviceOrientation.beta, 
        gamma: stateRef.current.deviceOrientation.gamma, 
        initialBeta: stateRef.current.deviceOrientation.beta, 
        initialGamma: stateRef.current.deviceOrientation.gamma 
      }
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

    if (state.player.boostTime > now && state.mode === 'chase') {
      state.player.speed = state.player.boostSpeed;
    } else {
      state.player.speed = state.player.normalSpeed;
    }

    let dx = 0, dy = 0;
    // Keyboard controls
    if (state.keys['w'] || state.keys['arrowup']) dy -= 1;
    if (state.keys['s'] || state.keys['arrowdown']) dy += 1;
    if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
    if (state.keys['d'] || state.keys['arrowright']) dx += 1;
    
    // Gyroscope controls
    if (dx === 0 && dy === 0 && state.deviceOrientation.initialBeta !== null && state.deviceOrientation.initialGamma !== null) {
      const betaDiff = state.deviceOrientation.beta - state.deviceOrientation.initialBeta;
      const gammaDiff = state.deviceOrientation.gamma - state.deviceOrientation.initialGamma;
      const threshold = 5;

      if (betaDiff < -threshold) dy -= 1;
      if (betaDiff > threshold) dy += 1;
      if (gammaDiff > threshold) dx += 1;
      if (gammaDiff < -threshold) dx -= 1;
    }

    if (dx !== 0 && dy !== 0) {
      const length = Math.sqrt(dx*dx + dy*dy);
      dx /= length; dy /= length;
    }
    
    state.player.x += dx * state.player.speed;
    state.player.y += dy * state.player.speed;
    
    // clamp player
    if (state.mode === 'chase') {
      state.player.x = Math.max(state.player.size/2, Math.min(canvas.width - state.player.size/2, state.player.x));
      state.player.y = Math.max(state.player.size/2, Math.min(canvas.height - state.player.size/2, state.player.y));
    } else {
      const corralW = canvas.width * 0.707;
      const corralH = canvas.height * 0.707;
      const cx = (canvas.width - corralW) / 2;
      const cy = (canvas.height - corralH) / 2;
      state.player.x = Math.max(cx + state.player.size/2, Math.min(cx + corralW - state.player.size/2, state.player.x));
      state.player.y = Math.max(cy + state.player.size/2, Math.min(cy + corralH - state.player.size/2, state.player.y));
    }

    if (now - state.lastEnemyTime > state.enemySpawnRate) {
      state.lastEnemyTime = now;

      if (state.mode === 'chase') {
        if (Math.random() < 0.25) { 
          let ex, ey;
          if (Math.random() < 0.5) {
            ex = Math.random() < 0.5 ? -40 : canvas.width + 40;
            ey = Math.random() * canvas.height;
          } else {
            ex = Math.random() * canvas.width;
            ey = Math.random() < 0.5 ? -40 : canvas.height + 40;
          }
          const clamp = (val, max) => Math.max(10, Math.min(val, max - 10));
          state.warnings.push({ 
            x: ex, y: ey, 
            dotX: clamp(ex, canvas.width), dotY: clamp(ey, canvas.height), 
            spawnAt: now + 1500,
            type: Math.random() < 0.5 ? 'chaser' : 'random',
            size: 36
          });
        } else {
           state.enemySpawnRate = Math.max(1000, state.enemySpawnRate - 150);
        }
      } else {
        // Dodge mode spawning
        // Spawns N shovels at once, size and speed are mixed.
        const numToSpawn = 1 + Math.floor(Math.random() * (1 + timeAlive / 15));
        for (let i = 0; i < numToSpawn; i++) {
          let ex, ey;
          const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
          
          if (side === 0) { ex = Math.random() * canvas.width; ey = -60; }
          else if (side === 1) { ex = canvas.width + 60; ey = Math.random() * canvas.height; }
          else if (side === 2) { ex = Math.random() * canvas.width; ey = canvas.height + 60; }
          else { ex = -60; ey = Math.random() * canvas.height; }

          // Target point across the screen (in the corral general area)
          const corralW = canvas.width * 0.707;
          const corralH = canvas.height * 0.707;
          const cx = (canvas.width - corralW) / 2;
          const cy = (canvas.height - corralH) / 2;
          const tx = cx + Math.random() * corralW;
          const ty = cy + Math.random() * corralH;

          const dx = tx - ex;
          const dy = ty - ey;
          const dist = Math.hypot(dx, dy);
          
          // Speed variation (can have slow/small ones mixed with big/fast ones)
          const isGiant = Math.random() < (0.1 + timeAlive / 200);
          const size = isGiant ? 60 + Math.random() * 40 : 20 + Math.random() * 20;
          const speedFactor = isGiant ? 0.8 + Math.random() * 0.5 : 1 + Math.random();
          const speed = Math.max(2, state.enemyBaseSpeed * speedFactor);

          const vx = (dx / dist) * speed;
          const vy = (dy / dist) * speed;

          const clamp = (val, max) => Math.max(10, Math.min(val, max - 10));
          state.warnings.push({
            x: ex, y: ey,
            vx, vy,
            dotX: clamp(ex, canvas.width), dotY: clamp(ey, canvas.height),
            spawnAt: now + 1000 + Math.random() * 500,
            type: 'bullet',
            size: size
          });
        }
        state.enemySpawnRate = Math.max(800, state.enemySpawnRate - 50);
      }
    }

    // Process warnings to actual enemies
    for (let i = state.warnings.length - 1; i >= 0; i--) {
      const w = state.warnings[i];
      if (now >= w.spawnAt) {
        state.enemies.push({ x: w.x, y: w.y, size: w.size, vx: w.vx || 0, vy: w.vy || 0, type: w.type });
        state.warnings.splice(i, 1);
      }
    }

    // Powerups only in Chase mode
    if (state.mode === 'chase') {
      if (Math.random() < 0.005 && state.powerups.length < 3) {
        state.powerups.push({
          x: Math.random() * (canvas.width - 60) + 30,
          y: Math.random() * (canvas.height - 60) + 30,
          type: Math.random() < 0.5 ? 'boost' : 'freeze',
          size: 30,
          createdAt: now
        });
      }

      state.powerups = state.powerups.filter(p => now - p.createdAt < 8000);

      const pr = { x: state.player.x, y: state.player.y, r: state.player.size / 2 };

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
    }

    const isFrozen = state.frozenTime > now;
    const pr = { x: state.player.x, y: state.player.y, r: state.player.size / 2 };

    // Move enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      
      if (!isFrozen) {
        if (e.type === 'random') {
          if (!e.nextTurn || now > e.nextTurn) {
             if (Math.random() < 0.4) {
                e.targetAngle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
             } else {
                e.targetAngle = Math.random() * Math.PI * 2;
             }
             e.nextTurn = now + 500 + Math.random() * 1500; 
          }
          const targetVx = Math.cos(e.targetAngle) * state.enemyBaseSpeed * 1.3;
          const targetVy = Math.sin(e.targetAngle) * state.enemyBaseSpeed * 1.3;
          e.vx += (targetVx - e.vx) * 0.05;
          e.vy += (targetVy - e.vy) * 0.05;

          if (e.x < 30) e.vx += 0.5;
          if (e.x > canvas.width - 30) e.vx -= 0.5;
          if (e.y < 30) e.vy += 0.5;
          if (e.y > canvas.height - 30) e.vy -= 0.5;
        } else if (e.type === 'chaser') {
          let edx = state.player.x - e.x;
          let edy = state.player.y - e.y;
          const dist = Math.sqrt(edx*edx + edy*edy);
          if (dist > 0) {
            const targetVx = (edx / dist) * state.enemyBaseSpeed;
            const targetVy = (edy / dist) * state.enemyBaseSpeed;
            e.vx += (targetVx - e.vx) * 0.1;
            e.vy += (targetVy - e.vy) * 0.1;
          }
        }
        // bullet type just moves with vx, vy
        
        e.x += e.vx;
        e.y += e.vy;
      }

      // Check collision
      const hitboxR = e.size * 0.35; // scales with enemy size
      const collisionDist = Math.hypot(state.player.x - e.x, state.player.y - e.y);
      if (collisionDist < pr.r + hitboxR) {
        setGameOver(true);
        if (state.mode === 'chase') {
          if (currentScore > highScoreChase) {
            setHighScoreChase(currentScore);
            localStorage.setItem('escapecv_highscore_chase', currentScore);
          }
        } else {
          if (currentScore > highScoreDodge) {
            setHighScoreDodge(currentScore);
            localStorage.setItem('escapecv_highscore_dodge', currentScore);
          }
        }
        return; 
      }

      // Remove bullet enemies if they go far off screen
      if (e.type === 'bullet' && (e.x < -200 || e.x > canvas.width + 200 || e.y < -200 || e.y > canvas.height + 200)) {
        state.enemies.splice(i, 1);
      }
    }

    // Enemies collision with each other (only chaser and random, bullets don't collide)
    if (state.mode === 'chase') {
      for (let i = 0; i < state.enemies.length; i++) {
        for (let j = i + 1; j < state.enemies.length; j++) {
          const e1 = state.enemies[i];
          const e2 = state.enemies[j];
          if (e1.type === 'bullet' || e2.type === 'bullet') continue;
          
          const dx = e2.x - e1.x;
          const dy = e2.y - e1.y;
          const dist = Math.hypot(dx, dy);
          const minDist = 28; 
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

    // Draw Corral if Dodge mode
    if (state.mode === 'dodge') {
      const corralW = canvas.width * 0.707;
      const corralH = canvas.height * 0.707;
      const cx = (canvas.width - corralW) / 2;
      const cy = (canvas.height - corralH) / 2;
      
      // Fill corral background slightly lighter
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(cx, cy, corralW, corralH);
      
      const fenceImg = document.getElementById(`fence-${state.fenceIndex}`);
      if (fenceImg) {
        const fSize = 32;
        // Top and bottom edges
        for (let x = cx; x < cx + corralW; x += fSize) {
          ctx.drawImage(fenceImg, x, cy - fSize/2, fSize, fSize);
          ctx.drawImage(fenceImg, x, cy + corralH - fSize/2, fSize, fSize);
        }
        // Left and right edges
        for (let y = cy; y < cy + corralH; y += fSize) {
          ctx.drawImage(fenceImg, cx - fSize/2, y, fSize, fSize);
          ctx.drawImage(fenceImg, cx + corralW - fSize/2, y, fSize, fSize);
        }
      } else {
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.strokeRect(cx, cy, corralW, corralH);
      }
    }

    // Draw spawn warnings
    const now = Date.now();
    for (const w of state.warnings) {
      const remaining = w.spawnAt - now;
      if (remaining > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(now / 100) * 0.5;
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(w.dotX, w.dotY, w.size ? w.size * 0.35 : 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Draw powerups
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of state.powerups) {
      const floatY = Math.sin((now - p.createdAt) / 200) * 4;
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
      const angle = Math.atan2(e.vy, e.vx);
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
        .highscore { color: #ffeb3b; font-variant-numeric: tabular-nums; flex-direction: column; display: flex; font-size: 0.9rem;}
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
          padding: 14px 24px;
          font-size: 1.1rem;
          font-weight: 800;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 15px rgba(255, 235, 59, 0.3);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 235, 59, 0.5);
        }
        .btn-dodge {
          background: #ff5722;
          box-shadow: 0 4px 15px rgba(255, 87, 34, 0.3);
          color: white;
        }
        .btn-dodge:hover {
          box-shadow: 0 6px 20px rgba(255, 87, 34, 0.5);
        }
        .btn-container {
          display: flex;
          gap: 20px;
          margin-top: 25px;
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
      
      {/* Fence Sprites */}
      <img id="fence-0" src="/imgs/fence sprites/Sprite-0003.png" className="hidden" alt="Fence" />
      <img id="fence-1" src="/imgs/fence sprites/Sprite-0004.png" className="hidden" alt="Fence" />
      <img id="fence-2" src="/imgs/fence sprites/Sprite-0005.png" className="hidden" alt="Fence" />
      <img id="fence-3" src="/imgs/fence sprites/Sprite-0008.png" className="hidden" alt="Fence" />

      <div className="header">
        <Link href="/menu" className="back-link">← Volver al menú</Link>
        <div className="score-board">
          <div className="score">PTS: {score}</div>
          <div className="highscore">
            <span>TOP CHASE: {highScoreChase}</span>
            <span>TOP DODGE: {highScoreDodge}</span>
          </div>
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
            
            <div className="btn-container">
              <button className="btn" onClick={() => startGame('chase')}>
                {gameOver && currentMode === 'chase' ? 'REINTENTAR CHASE (-20)' : 'JUGAR CHASE (-20)'}
              </button>
              <button className="btn btn-dodge" onClick={() => startGame('dodge')}>
                {gameOver && currentMode === 'dodge' ? 'REINTENTAR DODGE (-20)' : 'JUGAR DODGE (-20)'}
              </button>
            </div>
            
            <div className="instructions">
              <strong>Mecánica:</strong> Esquivá con <b>WASD</b> / <b>Flechas</b> o inclinando tu celular.<br/>
              <b>Chase:</b> Las palas te persiguen en campo abierto. Hay powerups.<br/>
              <b>Dodge:</b> Estás encerrado en el corral y tenés que esquivar oleadas variadas de palas.<br/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
