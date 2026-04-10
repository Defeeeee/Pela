'use client';

import { useState, useEffect } from 'react';

export default function LoadingScreen({ fileName, delay, initialTitle }) {
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const newProgress = Math.min((elapsed / delay) * 100, 100);
      setProgress(newProgress);
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setLoaded(true);
      document.title = initialTitle;
    }, delay);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [delay, initialTitle]);

  const styles = {
    loader: {
      color: '#fff',
      fontFamily: 'sans-serif',
      fontSize: '2rem',
      textAlign: 'center',
      display: loaded ? 'none' : 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
    },
    barBg: {
      marginTop: '1rem',
      width: '300px',
      height: '12px',
      background: '#333',
      borderRadius: '6px',
      overflow: 'hidden',
    },
    bar: {
      height: '100%',
      width: `${progress}%`,
      background: '#fff',
      borderRadius: '6px',
      transition: 'width 0.1s linear',
    },
    imgContainer: {
      display: loaded ? 'block' : 'none',
      position: 'fixed',
      inset: 0,
    },
    img: {
      width: '100vw',
      height: '100vh',
      objectFit: 'fill',
    },
  };

  return (
    <>
      <div style={styles.loader}>
        Cargando al pelado...
        <div style={styles.barBg}>
          <div style={styles.bar}></div>
        </div>
      </div>
      <div style={styles.imgContainer}>
        {/* Using a regular img here because next/image object-fit: fill with 100vw/vh is tricky to match exactly the simple behavior of express app */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/imgs/${fileName}`} alt={fileName} style={styles.img} />
      </div>
    </>
  );
}
