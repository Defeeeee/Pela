"use client"

import { useState, useEffect, useRef } from "react";
import { useSocialCredit } from "../SocialCreditContext";

const UPGRADES_CONFIG = [
  { id: "madera", name: "Pala de Madera", baseCost: 15, increase: 1, desc: "Sencilla pero noble. Auto-genera +1 pala/s.", emoji: "🪵" },
  { id: "acero", name: "Pala de Acero", baseCost: 150, increase: 5, desc: "Forjada en las minas de folículos. Auto-genera +5 pala/s.", emoji: "⚔️" },
  { id: "pasante", name: "Contratar Pasante", baseCost: 1200, increase: 25, desc: "Un becario entusiasta que labura por vos. Auto-genera +25 pala/s.", emoji: "👔" },
  { id: "pela_ai", name: "Pela-AI™ Bot", baseCost: 10000, increase: 150, desc: "Automatización neuronal artificial. Auto-genera +150 pala/s.", emoji: "🤖" },
  { id: "minoxidil", name: "Reactor de Minoxidil", baseCost: 80000, increase: 1000, desc: "Energía pura a base de loción capilar. Auto-genera +1000 pala/s.", emoji: "🌋" },
];

const EXCHANGE_COST = 100;
const EXCHANGE_CREDIT = 10;
const PRESTIGE_THRESHOLD = 100000;

export default function ClickerPage() {
  const { addCredit, credit } = useSocialCredit();
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  
  // Game states
  const [palas, setPalas] = useState(0);
  const [upgrades, setUpgrades] = useState({
    madera: 0,
    acero: 0,
    pasante: 0,
    pela_ai: 0,
    minoxidil: 0,
  });
  
  // Prestige state
  const [brillo, setBrillo] = useState(0); // prestige points (Brillo Capilar)

  // Floating text particles
  const [floatingTexts, setFloatingTexts] = useState([]);
  const shovelRef = useRef(null);

  // Combo multiplier states
  const [combo, setCombo] = useState(0);
  const lastClickTimeRef = useRef(0);

  // Flying Pelado state
  const [flyingPelado, setFlyingPelado] = useState(null);

  // Buff state
  const [buff, setBuff] = useState(null); // { type, name, multiplier, endTime }
  const [buffMessage, setBuffMessage] = useState("");

  // Achievements state
  const [achievements, setAchievements] = useState({
    first_upgrade: false,
    negrero: false,
    gold_click: false,
    first_prestige: false,
  });

  // Load game from local storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPalas = localStorage.getItem("clicker_palas_v2");
      const savedUpgrades = localStorage.getItem("clicker_upgrades_v2");
      const savedBrillo = localStorage.getItem("clicker_brillo_v2");
      const savedAchievements = localStorage.getItem("clicker_achievements_v2");

      if (savedPalas !== null) setPalas(parseFloat(savedPalas));
      if (savedBrillo !== null) setBrillo(parseInt(savedBrillo, 10));
      
      if (savedUpgrades !== null) {
        try {
          setUpgrades(JSON.parse(savedUpgrades));
        } catch (e) {
          console.error("Error loading upgrades", e);
        }
      }

      if (savedAchievements !== null) {
        try {
          setAchievements(JSON.parse(savedAchievements));
        } catch (e) {
          console.error("Error loading achievements", e);
        }
      }

      setIsClientLoaded(true);
    }
  }, []);

  // Save game to local storage
  useEffect(() => {
    if (isClientLoaded) {
      localStorage.setItem("clicker_palas_v2", palas.toString());
      localStorage.setItem("clicker_upgrades_v2", JSON.stringify(upgrades));
      localStorage.setItem("clicker_brillo_v2", brillo.toString());
      localStorage.setItem("clicker_achievements_v2", JSON.stringify(achievements));
    }
  }, [palas, upgrades, brillo, achievements, isClientLoaded]);

  // Compute Base Palas Per Second (PPS)
  const basePPS = Object.keys(upgrades).reduce((total, id) => {
    const config = UPGRADES_CONFIG.find((u) => u.id === id);
    return total + (upgrades[id] || 0) * (config ? config.increase : 0);
  }, 0);

  // Apply Prestige and Buff multipliers to PPS
  const prestigeMultiplier = 1 + brillo * 0.12; // +12% per prestige point
  const buffPPSMultiplier = buff && buff.type === "hype" ? buff.multiplier : 1;
  const palasPerSecond = basePPS * prestigeMultiplier * buffPPSMultiplier;

  // Auto-generation loop (updates 10 times per second)
  useEffect(() => {
    if (!isClientLoaded || palasPerSecond <= 0) return;

    const interval = setInterval(() => {
      setPalas((prev) => prev + palasPerSecond / 10);
    }, 100);

    return () => clearInterval(interval);
  }, [palasPerSecond, isClientLoaded]);

  // Combo decay loop (decays combo level over time)
  useEffect(() => {
    if (!isClientLoaded) return;

    const interval = setInterval(() => {
      setCombo((prev) => Math.max(0, prev - 4));
    }, 100);

    return () => clearInterval(interval);
  }, [isClientLoaded]);

  // Check achievements dynamically
  useEffect(() => {
    if (!isClientLoaded) return;

    const hasUpgrade = Object.values(upgrades).some((count) => count > 0);
    const hasNegrero = upgrades.pasante >= 10;
    const hasPrestige = brillo > 0;

    let updated = false;
    const newAchievements = { ...achievements };

    if (hasUpgrade && !achievements.first_upgrade) {
      newAchievements.first_upgrade = true;
      updated = true;
    }
    if (hasNegrero && !achievements.negrero) {
      newAchievements.negrero = true;
      updated = true;
    }
    if (hasPrestige && !achievements.first_prestige) {
      newAchievements.first_prestige = true;
      updated = true;
    }

    if (updated) {
      setAchievements(newAchievements);
      triggerFlashMessage("¡Logro Desbloqueado! 🏆");
    }
  }, [upgrades, brillo, isClientLoaded]);

  // Check buff expiration
  useEffect(() => {
    if (!buff) return;
    const checkInterval = setInterval(() => {
      if (Date.now() > buff.endTime) {
        setBuff(null);
        triggerFlashMessage("El efecto del buff ha terminado.");
      }
    }, 500);
    return () => clearInterval(checkInterval);
  }, [buff]);

  // Flying Pelado spawn logic
  useEffect(() => {
    if (!isClientLoaded) return;

    const spawnInterval = setInterval(() => {
      if (flyingPelado) return; // Only one flying pelado at a time

      // 4% chance to spawn every 10 seconds
      if (Math.random() < 0.25) {
        const side = Math.random() < 0.5 ? "left" : "right";
        const startX = side === "left" ? -100 : window.innerWidth + 10;
        const startY = Math.random() * (window.innerHeight - 200) + 100;
        const speedX = side === "left" ? Math.random() * 2 + 1.5 : -(Math.random() * 2 + 1.5);
        const speedY = (Math.random() - 0.5) * 1.5;

        setFlyingPelado({
          id: Date.now(),
          x: startX,
          y: startY,
          vx: speedX,
          vy: speedY,
          size: 70,
        });
      }
    }, 10000);

    return () => clearInterval(spawnInterval);
  }, [flyingPelado, isClientLoaded]);

  // Flying Pelado physics loop
  useEffect(() => {
    if (!flyingPelado) return;

    const physicsInterval = setInterval(() => {
      setFlyingPelado((prev) => {
        if (!prev) return null;
        const newX = prev.x + prev.vx;
        const newY = prev.y + prev.vy;

        // Check if out of bounds
        if (
          (prev.vx > 0 && newX > window.innerWidth + 150) ||
          (prev.vx < 0 && newX < -150) ||
          newY < -150 ||
          newY > window.innerHeight + 150
        ) {
          return null;
        }

        return { ...prev, x: newX, y: newY };
      });
    }, 30);

    return () => clearInterval(physicsInterval);
  }, [flyingPelado]);

  // Trigger floating/banner notifications
  const triggerFlashMessage = (msg) => {
    setBuffMessage(msg);
    setTimeout(() => {
      setBuffMessage("");
    }, 4000);
  };

  // Combo calculation
  const getComboMultiplier = () => {
    if (combo >= 90) return 3.0;
    if (combo >= 50) return 2.0;
    if (combo >= 20) return 1.5;
    return 1.0;
  };

  const comboMultiplier = getComboMultiplier();

  // Click power calculation (increases with prestige and fever buff)
  const baseClickPower = 1;
  const buffClickMultiplier = buff && buff.type === "fever" ? buff.multiplier : 1;
  const clickPower = baseClickPower * prestigeMultiplier * comboMultiplier * buffClickMultiplier;

  // Handle clicking the flying pelado
  const handleFlyingPeladoClick = (e) => {
    e.stopPropagation();
    if (!flyingPelado) return;

    const rewards = [
      { type: "fever", name: "Fiebre Argumentativa (Click x7)", multiplier: 7, duration: 15000 },
      { type: "hype", name: "Hiper-Laburo (PPS x2)", multiplier: 2, duration: 25000 },
      { type: "rain", name: "Lluvia de Palas" },
    ];

    const chosen = rewards[Math.floor(Math.random() * rewards.length)];
    
    if (chosen.type === "rain") {
      const award = Math.max(50, Math.floor(palasPerSecond * 45));
      setPalas((prev) => prev + award);
      triggerFlashMessage(`¡Lluvia de Palas! Ganaste +${award.toLocaleString()} palas inmediatamente.`);
    } else {
      setBuff({
        type: chosen.type,
        name: chosen.name,
        multiplier: chosen.multiplier,
        endTime: Date.now() + chosen.duration,
      });
      triggerFlashMessage(`¡Buff Activado! ${chosen.name} por ${chosen.duration / 1000}s.`);
    }

    // Set gold click achievement
    if (!achievements.gold_click) {
      setAchievements((prev) => ({ ...prev, gold_click: true }));
    }

    setFlyingPelado(null);
  };

  // Main shovel click handler
  const handleShovelClick = (e) => {
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

    // Add click combo points
    const now = Date.now();
    const delay = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;
    
    // Increment combo if clicked reasonably fast (under 400ms delay)
    if (delay < 400) {
      setCombo((prev) => Math.min(100, prev + 8));
    } else {
      setCombo((prev) => Math.min(100, prev + 4));
    }

    // Add Palas
    setPalas((prev) => prev + clickPower);

    // Spawn floating particle
    const roundedPower = parseFloat(clickPower.toFixed(1));
    const newText = {
      id: Date.now() + Math.random(),
      text: `+${roundedPower}`,
      x: clickX,
      y: clickY,
      color: buff && buff.type === "fever" ? "#ff3b3b" : combo >= 50 ? "#ffeb3b" : "#ffffff",
    };

    setFloatingTexts((prev) => [...prev, newText]);

    // Clean up text particle after animation ends
    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((t) => t.id !== newText.id));
    }, 900);
  };

  // Get current cost of an upgrade
  const getUpgradeCost = (id) => {
    const config = UPGRADES_CONFIG.find((u) => u.id === id);
    if (!config) return 999999;
    const count = upgrades[id] || 0;
    // Scale upgrade cost exponentially
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

  // Execute Prestige (La Gran Pelada)
  const executePrestige = () => {
    if (palas >= PRESTIGE_THRESHOLD) {
      const earnedShine = Math.floor(palas / PRESTIGE_THRESHOLD);
      setBrillo((prev) => prev + earnedShine);
      setPalas(0);
      setUpgrades({
        madera: 0,
        acero: 0,
        pasante: 0,
        pela_ai: 0,
        minoxidil: 0,
      });
      setCombo(0);
      setBuff(null);
      triggerFlashMessage(`¡Hiciste la Gran Pelada! Ganaste +${earnedShine} de Brillo Capilar.`);
    }
  };

  // Canjear Palas for global credit
  const handleExchange = () => {
    if (palas >= EXCHANGE_COST) {
      setPalas((prev) => prev - EXCHANGE_COST);
      addCredit(EXCHANGE_CREDIT);
    }
  };

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
          padding: 40px 20px;
          box-sizing: border-box;
        }

        .clicker-content {
          width: 100%;
          max-width: 1100px;
          background: var(--card-bg);
          border: 1px solid var(--card-border-gold);
          border-radius: 28px;
          padding: 36px;
          backdrop-filter: blur(16px);
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 235, 59, 0.03);
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 36px;
          box-sizing: border-box;
        }

        @media (max-width: 900px) {
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
          text-align: center;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          padding-right: 20px;
        }

        @media (max-width: 900px) {
          .clicker-left {
            border-right: none;
            padding-right: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding-bottom: 28px;
          }
        }

        .clicker-title-area {
          margin-bottom: 20px;
        }

        .clicker-title {
          font-size: clamp(2rem, 4vw, 2.8rem);
          font-weight: 900;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          margin: 0 0 4px;
          background: linear-gradient(135deg, #ffffff 40%, var(--gold) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .prestige-badge {
          background: linear-gradient(90deg, #ffc107, #ffeb3b);
          color: #000;
          padding: 3px 12px;
          border-radius: 99px;
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          box-shadow: 0 0 15px rgba(255, 235, 59, 0.35);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .counter-box {
          margin-bottom: 16px;
        }

        .counter-num {
          font-size: clamp(3rem, 6vw, 4.2rem);
          font-weight: 900;
          font-family: monospace;
          color: var(--gold);
          text-shadow: 0 0 20px rgba(255, 235, 59, 0.3);
          line-height: 1.1;
          margin-bottom: 2px;
        }

        .counter-pps {
          font-size: 0.95rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        /* Combo styles */
        .combo-container {
          width: 240px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .combo-header {
          display: flex;
          justify-content: space-between;
          width: 100%;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .combo-bar-bg {
          width: 100%;
          height: 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 99px;
          overflow: hidden;
          position: relative;
        }

        .combo-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #ffc107, #ffeb3b);
          box-shadow: 0 0 8px var(--gold);
          transition: width 0.1s linear;
        }

        .combo-badge {
          background: rgba(255, 235, 59, 0.2);
          border: 1px solid var(--gold);
          color: var(--gold);
          font-size: 0.75rem;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 4px;
        }

        .shovel-wrapper {
          position: relative;
          width: 230px;
          height: 230px;
          margin-bottom: 24px;
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

        /* Flying Pelado style */
        .flying-pelado {
          position: fixed;
          cursor: pointer;
          z-index: 99999;
          user-select: none;
          transition: transform 0.1s;
        }

        .flying-pelado:hover {
          transform: scale(1.15);
        }

        .flying-pelado-img {
          border-radius: 50%;
          border: 3px solid var(--gold);
          box-shadow: 0 0 25px var(--gold), 0 10px 30px rgba(0, 0, 0, 0.8);
          animation: spin-slow 8s linear infinite;
        }

        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .float-text {
          position: absolute;
          font-size: 1.5rem;
          font-weight: 900;
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
            transform: translate(-50%, -150px) scale(0.85);
          }
        }

        /* Banner alerts */
        .notification-banner {
          position: fixed;
          top: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(20, 20, 5, 0.9);
          border: 2px solid var(--gold);
          border-radius: 12px;
          padding: 12px 28px;
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 235, 59, 0.2);
          z-index: 100000;
          color: #fff;
          font-weight: 700;
          text-align: center;
          backdrop-filter: blur(12px);
          animation: slideDown 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        @keyframes slideDown {
          from { transform: translate(-50%, -80px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }

        /* Active buff indicator */
        .buff-indicator {
          background: rgba(255, 235, 59, 0.08);
          border: 1px solid var(--gold);
          border-radius: 12px;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--gold);
          margin-bottom: 20px;
          box-shadow: 0 0 15px rgba(255, 235, 59, 0.1);
        }

        .buff-pulse {
          width: 8px;
          height: 8px;
          background: #4caf50;
          border-radius: 50%;
          animation: pulse-green 1s infinite alternate;
        }

        @keyframes pulse-green {
          from { opacity: 0.4; }
          to { opacity: 1; box-shadow: 0 0 8px #4caf50; }
        }

        /* Prestige and exchange panel */
        .action-panels-row {
          display: flex;
          gap: 16px;
          width: 100%;
          justify-content: center;
          margin-top: 10px;
        }

        @media (max-width: 500px) {
          .action-panels-row {
            flex-direction: column;
            align-items: center;
          }
        }

        .action-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          padding: 16px;
          flex: 1;
          max-width: 240px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
        }

        .action-card.gold-themed {
          border-color: rgba(255, 235, 59, 0.12);
          background: rgba(255, 235, 59, 0.02);
        }

        .action-card-title {
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #ffffff;
        }

        .action-card.gold-themed .action-card-title {
          color: var(--gold);
        }

        .action-card-text {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.45;
          margin: 0;
          flex: 1;
        }

        .action-btn {
          width: 100%;
          border: none;
          padding: 10px;
          border-radius: 12px;
          font-weight: 750;
          font-size: 0.8rem;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.02em;
        }

        .action-btn.gold-fill {
          background: var(--gold);
          color: #000;
        }

        .action-btn.gold-fill:hover:not(:disabled) {
          background: var(--gold-hover);
          transform: translateY(-1px);
        }

        .action-btn.gold-outline {
          background: transparent;
          border: 1px solid var(--gold);
          color: var(--gold);
        }

        .action-btn.gold-outline:hover:not(:disabled) {
          background: rgba(255, 235, 59, 0.1);
          transform: translateY(-1px);
        }

        .action-btn:disabled {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.02);
          cursor: not-allowed;
        }

        /* Clicker Right Layout */
        .clicker-right {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .upgrades-container {
          max-height: 380px;
          overflow-y: auto;
          padding-right: 6px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .upgrades-container::-webkit-scrollbar {
          width: 6px;
        }

        .upgrades-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .upgrades-container::-webkit-scrollbar-thumb {
          background: rgba(255, 235, 59, 0.15);
          border-radius: 99px;
        }

        .upgrades-container::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 235, 59, 0.3);
        }

        .upgrade-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          transition: all 0.2s ease;
        }

        .upgrade-card:hover:not(.disabled) {
          border-color: rgba(255, 235, 59, 0.2);
          background: rgba(255, 235, 59, 0.02);
        }

        .upgrade-info {
          display: flex;
          gap: 12px;
          align-items: center;
          flex: 1;
        }

        .upgrade-emoji {
          font-size: 1.5rem;
          background: rgba(255, 255, 255, 0.03);
          width: 40px;
          height: 40px;
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
          font-size: 0.9rem;
          font-weight: 700;
          color: #fff;
          margin: 0 0 2px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .upgrade-count-badge {
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 6px;
          border-radius: 99px;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--gold);
        }

        .upgrade-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.35;
          margin: 0;
        }

        .upgrade-buy-btn {
          background: rgba(255, 235, 59, 0.08);
          border: 1px solid rgba(255, 235, 59, 0.2);
          color: var(--gold);
          padding: 8px 12px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.82rem;
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
          opacity: 0.45;
          cursor: not-allowed;
          border-color: rgba(255, 255, 255, 0.08);
          color: var(--text-muted);
          background: transparent;
        }

        .upgrade-cost-label {
          font-size: 0.65rem;
          font-weight: 500;
          opacity: 0.8;
          margin-top: 1px;
          text-transform: uppercase;
        }

        /* Achievements Box */
        .achievements-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          padding: 16px;
          margin-top: 6px;
        }

        .achievements-title {
          font-size: 0.9rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
          color: var(--text-muted);
        }

        .achievements-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .achievement-badge {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 8px 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.76rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.4);
          transition: all 0.3s ease;
        }

        .achievement-badge.unlocked {
          background: rgba(255, 235, 59, 0.05);
          border-color: rgba(255, 235, 59, 0.2);
          color: #ffffff;
          box-shadow: inset 0 0 10px rgba(255, 235, 59, 0.03);
        }

        .achievement-badge.unlocked .achievement-star {
          color: var(--gold);
          text-shadow: 0 0 5px var(--gold);
        }

        .achievement-star {
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.15);
        }

        .back-link-container {
          grid-column: span 2;
          text-align: center;
          margin-top: 10px;
        }

        @media (max-width: 900px) {
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

      {/* Floating notification banner */}
      {buffMessage && (
        <div className="notification-banner">
          {buffMessage}
        </div>
      )}

      {/* Golden Click Flying Pelado */}
      {flyingPelado && (
        <div
          className="flying-pelado"
          style={{
            left: `${flyingPelado.x}px`,
            top: `${flyingPelado.y}px`,
            width: `${flyingPelado.size}px`,
            height: `${flyingPelado.size}px`,
          }}
          onClick={handleFlyingPeladoClick}
        >
          <img
            src="/imgs/goat/Pelado Feliz.jpeg"
            alt="Golden Pelado"
            className="flying-pelado-img"
            style={{
              width: `${flyingPelado.size}px`,
              height: `${flyingPelado.size}px`,
              objectFit: "cover",
            }}
          />
        </div>
      )}

      <div className="clicker-content">
        <div className="clicker-left">
          <div className="clicker-title-area">
            <h1 className="clicker-title">Pala Clicker</h1>
            {brillo > 0 && (
              <div className="prestige-badge">
                <span>✨</span> Brillo Capilar +{brillo}
              </div>
            )}
          </div>

          <div className="counter-box">
            <div className="counter-num">{Math.floor(palas).toLocaleString()}</div>
            <div className="counter-pps">Auto: {palasPerSecond.toLocaleString(undefined, { maximumFractionDigits: 1 })} palas/s</div>
          </div>

          {/* Active Buff Indicator */}
          {buff && (
            <div className="buff-indicator">
              <span className="buff-pulse" />
              <span>{buff.name} ({Math.max(0, Math.ceil((buff.endTime - Date.now()) / 1000))}s)</span>
            </div>
          )}

          {/* Click Combo bar */}
          <div className="combo-container">
            <div className="combo-header">
              <span>Velocidad de Click</span>
              <span className="combo-badge">{comboMultiplier.toFixed(1)}x Combo</span>
            </div>
            <div className="combo-bar-bg">
              <div className="combo-bar-fill" style={{ width: `${combo}%` }} />
            </div>
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
                style={{ left: `${txt.x}px`, top: `${txt.y}px`, color: txt.color }}
              >
                {txt.text}
              </span>
            ))}
          </div>

          <div className="action-panels-row">
            {/* Canjear panel */}
            <div className="action-card">
              <div className="action-card-title">Canjear Crédito</div>
              <p className="action-card-text">
                Cambia {EXCHANGE_COST} palas por +{EXCHANGE_CREDIT}% de tu Reserva de Pala global.
              </p>
              <button
                className="action-btn gold-fill"
                disabled={palas < EXCHANGE_COST || credit >= 100}
                onClick={handleExchange}
                type="button"
              >
                {credit >= 100 ? "Máximo" : "Canjear"}
              </button>
            </div>

            {/* Prestige panel */}
            <div className="action-card gold-themed">
              <div className="action-card-title">Hacer la Gran Pelada</div>
              <p className="action-card-text">
                Reinicia tu juego a cambio de Brillo Capilar. Requiere {PRESTIGE_THRESHOLD.toLocaleString()} palas.
              </p>
              <button
                className="action-btn gold-outline"
                disabled={palas < PRESTIGE_THRESHOLD}
                onClick={executePrestige}
                type="button"
              >
                Prestigio (+{Math.floor(palas / PRESTIGE_THRESHOLD)})
              </button>
            </div>
          </div>
        </div>

        <div className="clicker-right">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", margin: "0" }}>
            Upgrades de Laburo
          </h2>

          <div className="upgrades-container">
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

          {/* Achievements list */}
          <div className="achievements-box">
            <div className="achievements-title">Logros Laborales</div>
            <div className="achievements-list">
              <div className={`achievement-badge ${achievements.first_upgrade ? "unlocked" : ""}`}>
                <span className="achievement-star">★</span>
                <span>Primer Contrato</span>
              </div>
              <div className={`achievement-badge ${achievements.negrero ? "unlocked" : ""}`}>
                <span className="achievement-star">★</span>
                <span>Jefe Negrero</span>
              </div>
              <div className={`achievement-badge ${achievements.gold_click ? "unlocked" : ""}`}>
                <span className="achievement-star">★</span>
                <span>Fiebre del Pelado</span>
              </div>
              <div className={`achievement-badge ${achievements.first_prestige ? "unlocked" : ""}`}>
                <span className="achievement-star">★</span>
                <span>Brillo Inmortal</span>
              </div>
            </div>
          </div>
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
