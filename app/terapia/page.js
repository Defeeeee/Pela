export const metadata = {
  title: 'Terapia | Pela',
  description: 'Terapia Folicular',
};

export default function TerapiaPage() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/imgs/unknown.webp"
        alt="Terapia"
        style={{
          maxWidth: '100vw',
          maxHeight: '100vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
