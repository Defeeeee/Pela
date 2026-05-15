"use client"

import { useState, useEffect, useRef } from 'react';

const images = [
  "Pelado Feliz.jpeg",
  "Pelado Triste.jpeg",
  "pelado QEPD.jpg",
  "pelado sospechoso.jpg",
  "pelado tétrico.webp",
];

export default function AutistaPage() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const timeoutRef = useRef(null);

  const getNextRandomIndex = (prevIdx) => {
    let nextIdx;
    do {
      nextIdx = Math.floor(Math.random() * images.length);
    } while (nextIdx === prevIdx);
    return nextIdx;
  };

  const scheduleNext = (prevIdx) => {
    const nextInterval = Math.random() * (1500 - 200) + 200; // Random between 0.2s and 1.5s
    
    timeoutRef.current = setTimeout(() => {
      const nextIdx = getNextRandomIndex(prevIdx);
      setCurrentIdx(nextIdx);
      scheduleNext(nextIdx);
    }, nextInterval);
  };

  useEffect(() => {
    scheduleNext(currentIdx);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const fileName = images[currentIdx];
  const src = `/imgs/goat/${encodeURIComponent(fileName)}`;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Pelado"
        style={{
          width: '100vw',
          height: '100vh',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
