"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocialCredit } from "../SocialCreditContext";

const REVEAL_DURATION = 1100;
const COVER_DURATION = 500;
const SHUFFLE_ROUNDS = 9;
const SHUFFLE_INTERVAL = 420;

const PELADO_FELIZ = "Pelado Feliz.jpeg";
const PELADO_TRISTE = "Pelado Triste.jpeg";

const bucketLabelByType = {
  pelado: "Pelado feliz",
  shovel: "Pala",
};

const bucketIconByType = {
  pelado: null,
  shovel: "/imgs/labura/shovel.jpeg",
};

const buildBuckets = () => {
  const peladoIndex = Math.floor(Math.random() * 3);
  return Array.from({ length: 3 }, (_, index) => ({
    id: `bucket-${index}`,
    type: index === peladoIndex ? "pelado" : "shovel",
  }));
};

export default function BucketsPage() {
  const router = useRouter();
  const { deductCredit } = useSocialCredit();
  const [phase, setPhase] = useState("idle");
  const [buckets, setBuckets] = useState([]);
  const [slots, setSlots] = useState([0, 1, 2]);
  const [slotDistance, setSlotDistance] = useState(190);
  const [result, setResult] = useState(null);

  const shuffleTimerRef = useRef(null);
  const redirectTimerRef = useRef(null);
  const stepTimersRef = useRef([]);

  const peladoHappySrc = useMemo(
    () => `/imgs/goat/${encodeURIComponent(PELADO_FELIZ)}`,
    []
  );
  const peladoSadSrc = useMemo(
    () => `/imgs/goat/${encodeURIComponent(PELADO_TRISTE)}`,
    []
  );

  const clearTimers = useCallback(() => {
    if (shuffleTimerRef.current) {
      clearInterval(shuffleTimerRef.current);
      shuffleTimerRef.current = null;
    }
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    if (stepTimersRef.current.length) {
      stepTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      stepTimersRef.current = [];
    }
  }, []);

  const startShuffle = useCallback(() => {
    clearTimers();
    setResult(null);
    deductCredit(15, `play-/buckets-${Date.now()}`);
    setBuckets(buildBuckets());
    setSlots([0, 1, 2]);
    setPhase("reveal");

    const coverTimer = setTimeout(() => {
      setPhase("cover");
    }, REVEAL_DURATION);

    const shuffleTimer = setTimeout(() => {
      setPhase("shuffling");
      let round = 0;
      shuffleTimerRef.current = setInterval(() => {
        setSlots((prevSlots) => {
          const nextSlots = [...prevSlots];
          const first = Math.floor(Math.random() * nextSlots.length);
          let second = Math.floor(Math.random() * nextSlots.length);
          if (second === first) {
            second = (second + 1) % nextSlots.length;
          }
          const temp = nextSlots[first];
          nextSlots[first] = nextSlots[second];
          nextSlots[second] = temp;
          return nextSlots;
        });

        round += 1;
        if (round >= SHUFFLE_ROUNDS) {
          clearTimers();
          setPhase("choose");
        }
      }, SHUFFLE_INTERVAL);
    }, REVEAL_DURATION + COVER_DURATION);

    stepTimersRef.current = [coverTimer, shuffleTimer];
  }, [clearTimers, deductCredit]);

  useEffect(() => {
    setBuckets(buildBuckets());
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    const updateDistance = () => {
      const width = window.innerWidth;
      if (width < 520) {
        setSlotDistance(120);
        return;
      }
      if (width < 900) {
        setSlotDistance(170);
        return;
      }
      setSlotDistance(220);
    };

    updateDistance();
    window.addEventListener("resize", updateDistance);
    return () => window.removeEventListener("resize", updateDistance);
  }, []);

  const handlePick = (bucket) => {
    if (phase !== "choose") return;

    const isWin = bucket.type === "pelado";
    setResult(isWin ? "win" : "lose");
    setPhase("result");

    if (!isWin) {
      redirectTimerRef.current = setTimeout(() => {
        router.push("/labura");
      }, 5000);
    }
  };

  const message = phase === "idle"
    ? "Listo cuando vos quieras."
    : phase === "reveal"
      ? "Mirá bien dónde está..."
      : phase === "cover"
        ? "Se guardan..."
        : phase === "shuffling"
          ? "Mezclando los baldes..."
          : phase === "choose"
            ? "¿Dónde quedó el pelado feliz?"
            : "";

  return (
    <div className="bucket-stage">
      <style>{`
        :root {
          --gold: #ffeb3b;
          --gold-hover: #ffff72;
          --gold-dim: rgba(255, 235, 59, 0.15);
          --gold-glow: rgba(255, 235, 59, 0.05);
          --card-bg: rgba(20, 20, 10, 0.65);
          --card-border: rgba(255, 255, 255, 0.08);
          --card-border-gold: rgba(255, 235, 59, 0.15);
          --text-main: #ffffff;
          --text-muted: rgba(255, 255, 255, 0.65);
        }

        @keyframes fadeInScale {
          from { 
            opacity: 0; 
            transform: scale(0.97) translateY(15px); 
          }
          to { 
            opacity: 1; 
            transform: scale(1) translateY(0); 
          }
        }

        .bucket-stage {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at center, #1b1a03 0%, #080802 60%, #000000 100%);
          color: var(--text-main);
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          position: relative;
          overflow-x: hidden;
          padding: 60px 20px;
          box-sizing: border-box;
        }

        .grain {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 8px 8px;
          opacity: 0.3;
          pointer-events: none;
          z-index: 0;
        }

        .arena {
          animation: fadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          width: 100%;
          max-width: 900px;
          background: var(--card-bg);
          border: 1px solid var(--card-border-gold);
          border-radius: 28px;
          padding: 36px 24px 44px;
          position: relative;
          z-index: 1;
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 235, 59, 0.03);
          backdrop-filter: blur(16px);
          box-sizing: border-box;
        }

        .arena-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .arena-title {
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 900;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          margin: 0 0 10px;
          background: linear-gradient(135deg, #ffffff 40%, var(--gold) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .arena-subtitle {
          font-size: clamp(0.95rem, 2vw, 1.15rem);
          color: var(--text-muted);
          margin: 0;
        }

        .status-panel {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .status-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 1.05rem;
          font-weight: 500;
          color: #ffffff;
        }

        .status-pulse {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--gold);
          box-shadow: 0 0 12px var(--gold);
          animation: pulse 1.2s infinite ease-in-out;
        }

        @keyframes pulse {
          0% { transform: scale(0.85); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 18px var(--gold); }
          100% { transform: scale(0.85); opacity: 0.6; }
        }

        .game-cost-badge {
          background: rgba(255, 235, 59, 0.1);
          border: 1px solid rgba(255, 235, 59, 0.2);
          padding: 4px 12px;
          border-radius: 99px;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gold);
        }

        .status-actions {
          display: flex;
          justify-content: center;
        }

        .play-button {
          background: var(--gold);
          color: #000000;
          border: none;
          padding: 14px 36px;
          border-radius: 999px;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 8px 24px rgba(255, 235, 59, 0.25);
        }

        .play-button:hover {
          background: var(--gold-hover);
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(255, 235, 59, 0.4);
        }

        .play-button:active {
          transform: translateY(0);
        }

        .bucket-field {
          position: relative;
          height: clamp(260px, 35vw, 340px);
          margin: 40px 0 20px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .bucket-floor-shadow {
          position: absolute;
          left: 5%;
          right: 5%;
          bottom: 20px;
          height: 16px;
          background: radial-gradient(ellipse at center, rgba(255, 235, 59, 0.06), transparent 70%);
          pointer-events: none;
        }

        .bucket {
          position: absolute;
          top: 45%;
          width: clamp(120px, 18vw, 160px);
          height: clamp(140px, 20vw, 180px);
          transform: translate(-50%, -50%);
          transition: left 0.42s cubic-bezier(0.25, 1, 0.5, 1), transform 0.42s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.25s ease;
          background: linear-gradient(135deg, #4f4116 0%, #2b2105 50%, #150f00 100%);
          border: 2px solid rgba(255, 235, 59, 0.35);
          border-radius: 24px 24px 20px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 235, 59, 0.03);
          cursor: pointer;
          pointer-events: auto;
          user-select: none;
          overflow: hidden;
          padding: 0;
        }

        .bucket::before {
          content: "";
          position: absolute;
          top: 6px;
          left: 6px;
          right: 6px;
          height: 18px;
          border-radius: 12px;
          background: linear-gradient(90deg, rgba(255, 235, 59, 0.25), rgba(255, 255, 255, 0));
          opacity: 0.7;
          pointer-events: none;
        }

        .bucket:hover {
          transform: translate(-50%, -54%) scale(1.04);
          border-color: var(--gold);
          box-shadow: 0 22px 40px rgba(0, 0, 0, 0.7), 0 0 25px rgba(255, 235, 59, 0.15);
        }

        .bucket.reveal {
          transform: translate(-50%, -64%) scale(1.05);
          border-color: var(--gold);
          box-shadow: 0 25px 45px rgba(0, 0, 0, 0.75), 0 0 30px rgba(255, 235, 59, 0.2);
        }

        .bucket.disabled {
          cursor: default;
          pointer-events: none;
        }

        .bucket-lid {
          position: absolute;
          top: 4px;
          width: 92%;
          height: 24px;
          background: linear-gradient(90deg, #7c6823, #bf9f33, #7c6823);
          border-radius: 12px;
          border: 1px solid rgba(255, 235, 59, 0.4);
          box-shadow: inset 0 -4px 6px rgba(0, 0, 0, 0.5), 0 4px 10px rgba(0, 0, 0, 0.5);
          transform-origin: center left;
          transition: transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
          z-index: 3;
        }

        .bucket.reveal .bucket-lid {
          transform: translateY(-28px) rotate(-10deg);
        }

        .bucket-cover {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(20, 16, 5, 0.95) 0%, rgba(10, 8, 2, 0.98) 100%);
          opacity: 1;
          transition: opacity 0.3s ease;
          z-index: 2;
        }

        .bucket.reveal .bucket-cover {
          opacity: 0;
        }

        .bucket-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          opacity: 0;
          transform: translateY(15px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          width: 80%;
          height: 80%;
        }

        .bucket.reveal .bucket-content {
          opacity: 1;
          transform: translateY(0);
        }

        .bucket-icon {
          width: 80%;
          height: 80%;
          max-height: 90px;
          object-fit: cover;
          border-radius: 16px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .bucket-label {
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--gold);
        }

        .result-overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 10, 5, 0.92);
          backdrop-filter: blur(20px);
          border-radius: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px;
          text-align: center;
          z-index: 10;
          box-sizing: border-box;
          animation: fadeIn 0.3s ease forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .result-title {
          font-size: clamp(1.8rem, 4vw, 2.6rem);
          font-weight: 900;
          margin: 0 0 20px;
          text-transform: uppercase;
        }
        
        .result-overlay.win .result-title {
          color: var(--gold);
          text-shadow: 0 0 20px rgba(255, 235, 59, 0.3);
        }

        .result-overlay.lose .result-title {
          color: #f44336;
          text-shadow: 0 0 20px rgba(244, 67, 54, 0.3);
        }

        .result-image-container {
          position: relative;
          margin-bottom: 24px;
        }

        .result-image {
          width: min(280px, 70vw);
          aspect-ratio: 1.1;
          object-fit: cover;
          border-radius: 20px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
          border: 2px solid rgba(255, 255, 255, 0.1);
        }

        .result-overlay.win .result-image {
          border-color: var(--gold);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 235, 59, 0.2);
        }

        .result-overlay.lose .result-image {
          border-color: #f44336;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(244, 67, 54, 0.2);
        }

        .result-subtitle {
          color: var(--text-muted);
          font-size: clamp(0.95rem, 2vw, 1.15rem);
          line-height: 1.5;
          margin: 0 0 28px;
          max-width: 500px;
        }

        .result-button {
          background: var(--gold);
          color: #000000;
          border: none;
          padding: 12px 32px;
          border-radius: 999px;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 8px 24px rgba(255, 235, 59, 0.2);
        }

        .result-button:hover {
          background: var(--gold-hover);
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(255, 235, 59, 0.35);
        }
        
        .menu-back-link {
          display: inline-flex;
          align-items: center;
          margin-top: 24px;
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
          transition: color 0.2s ease;
          gap: 6px;
        }

        .menu-back-link:hover {
          color: var(--gold);
        }
      `}</style>
      <div className="grain" />
      <div className="arena">
        <div className="arena-header">
          <h1 className="arena-title">El juego del pelado</h1>
          <p className="arena-subtitle">Seguí el balde con el pelado feliz antes de que se mezclen.</p>
        </div>

        <div className="status-panel">
          <div className="status-row">
            <span className="status-pulse" />
            <span>{message}</span>
          </div>
          <span className="game-cost-badge">Cuesta: 15% Reserva de Pala</span>
        </div>

        {phase === "idle" && (
          <div className="status-actions">
            <button type="button" className="play-button" onClick={startShuffle}>
              Jugar
            </button>
          </div>
        )}

        <div className="bucket-field">
          <div className="bucket-floor-shadow" />
          {buckets.map((bucket, index) => {
            const slotIndex = slots[index] ?? index;
            const offset = (slotIndex - 1) * slotDistance;
            const icon = bucket.type === "pelado" ? peladoHappySrc : bucketIconByType[bucket.type];
            const label = bucketLabelByType[bucket.type];
            const isReveal = phase === "reveal";

            return (
              <button
                key={bucket.id}
                type="button"
                className={`bucket ${phase !== "choose" ? "disabled" : ""} ${isReveal ? "reveal" : ""}`}
                style={{ left: `calc(50% + ${offset}px)` }}
                onClick={() => handlePick(bucket)}
              >
                <span className="bucket-lid" />
                <div className="bucket-content">
                  {icon ? (
                    <img
                      src={icon}
                      alt={bucket.type === "pelado" ? "Pelado feliz" : "Pala"}
                      className="bucket-icon"
                    />
                  ) : (
                    <span className="bucket-label">{label}</span>
                  )}
                </div>
                <span className="bucket-cover" />
              </button>
            );
          })}
        </div>

        <div style={{ textAlign: "center" }}>
          <a href="/menu" className="menu-back-link">
            <span>←</span> Volver al Menú
          </a>
        </div>

        {result && (
          <div className={`result-overlay ${result}`}>
            <h2 className="result-title">
              {result === "win" ? "¡El pelado está feliz!" : "El pelado está decepcionado"}
            </h2>
            <div className="result-image-container">
              <img
                src={result === "win" ? peladoHappySrc : peladoSadSrc}
                alt={result === "win" ? "Pelado feliz" : "Pelado triste"}
                className="result-image"
              />
            </div>
            <p className="result-subtitle">
              {result === "win"
                ? "Ganaste la preciada mirada del pelado y conservás tu dignidad."
                : "No lograste seguir al pelado. En cinco segundos te vas a laburar."}
            </p>
            {result === "win" && (
              <button type="button" className="result-button" onClick={startShuffle}>
                Jugar de nuevo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
