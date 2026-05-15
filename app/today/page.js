"use client"

import { useState, useEffect, useRef } from "react";
import { useRouter } from 'next/navigation';
import styles from "./page.module.css";
import LoadingScreen from '../LoadingScreen';
import CaptchaModal from './CaptchaModal';
import { useSocialCredit } from '../SocialCreditContext';

const images = [
  "Pelado Feliz.jpeg",
  "Pelado Triste.jpeg",
  "pelado QEPD.jpg",
  "pelado sospechoso.jpg",
  "pelado tétrico.webp",
];

export default function TodayPage() {
  const [selected, setSelected] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sendingFile, setSendingFile] = useState(null);
  const [sendingDelay, setSendingDelay] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const { deductCredit } = useSocialCredit();
  const hasDeducted = useRef(false);

  useEffect(() => {
    if (!hasDeducted.current) {
      console.log('[TodayPage] Deducting 10 points on mount');
      deductCredit(10);
      hasDeducted.current = true;
    }
  }, [deductCredit]);

  const router = useRouter();

  const loadImageSize = (src) => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 180, height: 180 });
      img.src = src;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected) {
      alert('Seleccioná un pelado antes de enviar.');
      return;
    }

    setShowCaptcha(true);
  };

  const handleCaptchaVerify = async () => {
    setShowCaptcha(false);

    // 5% chance to be sent to work
    if (Math.random() < 0.05) {
      router.push('/labura');
      return;
    }

    const src = `/imgs/goat/${encodeURIComponent(selected)}`;
    const { width, height } = await loadImageSize(src);
    const pixelCount = width * height;

    let extraDelay = Math.floor(Math.random() * 4001) - 2000; // -2000ms to +2000ms
    const maxDelayFromImage = Math.floor(Math.random() * 2001); // 0 to 2000ms

    if (pixelCount > maxDelayFromImage) {
      extraDelay -= pixelCount - maxDelayFromImage;
    }

    const delay = Math.max(1500, pixelCount + extraDelay);

    setSendingFile(selected);
    setSendingDelay(delay);
    setIsSending(true);
  };
    const sendingTitle = sendingFile ? sendingFile.replace(/\.[^/.]+$/, '').replace(/\b\w/g, c => c.toUpperCase()) : '';

    return (
      <>
        {showCaptcha && (
          <CaptchaModal 
            onVerify={handleCaptchaVerify} 
            onClose={() => setShowCaptcha(false)} 
          />
        )}
        {isSending && (
          <LoadingScreen
            fileName={sendingFile}
            delay={sendingDelay}
            initialTitle={sendingTitle}
            message={"Enviando al backend"}
            onComplete={() => router.push('/instant?file=' + encodeURIComponent(sendingFile))}
          />
        )}
        <main className={styles.container}>
          <div className={styles.animateContent}>
            <h1 className={styles.title}>¿Qué pelado sos hoy?</h1>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.grid}>
                {images.map((name, idx) => {
                  const value = name;
                  const src = `/imgs/goat/${encodeURIComponent(name)}`;
                  return (
                    <label
                      key={idx}
                      className={`${styles.card} ${selected === value ? styles.selected : ""}`}
                    >
                      <input
                        type="radio"
                        name="pelado"
                        value={value}
                        checked={selected === value}
                        onChange={() => setSelected(value)}
                      />
                      <img src={src} alt={value} className={styles.img} />
                      <div className={styles.caption}>{name.replace(/\.[^/.]+$/, "")}</div>
                    </label>
                  );
                })}
              </div>

              <div className={styles.actions}>
                <button type="submit" className={styles.submit}>Enviar</button>
              </div>
            </form>
          </div>
      </main>
    </>
  );
}
