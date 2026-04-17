export default function HealthPage() {
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
      <h1 style={{
        fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
        fontWeight: '700',
        maxWidth: '800px',
        margin: 0,
        color: '#fff',
        textShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
      }}>
        El pela sigue vivo y argumentando, creeme
      </h1>
    </div>
  );
}
