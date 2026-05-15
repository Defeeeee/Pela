"use client"

import { useState, useEffect, useRef } from 'react';

const images = [
  "/imgs/coriglia/coriglia.webp",
  "/imgs/goat/Pelado Feliz.jpeg",
  "/imgs/goat/Pelado Triste.jpeg",
  "/imgs/goat/pelado QEPD.jpg",
  "/imgs/goat/pelado sospechoso.jpg",
  "/imgs/goat/pelado tétrico.webp",
];

const PELADO_SIZE = 120;
const AVOID_RADIUS = 250;
const SPEED = 8;

export default function EscapaPage() {
  const [pelados, setPelados] = useState([]);
  const requestRef = useRef();
  const mouseRef = useRef({ x: -1000, y: -1000 });

  // Initialize pelados positions
  useEffect(() => {
    const initialPelados = Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      x: Math.random() * (window.innerWidth - PELADO_SIZE),
      y: Math.random() * (window.innerHeight - PELADO_SIZE),
      src: images[Math.floor(Math.random() * images.length)],
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
    }));
    setPelados(initialPelados);

    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const animate = () => {
    setPelados((prevPelados) =>
      prevPelados.map((p) => {
        let { x, y, vx, vy } = p;

        // Distance to mouse
        const dx = x + PELADO_SIZE / 2 - mouseRef.current.x;
        const dy = y + PELADO_SIZE / 2 - mouseRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

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

        // Update position
        x += vx;
        y += vy;

        // Bounce off walls
        if (x < 0) { x = 0; vx *= -1; }
        if (x > window.innerWidth - PELADO_SIZE) { x = window.innerWidth - PELADO_SIZE; vx *= -1; }
        if (y < 0) { y = 0; vy *= -1; }
        if (y > window.innerHeight - PELADO_SIZE) { y = window.innerHeight - PELADO_SIZE; vy *= -1; }

        return { ...p, x, y, vx, vy };
      })
    );
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
