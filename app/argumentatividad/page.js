export default function ShipPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#000',
      backgroundImage: 'radial-gradient(circle at center, #1a001a 0%, #000 100%)',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      padding: '20px',
      textAlign: 'center',
      overflow: 'hidden'
    }}>
      <style>{`
        @keyframes heartBeat {
          0% { transform: scale(1); }
          14% { transform: scale(1.3); }
          28% { transform: scale(1); }
          42% { transform: scale(1.3); }
          70% { transform: scale(1); }
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-heart {
          animation: heartBeat 1.2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
          color: #ff0055;
          font-size: 80px;
          margin: 0 20px;
          text-shadow: 0 0 30px rgba(255, 0, 85, 0.6);
        }
        .animate-ship {
          animation: float 4s ease-in-out infinite;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 40px;
        }
        .fade-in {
          animation: fadeIn 1s ease-out forwards;
        }
        .profile-img {
          width: 180px;
          height: 180px;
          border-radius: 50%;
          object-fit: cover;
          border: 4px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 0 50px rgba(0, 0, 0, 0.8);
          transition: all 0.3s ease;
        }
        .profile-img:hover {
          border-color: #ff0055;
          transform: scale(1.05);
        }
      `}</style>

      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="animate-ship">
          <div style={{ position: 'relative' }}>
            <img
              src="/imgs/coriglia.webp"
              alt="Coriglia"
              className="profile-img"
            />
            <div style={{ marginTop: '15px', fontWeight: 'bold', color: '#ffc0cb' }}>Coriglia</div>
          </div>

          <div className="animate-heart">❤</div>

          <div style={{ position: 'relative' }}>
            <img
              src="/imgs/Pelado Feliz.jpeg"
              alt="Pelado Feliz"
              className="profile-img"
            />
            <div style={{ marginTop: '15px', fontWeight: 'bold', color: '#ffc0cb' }}>Pelado Feliz</div>
          </div>
        </div>

        <p style={{
          fontSize: '1.2rem',
          maxWidth: '600px',
          color: 'rgba(255, 255, 255, 0.7)',
          fontStyle: 'italic',
          lineHeight: '1.6'
        }}>
          "Un amor que trasciende la pantalla y desafía toda lógica argumentativa."
        </p>
      </div>
    </div>
  );
}
