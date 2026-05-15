"use client"

import { useState, useEffect } from 'react';

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
        <MercadoPagoFullScreen onClose={() => setShowPaywall(false)} />
      )}
    </div>
  );
}

function MercadoPagoFullScreen({ onClose }) {
  const [step, setStep] = useState('select'); // select, processing, error
  const [selectedMethod, setSelectedMethod] = useState(null);

  const handleSelect = (method) => {
    setSelectedMethod(method);
  };

  const handleConfirm = () => {
    if (!selectedMethod) return;
    setStep('processing');
    setTimeout(() => {
      setStep('error');
    }, 2500);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#ebebeb',
      zIndex: 30000,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Proxima Nova", -apple-system, sans-serif'
    }}>
      {/* MP Navigation Bar */}
      <div style={{
        backgroundColor: '#009ee3',
        height: '56px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>←</button>
          <span style={{ fontSize: '18px', fontWeight: '500' }}>Mercado Pago</span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: '400', opacity: 0.9 }}>Ayuda</div>
      </div>

      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        padding: '24px 16px'
      }}>
        
        {step === 'select' && (
          <div style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', textAlign: 'center', marginBottom: '16px', border: '1px solid #ddd' }}>
              <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>Pela Corp. SAS</div>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#333' }}>$ 4.500,00</div>
            </div>

            <div style={{ color: '#333', fontWeight: '600', fontSize: '18px', marginBottom: '16px', paddingLeft: '4px' }}>
              ¿Cómo querés pagar?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { id: 'debito', label: 'Nueva tarjeta de débito', icon: '💳' },
                { id: 'credito', label: 'Nueva tarjeta de crédito', icon: '💳' },
                { id: 'efectivo', label: 'Efectivo en puntos de pago', icon: '💵' },
                { id: 'transfer', label: 'Transferencia electrónica', icon: '🏦' }
              ].map((opt) => (
                <div 
                  key={opt.id} 
                  onClick={() => handleSelect(opt.id)}
                  style={{
                    backgroundColor: '#fff',
                    padding: '20px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: selectedMethod === opt.id ? '2px solid #009ee3' : '1px solid #ddd',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '24px', marginRight: '16px' }}>{opt.icon}</span>
                  <span style={{ color: selectedMethod === opt.id ? '#009ee3' : '#333', fontSize: '16px', fontWeight: '500' }}>{opt.label}</span>
                </div>
              ))}
            </div>

            <button 
              onClick={handleConfirm}
              disabled={!selectedMethod}
              style={{
                backgroundColor: selectedMethod ? '#009ee3' : '#ccc',
                color: '#fff',
                border: 'none',
                padding: '16px',
                borderRadius: '6px',
                fontWeight: '600',
                fontSize: '18px',
                width: '100%',
                marginTop: '32px',
                cursor: selectedMethod ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.3s'
              }}
            >
              Continuar
            </button>
          </div>
        )}

        {step === 'processing' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="mp-spinner" style={{
              width: '60px',
              height: '60px',
              border: '6px solid #ddd',
              borderTopColor: '#009ee3',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <p style={{ marginTop: '24px', color: '#333', fontSize: '18px', fontWeight: '500' }}>Estamos procesando tu pago...</p>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {step === 'error' && (
          <div style={{ width: '100%', maxWidth: '500px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ 
              width: '80px', 
              height: '80px', 
              backgroundColor: '#ff4b4b', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#fff',
              fontSize: '40px',
              marginBottom: '24px'
            }}>!</div>
            <h2 style={{ color: '#333', fontSize: '24px', marginBottom: '16px' }}>Pago rechazado</h2>
            <p style={{ color: '#666', fontSize: '16px', lineHeight: '1.5', marginBottom: '32px' }}>
              No pudimos procesar los $ 4.500,00. El banco informó que "el usuario no tiene suficiente pelada para avalar este argumento".
            </p>
            <button 
              onClick={() => setStep('select')}
              style={{
                backgroundColor: '#009ee3',
                color: '#fff',
                border: 'none',
                padding: '16px',
                borderRadius: '6px',
                fontWeight: '600',
                fontSize: '18px',
                width: '100%',
                cursor: 'pointer'
              }}
            >
              Intentar con otro medio
            </button>
            <button 
              onClick={onClose}
              style={{
                marginTop: '16px',
                background: 'none',
                border: 'none',
                color: '#009ee3',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Volver al verificador
            </button>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '16px', color: '#999', fontSize: '12px' }}>
        Protegido por Mercado Pago
      </div>
    </div>
  );
}
