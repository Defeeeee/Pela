"use client"

import { useState, useEffect } from 'react';

const workImages = [
  '/imgs/labura/Job-Application-Form-Template-Google-Docs-Word-Page-01.webp',
  '/imgs/labura/example-cv-simple-cv-86652b.jpg'
];

export default function WorkJumpscare() {
  const [show, setShow] = useState(false);
  const [imgSrc, setImgSrc] = useState('');

  useEffect(() => {
    // Check for jumpscare chance every 5 seconds
    const interval = setInterval(() => {
      if (Math.random() < 0.50) { // 50% chance every 5s
        trigger();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const trigger = () => {
    const randomImg = workImages[Math.floor(Math.random() * workImages.length)];
    setImgSrc(randomImg);
    setShow(true);
    
    // Auto-hide after 1.5 seconds
    setTimeout(() => {
      setShow(false);
    }, 1500);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'flash 0.1s steps(2) infinite'
    }}>
      <style>{`
        @keyframes flash {
          0% { opacity: 1; }
          50% { opacity: 0.7; }
          100% { opacity: 1; }
        }
      `}</style>
      <img 
        src={imgSrc} 
        alt="LABURA" 
        style={{ 
          maxHeight: '100vh', 
          maxWidth: '100vw', 
          objectFit: 'contain',
          transform: `scale(${1 + Math.random() * 0.1})`,
          filter: 'contrast(1.5) brightness(1.2)'
        }} 
      />
      <div style={{
        position: 'absolute',
        color: 'red',
        fontSize: '10rem',
        fontWeight: '900',
        textShadow: '0 0 20px black',
        transform: 'rotate(-10deg)',
        pointerEvents: 'none'
      }}>
        LABURÁ
      </div>
    </div>
  );
}
