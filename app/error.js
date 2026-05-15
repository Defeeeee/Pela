'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#000',
      backgroundImage: 'radial-gradient(circle at center, #1a0000 0%, #000 100%)',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-content {
          animation: fadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div className="animate-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img
          src="/imgs/goat/Pelado Triste.jpeg"
          alt="Pelado Triste"
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            marginBottom: '40px',
            border: '2px solid rgba(255, 0, 0, 0.2)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            objectFit: 'cover'
          }}
        />
        <h1 style={{
          fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
          fontWeight: '700',
          maxWidth: '800px',
          margin: 0,
          background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0.7) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
        }}>
          Algo salió mal, el pela está triste.
        </h1>
        <button
          onClick={() => reset()}
          style={{
            marginTop: '30px',
            padding: '12px 24px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
