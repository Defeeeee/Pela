"use client"

import { useState, useEffect, useRef, useCallback } from "react";
import { useSocialCredit } from "../SocialCreditContext";

const UPGRADES_CONFIG = [
  { id: "madera", name: "Pala de Madera", baseCost: 15, increase: 1, desc: "Sencilla pero noble. Auto-genera +1 pala/s.", emoji: "🪵" },
  { id: "acero", name: "Pala de Acero", baseCost: 100, increase: 5, desc: "Forjada en las minas de folículos. Auto-genera +5 pala/s.", emoji: "⚔️" },
  { id: "pasante", name: "Contratar Pasante", baseCost: 500, increase: 25, desc: "Un becario entusiasta que labura por vos. Auto-genera +25 pala/s.", emoji: "👔" },
  { id: "pela_ai", name: "Pela-AI™ Bot", baseCost: 3000, increase: 150, desc: "Automatización neuronal artificial. Auto-genera +150 pala/s.", emoji: "🤖" },
  { id: "minoxidil", name: "Reactor de Minoxidil", baseCost: 20000, increase: 1000, desc: "Energía pura a base de loción capilar. Auto-genera +1000 pala/s.", emoji: "🌋" },
];

const EXCHANGE_COST = 100;
const EXCHANGE_CREDIT = 10;

export default function ClickerPage() {
  const { addCredit, credit } = useSocialCredit();
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [palas, setPalas] = useState(0);
  const [upgrades, setUpgrades] = useState({
    madera: 0,
    acero: 0,
    pasante: 0,
    pela_ai: 0,
    minoxidil: 0,
  });

  const [floatingTexts, setFloatingTexts] = useState([]);
  const shovelRef = useRef(null);

  // Load from localStorage on mount (prevents SSR hydration issues)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPalas = localStorage.getItem("clicker_palas");
      const savedUpgrades = localStorage.getItem("clicker_upgrades");

      if (savedPalas !== null) setPalas(parseFloat(savedPalas));
      if (savedUpgrades !== null) {
        try {
          setUpgrades(JSON.parse(savedUpgrades));
        } catch (e) {
          console.error("Error loading upgrades", e);
        }
      }
      setIsClientLoaded(true);
    }
  }, []);

  // Save to localStorage whenever states change
  useEffect(() => {
    if (isClientLoaded) {
      localStorage.setItem("clicker_palas", palas.toString());
      localStorage.setItem("clicker_upgrades", JSON.stringify(upgrades));
    }
  }, [palas, upgrades, isClientLoaded]);

  // Compute Palas Per Second (PPS)
  const palasPerSecond = Object.keys(upgrades).reduce((total, id) => {
    const config = UPGRADES_CONFIG.find((u) => u.id === id);
    return total + (upgrades[id] || 0) * (config ? config.increase : 0);
  }, 0);

  // Auto-generation timer
  useEffect(() => {
    if (!isClientLoaded || palasPerSecond <= 0) return;

    const interval = setInterval(() => {
      setPalas((prev) => prev + palasPerSecond / 10);
    }, 100);

    return () => clearInterval(interval);
  }, [palasPerSecond, isClientLoaded]);

  // Handle click on shovel
  const handleShovelClick = (e) => {
    // Determine click position relative to shovel container
    let clickX = 0;
    let clickY = 0;

    if (e && shovelRef.current) {
      const rect = shovelRef.current.getBoundingClientRect();
      clickX = e.clientX - rect.left;
      clickY = e.clientY - rect.top;
    } else {
      clickX = 100 + Math.random() * 50;
      clickY = 100 + Math.random() * 50;
    }

    // Add pala
    setPalas((prev) => prev + 1);

    // Spawn floating text
    const newText = {
      id: Date.now() + Math.random(),
      text: "+1",
      x: clickX,
      y: clickY,
    };

    setFloatingTexts((prev) => [...prev, newText]);

    // Clean up floating text after 1s
    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((t) => t.id !== newText.id));
    }, 900);
  };

  // Get current cost of an upgrade
  const getUpgradeCost = (id) => {
    const config = UPGRADES_CONFIG.find((u) => u.id === id);
    if (!config) return 999999;
    const count = upgrades[id] || 0;
    return Math.floor(config.baseCost * Math.pow(1.15, count));
  };

  // Buy upgrade
  const buyUpgrade = (id) => {
    const cost = getUpgradeCost(id);
    if (palas >= cost) {
      setPalas((prev) => prev - cost);
      setUpgrades((prev) => ({
        ...prev,
        [id]: (prev[id] || 0) + 1,
      }));
    }
  };

  // Canjear Palas for global credit
  const handleExchange = () => {
    if (palas >= EXCHANGE_COST) {
      setPalas((prev) => prev - EXCHANGE_COST);
      addCredit(EXCHANGE_CREDIT);
    }
  };

  if (!isClientLoaded) {
    return (
      <div className="clicker-loading">
        Cargando pala clicker...
        <style>{`
          .clicker-loading {
            min-height: 100vh;
            background: #000;
            color: #ffeb3b;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            font-family: monospace;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="clicker-stage">
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

        .clicker-stage {
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

        .clicker-content {
          width: 100%;
          max-width: 1000px;
          background: var(--card-bg);
          border: 1px solid var(--card-border-gold);
          border-radius: 28px;
          padding: 36px;
          backdrop-filter: blur(16px);
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 235, 59, 0.03);
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 36px;
          box-sizing: border-box;
        }

        @media (max-width: 820px) {
          .clicker-content {
            grid-template-columns: 1fr;
            padding: 24px;
            gap: 28px;
          }
        }

        .clicker-left {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          padding-right: 20px;
        }

        @media (max-width: 820px) {
          .clicker-left {
            border-right: none;
            padding-right: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding-bottom: 28px;
          }
        }

        .clicker-title {
          font-size: clamp(2rem, 4vw, 2.8rem);
          font-weight: 900;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          margin: 0 0 6px;
          background: linear-gradient(135deg, #ffffff 40%, var(--gold) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .clicker-subtitle {
          font-size: 0.95rem;
          color: var(--text-muted);
          margin: 0 0 30px;
        }

        .counter-box {
          margin-bottom: 24px;
        }

        .counter-num {
          font-size: 3.5rem;
          font-weight: 900;
          font-family: monospace;
          color: var(--gold);
          text-shadow: 0 0 20px rgba(255, 235, 59, 0.3);
          line-height: 1;
          margin-bottom: 4px;
        }

        .counter-pps {
          font-size: 0.95rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .shovel-wrapper {
          position: relative;
          width: 240px;
          height: 240px;
          margin: 20px 0 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .shovel-button {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          outline: none;
          width: 200px;
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 235, 59, 0.08) 0%, transparent 70%);
          transition: all 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          position: relative;
        }

        .shovel-button::after {
          content: "";
          position: absolute;
          inset: 10px;
          border-radius: 50%;
          border: 1px solid rgba(255, 235, 59, 0.1);
          box-shadow: 0 0 20px rgba(255, 235, 59, 0.03);
          pointer-events: none;
          transition: border-color 0.3s;
        }

        .shovel-button:hover::after {
          border-color: rgba(255, 235, 59, 0.25);
        }

        .shovel-image {
          width: 140px;
          height: 140px;
          object-fit: cover;
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          border: 2px solid rgba(255, 235, 59, 0.3);
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          transform: rotate(-15deg);
        }

        .shovel-button:hover .shovel-image {
          transform: scale(1.08) rotate(-10deg);
          border-color: var(--gold);
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 235, 59, 0.15);
        }

        .shovel-button:active .shovel-image {
          transform: scale(0.94) rotate(-20deg);
        }

        .float-text {
          position: absolute;
          font-size: 1.5rem;
          font-weight: 900;
          color: var(--gold);
          text-shadow: 0 0 10px rgba(255, 235, 59, 0.8), 0 2px 4px #000;
          pointer-events: none;
          animation: floatUp 0.9s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          z-index: 10;
        }

        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -150px) scale(0.8);
          }
        }

        .exchange-panel {
          background: rgba(255, 235, 59, 0.03);
          border: 1px solid rgba(255, 235, 59, 0.1);
          border-radius: 20px;
          padding: 16px;
          width: 100%;
          max-width: 320px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .exchange-text {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        .exchange-button {
          background: var(--gold);
          color: #000;
          border: none;
          padding: 10px 20px;
          border-radius: 99px;
          font-weight: 700;
          font-size: 0.85rem;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
        }

        .exchange-button:hover:not(:disabled) {
          background: var(--gold-hover);
          transform: translateY(-1px);
        }

        .exchange-button:disabled {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          cursor: not-allowed;
        }

        .clicker-right {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 480px;
          overflow-y: auto;
          padding-right: 6px;
        }

        .clicker-right::-webkit-scrollbar {
          width: 6px;
        }

        .clicker-right::-webkit-scrollbar-track {
          background: transparent;
        }

        .clicker-right::-webkit-scrollbar-thumb {
          background: rgba(255, 235, 59, 0.15);
          border-radius: 99px;
        }

        .clicker-right::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 235, 59, 0.3);
        }

        .upgrade-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          transition: all 0.2s ease;
        }

        .upgrade-card:hover:not(.disabled) {
          border-color: rgba(255, 235, 59, 0.2);
          background: rgba(255, 235, 59, 0.02);
        }

        .upgrade-info {
          display: flex;
          gap: 14px;
          align-items: center;
          flex: 1;
        }

        .upgrade-emoji {
          font-size: 1.6rem;
          background: rgba(255, 255, 255, 0.03);
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .upgrade-details {
          display: flex;
          flex-direction: column;
        }

        .upgrade-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .upgrade-count-badge {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 8px;
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--gold);
        }

        .upgrade-desc {
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 1.3;
        }

        .upgrade-buy-btn {
          background: rgba(255, 235, 59, 0.1);
          border: 1px solid rgba(255, 235, 59, 0.25);
          color: var(--gold);
          padding: 8px 16px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 80px;
        }

        .upgrade-buy-btn:hover:not(:disabled) {
          background: var(--gold);
          color: #000;
          transform: translateY(-1px);
        }

        .upgrade-buy-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          border-color: rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
          background: transparent;
        }

        .upgrade-cost-label {
          font-size: 0.7rem;
          font-weight: 500;
          opacity: 0.8;
          margin-top: 1px;
          text-transform: uppercase;
        }

        .back-link-container {
          grid-column: span 2;
          text-align: center;
          margin-top: 10px;
        }

        @media (max-width: 820px) {
          .back-link-container {
            grid-column: span 1;
          }
        }

        .menu-back-link {
          display: inline-flex;
          align-items: center;
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

      <div className="clicker-content">
        <div className="clicker-left">
          <h1 className="clicker-title">Pala Clicker</h1>
          <p className="clicker-subtitle">Laburá haciendo clicks y canjealos por Reserva de Pala.</p>

          <div className="counter-box">
            <div className="counter-num">{Math.floor(palas).toLocaleString()}</div>
            <div className="counter-pps">Auto: {palasPerSecond.toFixed(1)} palas/s</div>
          </div>

          <div className="shovel-wrapper">
            <button
              ref={shovelRef}
              className="shovel-button"
              onClick={handleShovelClick}
              type="button"
            >
              <img src="/imgs/labura/shovel.jpeg" alt="Pala" className="shovel-image" />
            </button>

            {floatingTexts.map((txt) => (
              <span
                key={txt.id}
                className="float-text"
                style={{ left: `${txt.x}px`, top: `${txt.y}px` }}
              >
                {txt.text}
              </span>
            ))}
          </div>

          <div className="exchange-panel">
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Canjear Reserva de Pala
            </div>
            <div className="exchange-text">
              Consumí {EXCHANGE_COST} palas de laburo para recargar +{EXCHANGE_CREDIT}% de tu Reserva de Pala global.
            </div>
            <button
              className="exchange-button"
              disabled={palas < EXCHANGE_COST || credit >= 100}
              onClick={handleExchange}
              type="button"
            >
              {credit >= 100 ? "Reserva al máximo" : `Canjear (${EXCHANGE_COST} palas)`}
            </button>
          </div>
        </div>

        <div className="clicker-right">
          <h2 style={{ fontSize: "1.2rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", margin: "0 0 10px 0" }}>
            Upgrades de Laburo
          </h2>

          {UPGRADES_CONFIG.map((upgrade) => {
            const cost = getUpgradeCost(upgrade.id);
            const count = upgrades[upgrade.id] || 0;
            const canAfford = palas >= cost;

            return (
              <div
                key={upgrade.id}
                className={`upgrade-card ${!canAfford ? "disabled" : ""}`}
              >
                <div className="upgrade-info">
                  <div className="upgrade-emoji">{upgrade.emoji}</div>
                  <div className="upgrade-details">
                    <h3 className="upgrade-title">
                      <span>{upgrade.name}</span>
                      {count > 0 && (
                        <span className="upgrade-count-badge">x{count}</span>
                      )}
                    </h3>
                    <p className="upgrade-desc">{upgrade.desc}</p>
                  </div>
                </div>

                <button
                  className="upgrade-buy-btn"
                  disabled={!canAfford}
                  onClick={() => buyUpgrade(upgrade.id)}
                  type="button"
                >
                  <span>{cost.toLocaleString()}</span>
                  <span className="upgrade-cost-label">Palas</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="back-link-container">
          <a href="/menu" className="menu-back-link">
            <span>←</span> Volver al Menú
          </a>
        </div>
      </div>
    </div>
  );
}
