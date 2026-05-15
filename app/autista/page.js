"use client"

import { useState, useEffect, useRef } from 'react';

const allImages = [
  { src: "/imgs/coriglia/coriglia.webp", alt: "Coriglia" },
  { src: "/imgs/goat/Pelado Feliz.jpeg", alt: "Pelado Feliz" },
  { src: "/imgs/goat/Pelado Triste.jpeg", alt: "Pelado Triste" },
  { src: "/imgs/goat/pelado QEPD.jpg", alt: "Pelado QEPD" },
  { src: "/imgs/goat/pelado sospechoso.jpg", alt: "Pelado Sospechoso" },
  { src: "/imgs/goat/pelado tétrico.webp", alt: "Pelado Tétrico" },
  { src: "/imgs/labura/Job-Application-Form-Template-Google-Docs-Word-Page-01.webp", alt: "Job Application" },
  { src: "/imgs/labura/example-cv-simple-cv-86652b.jpg", alt: "CV" },
  { src: "/imgs/labura/shovel.jpeg", alt: "Pala" },
];

export default function AutistaPage() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const timeoutRef = useRef(null);

  const getNextRandomIndex = (prevIdx) => {
    let nextIdx;
    do {
      nextIdx = Math.floor(Math.random() * allImages.length);
    } while (nextIdx === prevIdx);
    return nextIdx;
  };

  const scheduleNext = (prevIdx) => {
    const nextInterval = Math.random() * (150 - 50) + 50; // Random between 0.05s and 0.15s
    
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

  const image = allImages[currentIdx];

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
        src={image.src}
        alt={image.alt}
        style={{
          width: '100vw',
          height: '100vh',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
