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
  shovel: "",
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
        setSlotDistance(160);
        return;
      }
      setSlotDistance(210);
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
      ? "Mira bien, ahi esta."
      : phase === "cover"
        ? "Se guardan..."
        : phase === "shuffling"
          ? "Mezclando los baldes..."
          : phase === "choose"
            ? "Donde esta el pelado feliz?"
            : "";

  return (
    <div className="bucket-stage">
      <style>{`
        .bucket-stage {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 15% 20%, #2c1b12 0%, #150b08 35%, #060403 70%, #020202 100%);
          color: #f7f1e3;
          font-family: "Space Grotesk", "Bebas Neue", "Helvetica Neue", sans-serif;
          position: relative;
          overflow: hidden;
          padding: 40px 16px 60px;
        }
        .bucket-stage::before,
        .bucket-stage::after {
          content: "";
          position: absolute;
          width: 380px;
          height: 380px;
          background: radial-gradient(circle, rgba(255, 187, 85, 0.25), rgba(255, 187, 85, 0));
          border-radius: 50%;
          filter: blur(10px);
          z-index: 0;
        }
        .bucket-stage::before {
          top: -140px;
          left: -80px;
        }
        .bucket-stage::after {
          bottom: -160px;
          right: -60px;
        }
        .bucket-stage .grain {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
          background-size: 4px 4px;
          opacity: 0.2;
          pointer-events: none;
          z-index: 0;
        }
        .arena {
          width: min(900px, 100%);
          background: rgba(7, 5, 4, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 28px;
          padding: 28px 22px 40px;
          position: relative;
          z-index: 1;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
        }
        .arena-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .arena-title {
          font-size: clamp(1.8rem, 3vw, 2.8rem);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0 0 8px;
        }
        .arena-subtitle {
          font-size: clamp(0.9rem, 2vw, 1.1rem);
          color: rgba(245, 242, 231, 0.7);
          margin: 0;
        }
        .bucket-field {
          position: relative;
          height: clamp(240px, 38vw, 320px);
          margin: 28px 0 20px;
        }
        .bucket-field::after {
          content: "";
          position: absolute;
          left: 10%;
          right: 10%;
          bottom: 30px;
          height: 10px;
          background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
          opacity: 0.2;
        }
        .bucket {
          position: absolute;
          top: 50%;
          left: 50%;
          width: clamp(130px, 20vw, 170px);
          height: clamp(150px, 22vw, 190px);
          transform: translate(-50%, -50%);
          transition: left 0.35s ease, transform 0.35s ease, box-shadow 0.2s ease;
          background: linear-gradient(180deg, #4e3a2a 0%, #2a1910 100%);
          border-radius: 26px 26px 22px 22px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          box-shadow: 0 18px 35px rgba(0, 0, 0, 0.6);
          cursor: pointer;
          pointer-events: auto;
          user-select: none;
          overflow: hidden;
        }
        .bucket::before {
          content: "";
          position: absolute;
          top: 8px;
          left: 6px;
          right: 6px;
          height: 22px;
          border-radius: 18px;
          background: linear-gradient(90deg, rgba(255, 219, 167, 0.35), rgba(255, 255, 255, 0));
          opacity: 0.6;
          pointer-events: none;
        }
        .bucket::after {
          content: "";
          position: absolute;
          bottom: -26px;
          left: 18px;
          right: 18px;
          height: 32px;
          border-radius: 50%;
          background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5), transparent 70%);
        }
        .bucket:hover {
          transform: translate(-50%, -50%) scale(1.03);
          box-shadow: 0 20px 32px rgba(0, 0, 0, 0.55);
        }
        .bucket.reveal {
          transform: translate(-50%, -58%);
        }
        .bucket.disabled {
          cursor: default;
          pointer-events: none;
          opacity: 0.8;
        }
        .bucket-lid {
          position: absolute;
          top: 4px;
          width: 92%;
          height: 30px;
          background: linear-gradient(90deg, #6b4b34, #9a6a3f);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: inset 0 -6px 8px rgba(0, 0, 0, 0.45);
          transform-origin: center left;
          transition: transform 0.35s ease, opacity 0.35s ease;
        }
        .bucket.reveal .bucket-lid {
          transform: translateY(-22px) rotate(-6deg);
        }
        .bucket-cover {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(17, 10, 7, 0.9) 0%, rgba(7, 4, 3, 0.98) 100%);
          opacity: 1;
          transition: opacity 0.25s ease;
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
          gap: 10px;
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .bucket.reveal .bucket-content {
          opacity: 1;
          transform: translateY(0);
        }
        .bucket-icon {
          width: 70px;
          height: 70px;
          object-fit: cover;
          border-radius: 16px;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.4);
        }
        .bucket-label {
          font-size: 1.1rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .status-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: rgba(245, 242, 231, 0.7);
          font-size: 0.95rem;
          margin-bottom: 10px;
        }
        .status-actions {
          display: flex;
          justify-content: center;
          margin: 12px 0 4px;
        }
        .play-button {
          background: #ffbf3c;
          border: none;
          padding: 10px 26px;
          border-radius: 999px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(255, 191, 60, 0.25);
        }
        .play-button:hover {
          transform: translateY(-1px);
        }
        .status-pulse {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ffbf3c;
          box-shadow: 0 0 12px rgba(255, 191, 60, 0.8);
          animation: pulse 1.2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0.6; }
        }
        .result-overlay {
          position: absolute;
          inset: 0;
          background: rgba(4, 3, 3, 0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 16px;
          text-align: center;
          z-index: 4;
        }
        .result-title {
          font-size: clamp(1.8rem, 3vw, 2.6rem);
          margin: 0 0 16px;
        }
        .result-image {
          width: min(320px, 80vw);
          border-radius: 20px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
          margin-bottom: 18px;
        }
        .result-subtitle {
          color: rgba(245, 242, 231, 0.7);
          margin: 0 0 24px;
        }
        .result-button {
          background: #ffbf3c;
          border: none;
          padding: 12px 24px;
          border-radius: 999px;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
        }
      `}</style>
      <div className="grain" />
      <div className="arena">
        <div className="arena-header">
          <h1 className="arena-title">El juego del pelado</h1>
          <p className="arena-subtitle">Segui el balde con el pelado feliz antes de que se mezclen.</p>
        </div>

        <div className="status-row">
          <span className="status-pulse" />
          <span>{message}</span>
        </div>
        {phase === "idle" && (
          <div className="status-actions">
            <button type="button" className="play-button" onClick={startShuffle}>
              Jugar
            </button>
          </div>
        )}

        <div className="bucket-field">
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

        {result && (
          <div className="result-overlay">
            <h2 className="result-title">
              {result === "win" ? "El pelado esta feliz" : "El pelado esta decepcionado"}
            </h2>
            <img
              src={result === "win" ? peladoHappySrc : peladoSadSrc}
              alt={result === "win" ? "Pelado feliz" : "Pelado triste"}
              className="result-image"
            />
            <p className="result-subtitle">
              {result === "win"
                ? "Ganaste la mirada del pelado."
                : "En cinco segundos te vas a laburar."}
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
