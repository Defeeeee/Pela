"use client"

import { useState, useEffect } from 'react';

const captchaImages = [
  { src: "/imgs/goat/Pelado Feliz.jpeg", isBald: true },
  { src: "/imgs/goat/pelado QEPD.jpg", isBald: true },
  { src: "/imgs/goat/pelado sospechoso.jpg", isBald: true },
  { src: "/imgs/goat/pelado tétrico.webp", isBald: true },
  { src: "/imgs/goat/Pelado Triste.jpeg", isBald: true },
  { src: "/imgs/cosas peladas/huevo-de-gallina-22169555.webp", isBald: false },
  { src: "/imgs/cosas peladas/La-importancia-del-Angulo-Q-para-cuidar-la-rodilla.webp", isBald: false },
  { src: "/imgs/coriglia/coriglia.webp", isBald: true },
  { src: "/imgs/labura/shovel.jpeg", isBald: false },
];

export default function CaptchaModal({ onVerify, onClose }) {
  const [grid, setGrid] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Shuffle and pick 9
    const shuffled = [...captchaImages].sort(() => 0.5 - Math.random());
    setGrid(shuffled.slice(0, 9));
  }, []);

  const toggleSelect = (index) => {
    if (selected.includes(index)) {
      setSelected(selected.filter(i => i !== index));
    } else {
      setSelected([...selected, index]);
    }
    setError(false);
  };

  const handleVerify = () => {
    const selectedItems = selected.map(idx => grid[idx]);
    const correctItems = grid.filter(item => item.isBald);
    const selectedCorrect = selectedItems.filter(item => item.isBald);

    // Basic logic: selected all bald items in the current grid and NO non-bald items
    const allBaldSelected = selectedCorrect.length === correctItems.length;
    const noWrongSelected = selectedItems.every(item => item.isBald);

    if (allBaldSelected && noWrongSelected) {
      onVerify();
    } else {
      setError(true);
      // Reshuffle on failure
      setTimeout(() => {
        const shuffled = [...captchaImages].sort(() => 0.5 - Math.random());
        setGrid(shuffled.slice(0, 9));
        setSelected([]);
      }, 1000);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      fontFamily: '"Roboto", "Arial", sans-serif'
    }}>
      <div style={{
        backgroundColor: '#fff',
        width: '400px',
        padding: '7px',
        boxShadow: '0 0 10px rgba(0,0,0,0.3)',
        userSelect: 'none'
      }}>
        {/* Blue Header */}
        <div style={{
          backgroundColor: '#4a90e2',
          color: '#fff',
          padding: '24px',
          marginBottom: '7px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '400' }}>Selecciona todos los cuadros que contengan</div>
          <div style={{ fontSize: '28px', fontWeight: '900', lineHeight: '1.1', margin: '5px 0' }}>PELADOS REALES</div>
          <div style={{ fontSize: '14px', fontWeight: '400' }}>Si no hay ninguno, haz clic en omitir</div>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          position: 'relative'
        }}>
          {grid.map((item, idx) => (
            <div 
              key={idx} 
              onClick={() => toggleSelect(idx)}
              style={{
                aspectRatio: '1/1',
                cursor: 'pointer',
                position: 'relative',
                border: selected.includes(idx) ? '2px solid #4a90e2' : '2px solid transparent',
                transition: 'all 0.1s'
              }}
            >
              <img src={item.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: selected.includes(idx) ? 'scale(0.85)' : 'scale(1)' }} alt="captcha" />
              {selected.includes(idx) && (
                <div style={{
                  position: 'absolute',
                  top: '5px',
                  left: '5px',
                  backgroundColor: '#4a90e2',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '12px'
                }}>✓</div>
              )}
            </div>
          ))}
          {error && (
            <div style={{
              position: 'absolute',
              bottom: '-30px',
              color: '#d93025',
              fontSize: '13px',
              width: '100%',
              textAlign: 'center'
            }}>
              Inténtalo de nuevo. ¿Confundiste una rodilla con el Pelado?
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 5px',
          marginTop: '10px',
          borderTop: '1px solid #eee'
        }}>
          <div style={{ display: 'flex', gap: '15px' }}>
             <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" style={{ width: '30px', opacity: 0.6 }} alt="re" />
             <div style={{ color: '#555', fontSize: '10px' }}>Privacidad - Condiciones</div>
          </div>
          <button 
            onClick={handleVerify}
            style={{
              backgroundColor: '#4a90e2',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '2px',
              fontWeight: '700',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            VERIFICAR
          </button>
        </div>
      </div>
    </div>
  );
}
