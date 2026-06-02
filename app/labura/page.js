"use client"

import { useEffect } from 'react';
import { useSocialCredit } from '../SocialCreditContext';

export default function LaburaPage() {
  const { addCredit } = useSocialCredit();

  useEffect(() => {
    const interval = setInterval(() => {
      addCredit(1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'sans-serif',
      textAlign: 'center',
      padding: '20px'
    }}>
      <img 
        src="/imgs/labura/shovel.jpeg" 
        alt="Pala" 
        style={{
          maxWidth: '300px',
          borderRadius: '15px',
          marginBottom: '30px',
          boxShadow: '0 0 30px rgba(255, 255, 255, 0.2)'
        }} 
      />
      <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Hoy no hay pelado</h1>
      <p style={{ fontSize: '1.5rem', color: '#ccc' }}>Hoy se labura.</p>

      <a href="/clicker" style={{
        marginTop: '30px',
        color: '#ffeb3b',
        textDecoration: 'none',
        fontSize: '1.1rem',
        fontWeight: 'bold',
        border: '1px solid #ffeb3b',
        padding: '12px 28px',
        borderRadius: '8px',
        backgroundColor: 'rgba(255, 235, 59, 0.05)',
        boxShadow: '0 0 15px rgba(255, 235, 59, 0.1)',
        transition: 'all 0.2s ease',
        textAlign: 'center'
      }}>
        Minar Palas en Pala Clicker ⛏️
      </a>
      
      <a href="/" style={{
        marginTop: '24px',
        color: '#666',
        textDecoration: 'none',
        fontSize: '0.9rem',
        border: '1px solid #333',
        padding: '10px 20px',
        borderRadius: '5px'
      }}>
        Volver (si te dejan)
      </a>
    </div>
  );
}
