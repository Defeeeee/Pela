"use client";
import { useState, useEffect } from 'react';

const VIDEOS = ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ']; // Hardcoded list of links

export default function VideoPage() {
  const [videoData, setVideoData] = useState(null);

  useEffect(() => {
    if (VIDEOS.length > 0) {
      const randomVideo = VIDEOS[Math.floor(Math.random() * VIDEOS.length)];
      
      let data = {
        url: randomVideo,
        isYouTube: false
      };

      // Check if it's a YouTube link
      if (randomVideo.includes('youtube.com') || randomVideo.includes('youtu.be')) {
        data.isYouTube = true;
        const match = randomVideo.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))((\w|-){11})/);
        const videoId = match ? match[1] : '';
        
        if (videoId) {
          // Embed URL with autoplay, mute (required for autoplay), and loop
          data.url = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}`;
        }
      }

      setVideoData(data);
    }
  }, []);

  if (!videoData) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>
        No videos available.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      {videoData.isYouTube ? (
        <iframe
          width="100%"
          height="100%"
          src={videoData.url}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: '16/9' }}
        ></iframe>
      ) : (
        <video controls autoPlay loop muted style={{ maxWidth: '100%', maxHeight: '100%' }}>
          <source src={videoData.url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  );
}
