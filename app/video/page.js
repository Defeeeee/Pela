"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

const VIDEOS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rickroll
  'https://www.youtube.com/watch?v=jNQXAC9IVRw', // Me at the zoo
];

export default function VideoPage() {
  const [videoData, setVideoData] = useState(null);

  useEffect(() => {
    const url = VIDEOS[Math.floor(Math.random() * VIDEOS.length)];
    let data = { url, type: 'video' };
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))((\w|-){11})/);
      const videoId = match ? match[1] : '';
      if (videoId) {
        data.type = 'youtube';
        // mute=1 is necessary for autoplay to work without user interaction
        data.url = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&showinfo=0&rel=0`;
      }
    }
    
    setVideoData(data);
  }, []);

  if (!videoData) return null;

  return (
    <div className="video-container">
      <style>{`
        .video-container {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background: #000;
          position: relative;
        }

        .back-link {
          position: absolute;
          top: 20px;
          left: 20px;
          color: rgba(255, 255, 255, 0.5);
          text-decoration: none;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 1rem;
          z-index: 10;
          transition: color 0.2s;
        }
        
        .back-link:hover {
          color: #fff;
        }

        .player-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }
      `}</style>

      <Link href="/menu" className="back-link">← VOLVER AL MENÚ</Link>

      <div className="player-wrapper">
        {videoData.type === 'youtube' ? (
          <iframe
            width="100%"
            height="100%"
            src={videoData.url}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        ) : (
          <video 
            width="100%" 
            height="100%" 
            controls 
            autoPlay 
            muted
            style={{ objectFit: 'contain' }}
          >
            <source src={videoData.url} type={videoData.url.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
            Tu navegador no soporta el formato de video.
          </video>
        )}
      </div>
    </div>
  );
}
