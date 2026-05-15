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
      backgroundColor: '#0a0a0a',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '60px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '700px', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '16px', letterSpacing: '-0.02em' }}>
          Analizador de Argumentatividad <span style={{ color: '#0070f3' }}>Pro</span>
        </h1>
        <p style={{ color: '#888', fontSize: '1.1rem', lineHeight: '1.5' }}>
          Utilizamos redes neuronales de pelados de alta densidad para validar la coherencia de tus ideas. 
          Ingresa tu texto a continuación para un escaneo profundo.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '700px', position: 'relative' }}>
        <div style={{
          position: 'relative',
          backgroundColor: '#111',
          borderRadius: '16px',
          border: '1px solid #333',
          padding: '2px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}>
          <textarea
            value={argumento}
            onChange={(e) => setArgumento(e.target.value)}
            placeholder="Escribe tu argumento o tesis aquí..."
            style={{
              width: '100%',
              height: '250px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#fff',
              padding: '20px',
              fontSize: '1.1rem',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit'
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            marginTop: '24px',
            width: '100%',
            padding: '18px',
            backgroundColor: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1.1rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'transform 0.1s, background-color 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#ececec'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#fff'}
        >
          Verificar con Pela-AI™
        </button>
      </form>

      {showPaywall && (
        <GenericPaywall onClose={() => setShowPaywall(false)} />
      )}
    </div>
  );
}

function GenericPaywall({ onClose }) {
  const [step, setStep] = useState('input'); // input, processing, error
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvc: '', name: '' });

  const handlePay = (e) => {
    e.preventDefault();
    setStep('processing');
    setTimeout(() => {
      setStep('error');
    }, 3000);
  };

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) return parts.join(' ');
    return value;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#fff',
      color: '#30313d',
      zIndex: 50000,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, sans-serif',
      animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .input-field {
          border: 1px solid #e6e6e6;
          border-radius: 4px;
          padding: 12px;
          font-size: 16px;
          width: 100%;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-field:focus {
          border-color: #0070f3;
          box-shadow: 0 0 0 3px rgba(0, 112, 243, 0.1);
        }
      `}</style>

      {/* Modern Header */}
      <div style={{
        padding: '20px 40px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '24px', height: '24px', backgroundColor: '#30313d', borderRadius: '4px' }}></div>
          <span style={{ fontWeight: '700', fontSize: '18px' }}>Secure Checkout</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#a3acb9' }}>✕</button>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          
          {step === 'input' && (
            <form onSubmit={handlePay}>
              <div style={{ marginBottom: '32px' }}>
                <div style={{ color: '#697386', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Pay Pela Corp.</div>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#1a1f36' }}>$4.500,00 ARS</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#1a1f36' }}>Email address</label>
                  <input type="email" className="input-field" placeholder="email@ejemplo.com" required />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#1a1f36' }}>Card information</label>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <input 
                      type="text" 
                      className="input-field" 
                      style={{ borderRadius: '4px 4px 0 0' }}
                      placeholder="1234 5678 1234 5678" 
                      value={cardData.number}
                      onChange={(e) => setCardData({...cardData, number: formatCardNumber(e.target.value)})}
                      maxLength="19"
                      required 
                    />
                    <div style={{ display: 'flex', marginTop: '-1px' }}>
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ borderRadius: '0 0 0 4px', borderRight: 'none' }}
                        placeholder="MM / YY" 
                        maxLength="5"
                        required 
                      />
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ borderRadius: '0 0 4px 0' }}
                        placeholder="CVC" 
                        maxLength="3"
                        required 
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#1a1f36' }}>Cardholder name</label>
                  <input type="text" className="input-field" placeholder="Full name on card" required />
                </div>
              </div>

              <button type="submit" style={{
                marginTop: '32px',
                width: '100%',
                padding: '12px',
                backgroundColor: '#0070f3',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                Pay $4.500,00
              </button>

              <div style={{ marginTop: '24px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#a3acb9' }}>Powered by</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#a3acb9' }}>Stripe-Pela</span>
              </div>
            </form>
          )}

          {step === 'processing' && (
            <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid #f3f3f3',
                borderTopColor: '#0070f3',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}></div>
              <p style={{ marginTop: '24px', color: '#1a1f36', fontWeight: '500' }}>Confirming your payment...</p>
            </div>
          )}

          {step === 'error' && (
            <div style={{ textAlign: 'center', animation: 'fadeIn 0.3s ease' }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                backgroundColor: '#feb2b2', 
                borderRadius: '50%', 
                margin: '0 auto 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c53030',
                fontSize: '32px',
                fontWeight: 'bold'
              }}>!</div>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1f36', marginBottom: '12px' }}>Your card was declined</h2>
              <p style={{ color: '#697386', fontSize: '16px', lineHeight: '1.5', marginBottom: '32px' }}>
                El procesador de pagos ha detectado que no posees la cantidad de folículos capilares necesaria para garantizar esta transacción. 
                El banco sugiere que intentes con una actividad más productiva.
              </p>
              
              <button 
                onClick={() => window.location.href = '/labura'}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#0070f3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cerrar y Agarrar la Pala
              </button>
              
              <p 
                onClick={() => window.location.href = '/labura'}
                style={{ marginTop: '20px', color: '#0070f3', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
              >
                Probar con otra tarjeta (No va a andar tampoco)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
