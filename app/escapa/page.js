"use client"

import { useState, useEffect, useRef } from 'react';
import { useSocialCredit } from '../SocialCreditContext';

const images = [
  "/imgs/goat/Pelado Feliz.jpeg",
  "/imgs/goat/Pelado Triste.jpeg",
  "/imgs/goat/pelado QEPD.jpg",
  "/imgs/goat/pelado sospechoso.jpg",
  "/imgs/goat/pelado tétrico.webp",
];

const PELADO_SIZE = 120;
const PELADO_RADIUS = PELADO_SIZE / 2;
const AVOID_RADIUS = 250;
const SPEED = 8;
const PELADO_COUNT = 15;
// 1 sería un rebote perfecto. Un pelín menos evita que la pila se vuelva
// un pinball eterno cuando el cursor los amontona contra una esquina.
const RESTITUTION = 0.9;
// Separar un par puede volver a encimar otro, así que la separación se relaja
// en varias pasadas. Con 15 pelados son 105 pares por pasada: nada de trabajo,
// y es lo que evita que se pisen cuando el cursor los amontona en una esquina.
const SOLVER_ITERATIONS = 3;

/**
 * Ubica los pelados sin encimarlos. Es rejection sampling acotado: en una
 * pantalla chica puede no haber lugar para los 15, así que después de unos
 * intentos se ubica igual y la resolución de colisiones los separa sola en
 * los primeros frames.
 */
function spawnPelados(count, width, height) {
  const maxX = Math.max(0, width - PELADO_SIZE);
  const maxY = Math.max(0, height - PELADO_SIZE);
  const placed = [];

  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;

    for (let attempt = 0; attempt < 100; attempt++) {
      x = Math.random() * maxX;
      y = Math.random() * maxY;
      const libre = placed.every((o) => Math.hypot(o.x - x, o.y - y) >= PELADO_SIZE);
      if (libre) break;
    }

    placed.push({
      id: i,
      x,
      y,
      src: images[Math.floor(Math.random() * images.length)],
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
    });
  }

  return placed;
}

/**
 * Colisión entre pelados, tratados como círculos de PELADO_RADIUS.
 * Muta el array que recibe, que siempre son objetos recién creados en el
 * frame, nunca el estado anterior.
 *
 * Las paredes se aplican adentro de cada pasada y no al final: si se clampeara
 * recién al terminar, arrinconar pelados contra un borde los volvería a encimar
 * justo después de haberlos separado.
 */
function resolveCollisions(pelados, width, height) {
  const maxX = width - PELADO_SIZE;
  const maxY = height - PELADO_SIZE;

  for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
    // El rebote se aplica una sola vez por frame; las pasadas extra son sólo
    // para terminar de despegarlos. Repetir el impulso los haría saltar de más.
    const conRebote = iter === 0;

    for (let i = 0; i < pelados.length; i++) {
      for (let j = i + 1; j < pelados.length; j++) {
        const a = pelados[i];
        const b = pelados[j];

        // Los centros, no la esquina del elemento: x/y son la posición del div.
        let nx = b.x - a.x;
        let ny = b.y - a.y;
        let dist = Math.hypot(nx, ny);

        if (dist >= PELADO_SIZE) continue;

        if (dist === 0) {
          // Dos pelados exactamente encima: dirección fija para no dividir por
          // cero ni meter azar adentro del loop de animación.
          nx = 1;
          ny = 0;
          dist = 0.0001;
        } else {
          nx /= dist;
          ny /= dist;
        }

        // Separación posicional mitad y mitad, así ninguno queda pisado.
        const overlap = (PELADO_SIZE - dist) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        if (!conRebote) continue;

        // Velocidad relativa proyectada sobre la normal. Si es <= 0 ya se están
        // separando y meter impulso los pegotearía.
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn <= 0) continue;

        // Masas iguales: se intercambia la componente normal de la velocidad.
        const impulse = ((1 + RESTITUTION) * vn) / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }

    // Sólo posición: el rebote de velocidad contra la pared se resuelve una
    // vez por frame, afuera, para no invertir la velocidad tres veces seguidas.
    for (const p of pelados) {
      if (p.x < 0) p.x = 0;
      else if (p.x > maxX) p.x = maxX;
      if (p.y < 0) p.y = 0;
      else if (p.y > maxY) p.y = maxY;
    }
  }
}

export default function EscapaPage() {
  const [pelados, setPelados] = useState([]);
  const requestRef = useRef();
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const { deductCredit } = useSocialCredit();
  const hasDeducted = useRef(false);

  // Initialize pelados positions
  useEffect(() => {
    if (!hasDeducted.current) {
      deductCredit(30, 'visit-/escapa');
      hasDeducted.current = true;
    }
    setPelados(spawnPelados(PELADO_COUNT, window.innerWidth, window.innerHeight));

    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const animate = () => {
    setPelados((prevPelados) => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // 1. Huida del cursor, fricción e integración de la posición.
      const next = prevPelados.map((p) => {
        let { x, y, vx, vy } = p;

        // Distance to mouse
        const dx = x + PELADO_RADIUS - mouseRef.current.x;
        const dy = y + PELADO_RADIUS - mouseRef.current.y;
        const distance = Math.hypot(dx, dy);

        if (distance < AVOID_RADIUS) {
          // Calculate escape vector
          const angle = Math.atan2(dy, dx);
          const force = (AVOID_RADIUS - distance) / AVOID_RADIUS;
          vx += Math.cos(angle) * force * SPEED;
          vy += Math.sin(angle) * force * SPEED;
        }

        // Apply friction
        vx *= 0.95;
        vy *= 0.95;

        return { ...p, x: x + vx, y: y + vy, vx, vy };
      });

      // 2. Choques entre pelados y contra las paredes, relajados juntos.
      resolveCollisions(next, width, height);

      // 3. Rebote contra la pared. Sólo si todavía va *hacia* el borde: sin esa
      //    guarda, un pelado que el cursor mantiene apretado contra la pared se
      //    pasa el frame invirtiendo la velocidad y tiembla en el lugar.
      for (const p of next) {
        if ((p.x <= 0 && p.vx < 0) || (p.x >= width - PELADO_SIZE && p.vx > 0)) p.vx *= -1;
        if ((p.y <= 0 && p.vy < 0) || (p.y >= height - PELADO_SIZE && p.vy > 0)) p.vy *= -1;
      }

      return next;
    });
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#111',
      overflow: 'hidden',
      cursor: 'none' // Hide real cursor
    }}>
      <style>{`
        .pala-cursor {
          position: fixed;
          width: 80px;
          height: 80px;
          pointer-events: none;
          z-index: 9999;
          transform: translate(-50%, -50%);
        }
        .pelado-head {
          position: absolute;
          width: ${PELADO_SIZE}px;
          height: ${PELADO_SIZE}px;
          border-radius: 50%;
          object-fit: cover;
          box-shadow: 0 10px 20px rgba(0,0,0,0.5);
          transition: transform 0.1s;
        }
      `}</style>

      {/* Custom Shovel Cursor */}
      <img
        src="/imgs/labura/shovel.jpeg"
        className="pala-cursor"
        style={{
          left: mouseRef.current.x,
          top: mouseRef.current.y,
          borderRadius: '10px'
        }}
        alt="PALA"
      />

      {pelados.map((p) => (
        <img
          key={p.id}
          src={p.src}
          className="pelado-head"
          style={{
            left: p.x,
            top: p.y,
            transform: `rotate(${p.vx * 5}deg)`
          }}
          alt="PELADO"
        />
      ))}

      <div style={{
        position: 'absolute',
        bottom: '20px',
        width: '100%',
        textAlign: 'center',
        color: '#666',
        fontFamily: 'sans-serif',
        pointerEvents: 'none'
      }}>
        INTENTÁ QUE AGARREN LA PALA
      </div>
    </div>
  );
}
