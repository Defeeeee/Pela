"use client"

import { useState } from 'react';

export default function ArgumentoPage() {
  const [argumento, setArgumento] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!argumento.trim()) return;
    setShowPaywall(true);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px',
      fontFamily: 'sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>Verificador de Argumentatividad</h1>
      <p style={{ color: '#888', marginBottom: '40px', textAlign: 'center' }}>
        Nuestro algoritmo avanzado basado en pelados determinará la validez de tu razonamiento.
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '600px' }}>
        <textarea
          value={argumento}
          onChange={(e) => setArgumento(e.target.value)}
          placeholder="Escribí tu argumento acá..."
          style={{
            width: '100%',
            height: '200px',
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: '10px',
            color: '#fff',
            padding: '15px',
            fontSize: '1rem',
            marginBottom: '20px',
            outline: 'none',
            resize: 'none'
          }}
        />
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '15px',
            backgroundColor: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: '10px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Verificar Argumento
        </button>
      </form>

      {showPaywall && (
        <MercadoPagoModal onClose={() => setShowPaywall(false)} />
      )}
    </div>
  );
}

function MercadoPagoModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20000,
      fontFamily: '"Proxima Nova", -apple-system, "Helvetica Neue", Helvetica, Roboto, Arial, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#ebebeb',
        width: '100%',
        maxWidth: '400px',
        height: '100%',
        maxHeight: '650px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        {/* MP Header */}
        <div style={{
          backgroundColor: '#009ee3',
          padding: '16px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '18px', fontWeight: '600' }}>Mercado Pago</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '4px', textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>Vas a pagar a</div>
            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#333' }}>Pela Corp. SAS</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333', marginTop: '20px' }}>$ 4.500,00</div>
          </div>

          <div style={{ color: '#333', fontWeight: '600', marginBottom: '16px' }}>¿Cómo querés pagar?</div>

          {/* Payment Options */}
          {[
            { label: 'Nueva tarjeta de débito', icon: '💳' },
            { label: 'Nueva tarjeta de crédito', icon: '💳' },
            { label: 'Efectivo en puntos de pago', icon: '💵' },
            { label: 'Transferencia electrónica', icon: '🏦' }
          ].map((opt, i) => (
            <div key={i} style={{
              backgroundColor: '#fff',
              padding: '16px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              marginBottom: '8px',
              cursor: 'pointer'
            }}>
              <span style={{ fontSize: '24px', marginRight: '16px' }}>{opt.icon}</span>
              <span style={{ color: '#009ee3', fontSize: '16px' }}>{opt.label}</span>
            </div>
          ))}

          <div style={{ flex: 1 }}></div>

          <button style={{
            backgroundColor: 'rgba(0, 158, 227, 0.1)',
            color: '#009ee3',
            border: 'none',
            padding: '16px',
            borderRadius: '4px',
            fontWeight: '600',
            fontSize: '16px',
            width: '100%',
            cursor: 'not-allowed'
          }}>
            Confirmar pago
          </button>
          
          <div style={{ textAlign: 'center', color: '#999', fontSize: '12px', marginTop: '16px' }}>
            Protegido por Mercado Pago
          </div>
        </div>
      </div>
    </div>
  );
}
