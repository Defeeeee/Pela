export default function ClosedPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#000',
      backgroundImage: 'radial-gradient(circle at center, #1a1a00 0%, #000 100%)',
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
          src="/imgs/goat/pelado QEPD.jpg"
          alt="Pelado QEPD"
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            marginBottom: '40px',
            border: '2px solid rgba(255, 255, 0, 0.15)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            objectFit: 'cover'
          }}
        />

        <h1 style={{
          fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
          fontWeight: '700',
          maxWidth: '800px',
          margin: 0,
          color: '#fff',
          textShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
        }}>
          hoy no laburo, no me jodas
        </h1>
      </div>
    </div>
  );
}
