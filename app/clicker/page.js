"use client"

import { useState, useEffect, useRef } from "react";
import { useSocialCredit } from "../SocialCreditContext";

const UPGRADES_CONFIG = [
  { id: "madera", name: "Pala de Madera", baseCost: 15, increase: 1, desc: "Sencilla pero noble. Auto-genera +1 pala/s.", emoji: "🪵" },
  { id: "acero", name: "Pala de Acero", baseCost: 150, increase: 5, desc: "Forjada en las minas de folículos. Auto-genera +5 pala/s.", emoji: "⚔️" },
  { id: "pasante", name: "Contratar Pasante", baseCost: 1200, increase: 25, desc: "Un becario entusiasta que labura por vos. Auto-genera +25 pala/s.", emoji: "👔" },
  { id: "union_delegate", name: "Delegado Sindical", baseCost: 15000, increase: 0, desc: "Sindicato de la Pala. Aumenta la producción pasiva un 25%, pero habilita huelgas aleatorias.", emoji: "🪧" },
  { id: "pela_ai", name: "Pela-AI™ Bot", baseCost: 10000, increase: 150, desc: "Automatización neuronal artificial. Auto-genera +150 pala/s.", emoji: "🤖" },
  { id: "minoxidil", name: "Reactor de Minoxidil", baseCost: 80000, increase: 1000, desc: "Energía pura a base de loción capilar. Auto-genera +1000 pala/s.", emoji: "🌋" },
  { id: "clonacion", name: "Clonación de Pelados", baseCost: 1000000, increase: 15000, desc: "Bio-ingeniería capilar a gran escala. Auto-genera +15k pala/s.", emoji: "👥" },
  { id: "sonda", name: "Sonda Folicular", baseCost: 50000000, increase: 500000, desc: "Exploración cósmica en búsqueda de cabello. Auto-genera +500k pala/s.", emoji: "🛰️" },
  { id: "agujero", name: "Agujero Negro de Pelas", baseCost: 2000000000, increase: 20000000, desc: "Gravedad infinita que atrae trabajo. Auto-genera +20M pala/s.", emoji: "🕳️" },
];

const STOCKS_CONFIG = [
  { id: "minx", name: "Minoxidil Labs Corp", ticker: "MINX", basePrice: 100, desc: "Biotecnología folicular avanzada.", emoji: "🧪" },
  { id: "pluc", name: "Pelucas S.A.", ticker: "PLUC", basePrice: 250, desc: "Líder global en cabelleras sintéticas.", emoji: "🦱" },
  { id: "gras", name: "Grasa de Asado Co.", ticker: "GRAS", basePrice: 50, desc: "Aporte lipídico para el brillo craneal.", emoji: "🥩" },
  { id: "gorr", name: "Hats & Caps S.R.L.", ticker: "GORR", basePrice: 15, desc: "Protección textil contra rayos solares.", emoji: "🧢" }
];

const TOOLS_CONFIG = [
  { id: "afilador", name: "Afilador de Acero", baseCost: 50, increase: 1, critIncrease: 0, desc: "Afila el borde. +1 por click.", emoji: "🪛" },
  { id: "mango", name: "Mango Ergonómico", baseCost: 350, increase: 5, critIncrease: 0.01, desc: "+5 por click y +1% de Prob. Crítica.", emoji: "🪓" },
  { id: "guantes", name: "Guantes de Kevlar", baseCost: 2500, increase: 25, critIncrease: 0.02, desc: "+25 por click y +2% de Prob. Crítica.", emoji: "🧤" },
  { id: "locion", name: "Loción Hidratante", baseCost: 15000, increase: 150, critIncrease: 0.05, desc: "+150 por click y +5% de Prob. Crítica.", emoji: "🧴" },
  { id: "gravitacional", name: "Pala Gravitacional", baseCost: 100000, increase: 1000, critIncrease: 0.1, desc: "+1000 por click y +10% de Prob. Crítica.", emoji: "🌌" },
];

const PRESTIGE_UPGRADES_CONFIG = [
  { id: "cegador", name: "Brillo Cegador", cost: 1, desc: "Clicks ganan +5% de tus PPS actuales.", emoji: "☀️" },
  { id: "contratos", name: "Contratos Ficticios", cost: 2, desc: "Los Upgrades (PPS) cuestan 15% menos.", emoji: "📃" },
  { id: "buff_double", name: "Licencia de Pela-AI", cost: 3, desc: "Doble efectividad (x2) en Buffs activos.", emoji: "🎖️" },
  { id: "iman", name: "Imán de Pelados", cost: 4, desc: "Pelados voladores aparecen 50% más seguido.", emoji: "🧲" },
];

const GACHA_ITEMS = [
  { id: "gorra", name: "Gorra de Lana", desc: "+5% Fuerza de Click.", emoji: "🧢", weight: 35 },
  { id: "minoxidil_viejito", name: "Minoxidil Viejito", desc: "+5% Multiplicador de PPS.", emoji: "🧪", weight: 35 },
  { id: "secador_roto", name: "Secador de Pelo Roto", desc: "+1.5% Prob. Crítica.", emoji: "💨", weight: 18 },
  { id: "pala_jefe", name: "Pala del Jefe", desc: "+15% Fuerza de Click.", emoji: "🏆", weight: 10 },
  { id: "peluca_cotillon", name: "Peluca de Cotillón", desc: "+15% PPS y +3% Prob. Crítica.", emoji: "🦱", weight: 2 },
];

const EXCHANGE_COST = 100;
const EXCHANGE_CREDIT = 10;
const PRESTIGE_THRESHOLD = 100000;
const GACHA_COST = 500;

const SUFFIXES = [
  { value: 1e6, symbol: "M" },
  { value: 1e9, symbol: "B" },
  { value: 1e12, symbol: "T" },
  { value: 1e15, symbol: "Qa" },
  { value: 1e18, symbol: "Qi" },
  { value: 1e21, symbol: "Sx" },
  { value: 1e24, symbol: "Sp" },
  { value: 1e27, symbol: "Oc" },
  { value: 1e30, symbol: "No" },
  { value: 1e33, symbol: "Dc" },
  { value: 1e36, symbol: "Ud" },
  { value: 1e39, symbol: "Dd" },
  { value: 1e42, symbol: "Td" },
  { value: 1e45, symbol: "Qad" },
  { value: 1e48, symbol: "Qid" },
  { value: 1e51, symbol: "Sxd" },
  { value: 1e54, symbol: "Spd" },
  { value: 1e57, symbol: "Ocd" },
  { value: 1e60, symbol: "Nod" },
  { value: 1e63, symbol: "Vg" },
];

const formatVal = (num, decimals = 1) => {
  if (num === null || num === undefined || isNaN(num)) return "0";
  if (num === Infinity) return "∞";
  
  const absNum = Math.abs(num);
  if (absNum < 1e6) {
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  }
  
  if (absNum >= 1e66) {
    return num.toExponential(2).replace("e+", "e");
  }
  
  for (let i = SUFFIXES.length - 1; i >= 0; i--) {
    if (absNum >= SUFFIXES[i].value) {
      const formatted = (num / SUFFIXES[i].value).toLocaleString(undefined, { maximumFractionDigits: 2 });
      return `${formatted} ${SUFFIXES[i].symbol}`;
    }
  }
  
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const TRIVIA_POOL = [
  {
    q: "¿Cuál es el peor enemigo natural del pelado?",
    o: ["El viento fuerte", "El champú anticaspa", "El peine", "La gorra de lana"],
    c: 2,
  },
  {
    q: "¿Qué debés hacer si tu Reserva de Pala llega a 0%?",
    o: ["Dormir una siesta", "Agarrar la pala y laburar", "Comprar bitcoins", "Llorar en Twitter"],
    c: 1,
  },
  {
    q: "¿De qué está compuesto el brillo reflejante del pelado feliz?",
    o: ["Grasa de asado", "Grafeno de Folículo", "Barniz marino", "Luz solar acumulada"],
    c: 1,
  },
  {
    q: "¿Qué misterioso romance desafía toda lógica argumentativa?",
    o: ["El Pelado y la Pala", "Coriglia y Pelado Feliz", "El becario y las horas extra", "El Minoxidil y el peine"],
    c: 1,
  },
];

export default function ClickerPage() {
  const { addCredit, credit } = useSocialCredit();
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  
  // Game states
  const [palas, setPalas] = useState(0);
  const [upgrades, setUpgrades] = useState({
    madera: 0,
    acero: 0,
    pasante: 0,
    union_delegate: 0,
    pela_ai: 0,
    minoxidil: 0,
    clonacion: 0,
    sonda: 0,
    agujero: 0,
  });

  const [shares, setShares] = useState({ minx: 0, pluc: 0, gras: 0, gorr: 0 });
  const [stockPrices, setStockPrices] = useState({ minx: 100, pluc: 250, gras: 50, gorr: 15 });
  const [stockHistory, setStockHistory] = useState({ minx: [100], pluc: [250], gras: [50], gorr: [15] });
  const [strikeActive, setStrikeActive] = useState(false);
  const [loan, setLoan] = useState({ amount: 0, dueTime: 0 });
  const [isGarnished, setIsGarnished] = useState(false);
  const [boss, setBoss] = useState(null);
  const [mateSpawning, setMateSpawning] = useState(false);
  const [mateCoords, setMateCoords] = useState({ top: "50%", left: "50%" });
  const [mateGame, setMateGame] = useState(null);

  const [tools, setTools] = useState({
    afilador: 0,
    mango: 0,
    guantes: 0,
    locion: 0,
    gravitacional: 0,
  });
  
  const [inventory, setInventory] = useState({
    gorra: 0,
    minoxidil_viejito: 0,
    secador_roto: 0,
    pala_jefe: 0,
    peluca_cotillon: 0,
  });
  
  // Prestige states
  const [brillo, setBrillo] = useState(0);
  const [prestigeUpgrades, setPrestigeUpgrades] = useState({
    cegador: 0,
    contratos: 0,
    buff_double: 0,
    iman: 0,
  });

  // Sound settings
  const [muted, setMuted] = useState(false);

  // Floating text particles
  const [floatingTexts, setFloatingTexts] = useState([]);
  const shovelRef = useRef(null);

  // Shovel shake state on critical click
  const [shake, setShake] = useState(false);

  // Shop Tab System: "passive" | "active" | "collection" | "casino" | "prestige"
  const [shopTab, setShopTab] = useState("passive");

  // Combo multiplier states
  const [combo, setCombo] = useState(0);
  const lastClickTimeRef = useRef(0);

  // Flying Pelado state
  const [flyingPelado, setFlyingPelado] = useState(null);

  // Buff state
  const [buff, setBuff] = useState(null);
  const [buffMessage, setBuffMessage] = useState("");

  // Trivia state
  const [trivia, setTrivia] = useState(null);

  // Gacha states
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState(null);

  // Casino states
  const [betPercent, setBetPercent] = useState(25);
  const [flipping, setFlipping] = useState(false);
  const [flipResult, setFlipResult] = useState(null);

  // Achievements state
  const [achievements, setAchievements] = useState({
    first_upgrade: false,
    negrero: false,
    gold_click: false,
    first_prestige: false,
  });

  // Synthesized Sound Triggers
  const playSound = (type) => {
    if (muted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === "click") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === "crit") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } else if (type === "buy") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.08);
        osc.frequency.setValueAtTime(580, ctx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.24);
      } else if (type === "gacha") {
        let time = ctx.currentTime;
        for (let i = 0; i < 5; i++) {
          const subOsc = ctx.createOscillator();
          const subGain = ctx.createGain();
          subOsc.frequency.setValueAtTime(200 + i * 90, time);
          subGain.gain.setValueAtTime(0.06, time);
          subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
          subOsc.connect(subGain);
          subGain.connect(ctx.destination);
          subOsc.start(time);
          subOsc.stop(time + 0.07);
          time += 0.09;
        }
      } else if (type === "flip") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {}
  };

  // Load game from local storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPalas = localStorage.getItem("clicker_palas_v6");
      const savedUpgrades = localStorage.getItem("clicker_upgrades_v6");
      const savedTools = localStorage.getItem("clicker_tools_v6");
      const savedInventory = localStorage.getItem("clicker_inventory_v6");
      const savedBrillo = localStorage.getItem("clicker_brillo_v6");
      const savedPrestigeUpgrades = localStorage.getItem("clicker_prestige_upgrades_v6");
      const savedAchievements = localStorage.getItem("clicker_achievements_v6");
      const savedMuted = localStorage.getItem("clicker_muted");
      const savedShares = localStorage.getItem("clicker_shares_v6");
      const savedStockPrices = localStorage.getItem("clicker_stock_prices_v6");
      const savedLoan = localStorage.getItem("clicker_loan_v6");
      const savedGarnished = localStorage.getItem("clicker_garnished_v6");

      if (savedPalas !== null) setPalas(parseFloat(savedPalas));
      if (savedBrillo !== null) setBrillo(parseInt(savedBrillo, 10));
      if (savedMuted !== null) setMuted(savedMuted === "true");
      if (savedGarnished !== null) setIsGarnished(savedGarnished === "true");
      
      if (savedUpgrades !== null) {
        try {
          setUpgrades(JSON.parse(savedUpgrades));
        } catch (e) {}
      }
      if (savedTools !== null) {
        try {
          setTools(JSON.parse(savedTools));
        } catch (e) {}
      }
      if (savedInventory !== null) {
        try {
          setInventory(JSON.parse(savedInventory));
        } catch (e) {}
      }
      if (savedPrestigeUpgrades !== null) {
        try {
          setPrestigeUpgrades(JSON.parse(savedPrestigeUpgrades));
        } catch (e) {}
      }
      if (savedAchievements !== null) {
        try {
          setAchievements(JSON.parse(savedAchievements));
        } catch (e) {}
      }
      if (savedShares !== null) {
        try {
          setShares(JSON.parse(savedShares));
        } catch (e) {}
      }
      if (savedStockPrices !== null) {
        try {
          const parsed = JSON.parse(savedStockPrices);
          setStockPrices(parsed);
          // Initialize stock history with loaded prices
          const hist = {};
          Object.keys(parsed).forEach(k => { hist[k] = [parsed[k]]; });
          setStockHistory(hist);
        } catch (e) {}
      }
      if (savedLoan !== null) {
        try {
          setLoan(JSON.parse(savedLoan));
        } catch (e) {}
      }

      setIsClientLoaded(true);
    }
  }, []);

  // Save game to local storage
  useEffect(() => {
    if (isClientLoaded) {
      localStorage.setItem("clicker_palas_v6", palas.toString());
      localStorage.setItem("clicker_upgrades_v6", JSON.stringify(upgrades));
      localStorage.setItem("clicker_tools_v6", JSON.stringify(tools));
      localStorage.setItem("clicker_inventory_v6", JSON.stringify(inventory));
      localStorage.setItem("clicker_brillo_v6", brillo.toString());
      localStorage.setItem("clicker_prestige_upgrades_v6", JSON.stringify(prestigeUpgrades));
      localStorage.setItem("clicker_achievements_v6", JSON.stringify(achievements));
      localStorage.setItem("clicker_muted", muted.toString());
      localStorage.setItem("clicker_shares_v6", JSON.stringify(shares));
      localStorage.setItem("clicker_stock_prices_v6", JSON.stringify(stockPrices));
      localStorage.setItem("clicker_loan_v6", JSON.stringify(loan));
      localStorage.setItem("clicker_garnished_v6", isGarnished.toString());
    }
  }, [palas, upgrades, tools, inventory, brillo, prestigeUpgrades, achievements, muted, shares, stockPrices, loan, isGarnished, isClientLoaded]);

  // Compute passive modifiers from Gacha inventory
  const inventoryClickMultiplier = 1 + (inventory.gorra || 0) * 0.05 + (inventory.pala_jefe || 0) * 0.15;
  const inventoryPPSMultiplier = 1 + (inventory.minoxidil_viejito || 0) * 0.05 + (inventory.peluca_cotillon || 0) * 0.15;
  const inventoryCritChance = (inventory.secador_roto || 0) * 0.015 + (inventory.peluca_cotillon || 0) * 0.03;

  // Compute Base Palas Per Second (PPS)
  const basePPS = Object.keys(upgrades).reduce((total, id) => {
    const config = UPGRADES_CONFIG.find((u) => u.id === id);
    return total + (upgrades[id] || 0) * (config ? config.increase : 0);
  }, 0);

  // Apply Prestige and Buff multipliers to PPS
  const prestigeMultiplier = 1 + brillo * 0.12;
  
  // Prestige Shop Buff double effect
  const buffDbl = prestigeUpgrades.buff_double ? 2 : 1;
  const buffPPSMultiplier = buff && buff.type === "hype" ? buff.multiplier * buffDbl : 1;
  const unionMultiplier = upgrades.union_delegate ? 1.25 : 1.0;
  const palasPerSecond = strikeActive ? 0 : basePPS * prestigeMultiplier * buffPPSMultiplier * inventoryPPSMultiplier * unionMultiplier;

  // Auto-generation loop (updates 10 times per second)
  useEffect(() => {
    if (!isClientLoaded || palasPerSecond <= 0) return;

    const interval = setInterval(() => {
      setPalas((prev) => prev + palasPerSecond / 10);
    }, 100);

    return () => clearInterval(interval);
  }, [palasPerSecond, isClientLoaded]);

  // Combo decay loop
  useEffect(() => {
    if (!isClientLoaded) return;

    const interval = setInterval(() => {
      setCombo((prev) => Math.max(0, prev - 4));
    }, 100);

    return () => clearInterval(interval);
  }, [isClientLoaded]);

  // Check achievements
  useEffect(() => {
    if (!isClientLoaded) return;

    const hasUpgrade = Object.values(upgrades).some((count) => count > 0) || Object.values(tools).some((count) => count > 0);
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
  }, [upgrades, tools, brillo, isClientLoaded]);

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

  // Trivia countdown timer
  useEffect(() => {
    if (!trivia) return;

    const interval = setInterval(() => {
      setTrivia((prev) => {
        if (!prev) return null;
        if (prev.timer <= 1) {
          triggerFlashMessage("Se acabó el tiempo de la trivia.");
          return null;
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [trivia]);

  // Flying Pelado spawn logic
  useEffect(() => {
    if (!isClientLoaded) return;

    const frequencyFactor = prestigeUpgrades.iman ? 6500 : 10000;

    const spawnInterval = setInterval(() => {
      if (flyingPelado || trivia) return;

      if (Math.random() < 0.18) {
        const side = Math.random() < 0.5 ? "left" : "right";
        const startX = side === "left" ? -100 : window.innerWidth + 10;
        const startY = Math.random() * (window.innerHeight - 250) + 100;
        const speedX = side === "left" ? Math.random() * 2 + 2 : -(Math.random() * 2 + 2);
        const speedY = (Math.random() - 0.5) * 1.5;

        setFlyingPelado({
          id: Date.now(),
          x: startX,
          y: startY,
          vx: speedX,
          vy: speedY,
          size: 75,
        });
      }
    }, frequencyFactor);

    return () => clearInterval(spawnInterval);
  }, [flyingPelado, trivia, prestigeUpgrades.iman, isClientLoaded]);

  // Flying Pelado physics loop
  useEffect(() => {
    if (!flyingPelado) return;

    const physicsInterval = setInterval(() => {
      setFlyingPelado((prev) => {
        if (!prev) return null;
        const newX = prev.x + prev.vx;
        const newY = prev.y + prev.vy;

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

  // Active upgrades click power calculation
  const activeClickPower = Object.keys(tools).reduce((total, id) => {
    const config = TOOLS_CONFIG.find((t) => t.id === id);
    return total + (tools[id] || 0) * (config ? config.increase : 0);
  }, 0);

  // Active upgrades critical chance calculation
  const activeCritChance = Object.keys(tools).reduce((total, id) => {
    const config = TOOLS_CONFIG.find((t) => t.id === id);
    return total + (tools[id] || 0) * (config ? config.critIncrease : 0);
  }, 0);

  const totalCritChance = 0.05 + activeCritChance + inventoryCritChance;

  // Prestige Shop cegador effect
  const ppsClickBonus = prestigeUpgrades.cegador ? palasPerSecond * 0.05 : 0;

  // Click power calculation
  const baseClickPower = 1 + activeClickPower + ppsClickBonus;
  const buffClickMultiplier = buff && buff.type === "fever" ? buff.multiplier * buffDbl : 1;
  const garnishFactor = isGarnished ? 0.5 : 1.0;
  const clickPower = baseClickPower * prestigeMultiplier * comboMultiplier * buffClickMultiplier * inventoryClickMultiplier * garnishFactor;

  // Handle clicking the flying pelado
  const handleFlyingPeladoClick = (e) => {
    e.stopPropagation();
    if (!flyingPelado) return;

    playSound("buy");
    if (!achievements.gold_click) {
      setAchievements((prev) => ({ ...prev, gold_click: true }));
    }

    setFlyingPelado(null);

    const rand = Math.random();
    if (rand < 0.08) {
      const bossHp = Math.max(50, 50 * (1 + Object.values(tools).reduce((a,b)=>a+b, 0)));
      setBoss({
        hp: bossHp,
        maxHp: bossHp,
        timeLeft: 15
      });
      triggerFlashMessage("⚠️ ¡APARECIÓ EL PEINE ASESINO! Defendé tus folículos.");
    } else if (rand < 0.45) {
      const questionData = TRIVIA_POOL[Math.floor(Math.random() * TRIVIA_POOL.length)];
      setTrivia({
        q: questionData.q,
        o: questionData.o,
        c: questionData.c,
        timer: 10,
        isUnion: false
      });
    } else {
      applyRandomFlyingBuff();
    }
  };

  const applyRandomFlyingBuff = () => {
    const rewards = [
      { type: "fever", name: "Fiebre Argumentativa (Click x7)", multiplier: 7, duration: 15000 },
      { type: "hype", name: "Hiper-Laburo (PPS x2)", multiplier: 2, duration: 25000 },
      { type: "rain", name: "Lluvia de Palas" },
    ];

    const chosen = rewards[Math.floor(Math.random() * rewards.length)];
    
    if (chosen.type === "rain") {
      const award = Math.max(50, Math.floor(palasPerSecond * 45));
      setPalas((prev) => prev + award);
      triggerFlashMessage(`¡Lluvia de Palas! Ganaste +${formatVal(award)} palas inmediatamente.`);
    } else {
      setBuff({
        type: chosen.type,
        name: chosen.name,
        multiplier: chosen.multiplier,
        endTime: Date.now() + chosen.duration,
      });
      triggerFlashMessage(`¡Buff Activado! ${chosen.name} por ${chosen.duration / 1000}s.`);
    }
  };

  // Handle trivia answer selection
  const handleTriviaAnswer = (index) => {
    if (!trivia) return;

    if (index === trivia.c) {
      playSound("buy");
      if (trivia.isUnion) {
        setStrikeActive(false);
        triggerFlashMessage("¡Convenio firmado! Volvió la producción laboral.");
      } else {
        setBuff({
          type: "fever",
          name: "Fiebre Extrema (Click x15)",
          multiplier: 15,
          endTime: Date.now() + 15000,
        });
        setPalas((prev) => prev + Math.max(100, Math.floor(palasPerSecond * 60)));
        triggerFlashMessage("¡Correcto! Recibís x15 de Clicks por 15s y palas extra.");
      }
    } else {
      playSound("click");
      if (trivia.isUnion) {
        const loss = Math.floor(palas * 0.25);
        setPalas((prev) => Math.max(0, prev - loss));
        triggerFlashMessage(`¡Asamblea fallida! Perdiste ${formatVal(loss)} palas por desidia.`);
      } else {
        triggerFlashMessage("¡Incorrecto! No ganás ningún bono.");
      }
    }

    setTrivia(null);
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

    const now = Date.now();
    const delay = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;
    
    if (delay < 400) {
      setCombo((prev) => Math.min(100, prev + 8));
    } else {
      setCombo((prev) => Math.min(100, prev + 4));
    }

    const isCrit = Math.random() < totalCritChance;
    const finalPower = isCrit ? clickPower * 10 : clickPower;

    if (isCrit) {
      playSound("crit");
      setShake(true);
      setTimeout(() => setShake(false), 150);
    } else {
      playSound("click");
    }

    setPalas((prev) => prev + finalPower);

    const roundedPower = parseFloat(finalPower.toFixed(1));
    const newText = {
      id: Date.now() + Math.random(),
      text: isCrit ? `¡CRÍTICO! +${roundedPower}` : `+${roundedPower}`,
      x: clickX,
      y: clickY,
      color: isCrit ? "#ff3b3b" : buff && buff.type === "fever" ? "#ff8c3b" : combo >= 50 ? "#ffeb3b" : "#ffffff",
      scale: isCrit ? 1.4 : 1,
    };

    setFloatingTexts((prev) => [...prev, newText]);

    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((t) => t.id !== newText.id));
    }, 900);
  };

  // Get current cost of upgrade
  const getCost = (id, isTool = false) => {
    const list = isTool ? TOOLS_CONFIG : UPGRADES_CONFIG;
    const config = list.find((u) => u.id === id);
    if (!config) return 999999;
    const count = isTool ? (tools[id] || 0) : (upgrades[id] || 0);
    const rawCost = Math.floor(config.baseCost * Math.pow(1.15, count));

    // Prestige Shop contratos discount: 15% off per level
    if (!isTool && prestigeUpgrades.contratos > 0) {
      return Math.max(1, Math.floor(rawCost * (1 - 0.15 * prestigeUpgrades.contratos)));
    }
    return rawCost;
  };

  // Buy passive upgrade
  const buyUpgrade = (id) => {
    const cost = getCost(id, false);
    if (palas >= cost) {
      playSound("buy");
      setPalas((prev) => prev - cost);
      setUpgrades((prev) => ({
        ...prev,
        [id]: (prev[id] || 0) + 1,
      }));
    }
  };

  // Buy tool upgrade
  const buyTool = (id) => {
    const cost = getCost(id, true);
    if (palas >= cost) {
      playSound("buy");
      setPalas((prev) => prev - cost);
      setTools((prev) => ({
        ...prev,
        [id]: (prev[id] || 0) + 1,
      }));
    }
  };

  // Buy prestige shop upgrade
  const buyPrestigeUpgrade = (id) => {
    const config = PRESTIGE_UPGRADES_CONFIG.find((u) => u.id === id);
    if (config && brillo >= config.cost && !prestigeUpgrades[id]) {
      playSound("buy");
      setBrillo((prev) => prev - config.cost);
      setPrestigeUpgrades((prev) => ({
        ...prev,
        [id]: 1,
      }));
      triggerFlashMessage(`¡Compraste permanentemente: ${config.name}! ✨`);
    }
  };

  // Lotería Folicular (Gacha Spin)
  const spinGacha = () => {
    if (palas < GACHA_COST || spinning) return;
    
    playSound("gacha");
    setPalas((prev) => prev - GACHA_COST);
    setSpinning(true);
    setSpinResult(null);

    setTimeout(() => {
      const totalWeight = GACHA_ITEMS.reduce((sum, item) => sum + item.weight, 0);
      let rand = Math.random() * totalWeight;
      let selected = GACHA_ITEMS[0];

      for (const item of GACHA_ITEMS) {
        rand -= item.weight;
        if (rand <= 0) {
          selected = item;
          break;
        }
      }

      setInventory((prev) => ({
        ...prev,
        [selected.id]: (prev[selected.id] || 0) + 1,
      }));
      setSpinResult(selected);
      setSpinning(false);
      triggerFlashMessage(`¡Loot: ${selected.name}! ${selected.emoji}`);
    }, 1200);
  };

  // Casino (Doble o Nada) Coin Flip with 30% AFIP Tax on wins
  const gambleFlip = () => {
    if (palas <= 10 || flipping) return;
    
    playSound("flip");
    const betAmount = Math.floor(palas * (betPercent / 100));
    setFlipping(true);
    setFlipResult(null);

    setTimeout(() => {
      const isWin = Math.random() < 0.5;
      if (isWin) {
        // Tax 30% on the bet winnings: only receive 70% of the bet as gains
        const netWinnings = Math.floor(betAmount * 0.7);
        setPalas((prev) => prev + netWinnings);
        setFlipResult("win");
        triggerFlashMessage(`¡Apuesta Ganada! AFIP retuvo el 30% del premio. Ganancia neta: +${formatVal(netWinnings)} palas.`);
      } else {
        // Lose 100% of the bet amount
        setPalas((prev) => Math.max(0, prev - betAmount));
        setFlipResult("lose");
        triggerFlashMessage(`¡Apuesta Perdida! Perdiste -${formatVal(betAmount)} palas.`);
      }
      setFlipping(false);
    }, 1500);
  };

  // Calculate prestige points gained (Quadratic prestige scaling formula)
  const getGainedBrillo = () => {
    return Math.max(0, Math.floor(Math.sqrt(palas / PRESTIGE_THRESHOLD)) - brillo);
  };

  const gainedBrillo = getGainedBrillo();

  // Execute Prestige
  const executePrestige = () => {
    if (gainedBrillo > 0) {
      playSound("buy");
      setBrillo((prev) => prev + gainedBrillo);
      setPalas(0);
      setUpgrades({ madera: 0, acero: 0, pasante: 0, union_delegate: 0, pela_ai: 0, minoxidil: 0, clonacion: 0, sonda: 0, agujero: 0 });
      setTools({ afilador: 0, mango: 0, guantes: 0, locion: 0, gravitacional: 0 });
      setInventory({ gorra: 0, minoxidil_viejito: 0, secador_roto: 0, pala_jefe: 0, peluca_cotillon: 0 });
      setCombo(0);
      setBuff(null);
      triggerFlashMessage(`¡Hiciste la Gran Pelada! Ganaste +${formatVal(gainedBrillo)} de Brillo Capilar.`);
    }
  };

  // Canjear Palas por Reserva de Pala (Social Credit)
  const handleExchange = () => {
    if (palas >= EXCHANGE_COST && credit < 100) {
      playSound("buy");
      setPalas((prev) => prev - EXCHANGE_COST);
      addCredit(EXCHANGE_CREDIT);
      triggerFlashMessage(`¡Canjeaste ${EXCHANGE_COST} palas por +${EXCHANGE_CREDIT}% de Reserva de Pala!`);
    }
  };

  // 1. Stock Market pricing loop (every 10s)
  useEffect(() => {
    if (!isClientLoaded) return;
    const interval = setInterval(() => {
      setStockPrices((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          const change = 1 + (Math.random() * 0.28 - 0.13); // random walk from -13% to +15%
          next[key] = Math.max(1, Math.floor(next[key] * change));
        });

        // Track trend history
        setStockHistory((history) => {
          const nextHistory = { ...history };
          Object.keys(next).forEach((key) => {
            const arr = nextHistory[key] || [];
            const nextArr = [...arr, next[key]];
            if (nextArr.length > 10) nextArr.shift();
            nextHistory[key] = nextArr;
          });
          return nextHistory;
        });

        return next;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [isClientLoaded]);

  // 2. Buy and Sell shares logic
  const buyStock = (stockId) => {
    const cost = stockPrices[stockId];
    if (palas >= cost) {
      setPalas((prev) => prev - cost);
      setShares((prev) => ({
        ...prev,
        [stockId]: prev[stockId] + 1,
      }));
      playSound("buy");
      triggerFlashMessage(`¡Compraste 1 acción de ${STOCKS_CONFIG.find(s=>s.id===stockId).ticker}!`);
    } else {
      triggerFlashMessage("No tenés suficientes palas para comprar.");
    }
  };

  const sellStock = (stockId) => {
    if (shares[stockId] > 0) {
      const price = stockPrices[stockId];
      setPalas((prev) => prev + price);
      setShares((prev) => ({
        ...prev,
        [stockId]: prev[stockId] - 1,
      }));
      playSound("buy");
      triggerFlashMessage(`¡Vendiste 1 acción de ${STOCKS_CONFIG.find(s=>s.id===stockId).ticker} por ${formatVal(price)} palas!`);
    } else {
      triggerFlashMessage("No tenés acciones para vender.");
    }
  };

  // 3. Union Strike triggering loop
  useEffect(() => {
    if (!isClientLoaded || !upgrades.union_delegate || strikeActive) return;

    const interval = setInterval(() => {
      // 5% chance of strike every 45s
      if (Math.random() < 0.05) {
        setStrikeActive(true);
        playSound("click");
        triggerFlashMessage("⚠️ ¡HUELGA LABORAL! El Sindicato de la Pala congeló la producción pasiva.");
      }
    }, 45000);

    return () => clearInterval(interval);
  }, [upgrades.union_delegate, strikeActive, isClientLoaded]);

  const bribeUnion = () => {
    const cost = Math.max(1000, Math.floor(basePPS * prestigeMultiplier * 15));
    if (palas >= cost) {
      setPalas((prev) => prev - cost);
      setStrikeActive(false);
      playSound("buy");
      triggerFlashMessage("Convenio colectivo firmado bajo la mesa. ¡A laburar!");
    } else {
      triggerFlashMessage("No tenés suficientes palas para la coima.");
    }
  };

  const startNegotiation = () => {
    const questionData = TRIVIA_POOL[Math.floor(Math.random() * TRIVIA_POOL.length)];
    setTrivia({
      q: questionData.q,
      o: questionData.o,
      c: questionData.c,
      timer: 10,
      isUnion: true
    });
  };

  // 4. Loan debt timer and click garnishment
  useEffect(() => {
    if (!isClientLoaded || loan.amount === 0) return;

    const interval = setInterval(() => {
      if (Date.now() > loan.dueTime && !isGarnished) {
        setIsGarnished(true);
        playSound("crit");
        triggerFlashMessage("🚨 ¡EMBARGO MP! Deuda impaga. Se confiscó el 50% de tu poder de click.");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [loan, isGarnished, isClientLoaded]);

  const takeLoan = () => {
    if (loan.amount > 0) return;
    const grant = Math.max(100000, Math.floor(palasPerSecond * 300));
    setPalas((prev) => prev + grant);
    setLoan({
      amount: grant,
      dueTime: Date.now() + 90000, // 90s to pay back
    });
    setIsGarnished(false);
    playSound("buy");
    triggerFlashMessage(`¡Préstamo Aprobado! Recibiste +${formatVal(grant)} palas.`);
  };

  const payLoan = () => {
    if (loan.amount === 0) return;
    const cost = isGarnished ? Math.floor(loan.amount * 2.4) : loan.amount * 2;
    if (palas >= cost) {
      setPalas((prev) => prev - cost);
      setLoan({ amount: 0, dueTime: 0 });
      setIsGarnished(false);
      playSound("buy");
      triggerFlashMessage("¡Deuda saldada! Tu historial financiero vuelve a estar limpio.");
    } else {
      triggerFlashMessage("No tenés suficientes palas para pagar la deuda.");
    }
  };

  // 5. Boss Battle (Peine Asesino) timer logic
  useEffect(() => {
    if (!isClientLoaded || !boss) return;

    const interval = setInterval(() => {
      setBoss((prev) => {
        if (!prev) return null;
        if (prev.timeLeft <= 1) {
          playSound("click");
          setPalas((p) => Math.max(0, Math.floor(p * 0.7))); // penalize 30%
          triggerFlashMessage("☠️ ¡TIEMPO AGOTADO! El Peine Asesino te despojó de 30% de tus palas.");
          return null;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [boss, isClientLoaded]);

  const damageBoss = () => {
    if (!boss) return;
    const damage = 1 + Object.values(tools).reduce((sum, val) => sum + val, 0);
    playSound("crit");
    setBoss((prev) => {
      if (!prev) return null;
      const nextHp = prev.hp - damage;
      if (nextHp <= 0) {
        const itemIds = ["secador_roto", "pala_jefe", "peluca_cotillon"];
        const chosenId = itemIds[Math.floor(Math.random() * itemIds.length)];
        setInventory((inv) => ({
          ...inv,
          [chosenId]: (inv[chosenId] || 0) + 1,
        }));
        setTimeout(() => {
          playSound("buy");
          triggerFlashMessage(`🏆 ¡Peine Derrotado! Obtuviste: ${GACHA_ITEMS.find(i=>i.id===chosenId).name}`);
        }, 10);
        return null;
      }
      return { ...prev, hp: nextHp };
    });
  };

  // 6. Mate rhythm game timing loops
  useEffect(() => {
    if (!isClientLoaded || !mateGame) return;

    const handleKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        brewMateAction();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    const interval = setInterval(() => {
      setMateGame((prev) => {
        if (!prev) return null;
        let nextPos = prev.pointerPos + prev.direction * 3.5;
        let nextDir = prev.direction;
        
        if (nextPos >= 90) {
          nextPos = 90;
          nextDir = -1;
        } else if (nextPos <= 10) {
          nextPos = 10;
          nextDir = 1;
        }
        
        return { ...prev, pointerPos: nextPos, direction: nextDir };
      });
    }, 35);

    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mateGame, isClientLoaded]);

  // Spawn mate icon loop
  useEffect(() => {
    if (!isClientLoaded) return;

    const interval = setInterval(() => {
      if (mateSpawning || mateGame) return;
      
      const randomTop = Math.floor(Math.random() * 50 + 25) + "%";
      const randomLeft = Math.floor(Math.random() * 60 + 20) + "%";
      setMateCoords({ top: randomTop, left: randomLeft });
      setMateSpawning(true);
      
      setTimeout(() => {
        setMateSpawning(false);
      }, 12000);
      
    }, 60000);

    return () => clearInterval(interval);
  }, [mateSpawning, mateGame, isClientLoaded]);

  const handleMateIconClick = (e) => {
    e.stopPropagation();
    setMateSpawning(false);
    setMateGame({
      progress: 0,
      pointerPos: 20,
      direction: 1,
      attempts: 5
    });
  };

  const brewMateAction = () => {
    if (!mateGame) return;
    
    const isPerfect = mateGame.pointerPos >= 44 && mateGame.pointerPos <= 56;
    
    if (isPerfect) {
      playSound("crit");
      const nextProgress = mateGame.progress + 1;
      const nextAttempts = mateGame.attempts - 1;
      
      if (nextProgress >= 3) {
        setBuff({
          type: "fever",
          name: "Mateína Extrema (Click x4)",
          multiplier: 4,
          endTime: Date.now() + 25000
        });
        setMateGame(null);
        setTimeout(() => {
          playSound("buy");
          triggerFlashMessage("🧉 ¡Mate perfecto! Multiplicador de click x4 por 25s.");
        }, 10);
      } else if (nextAttempts <= 0) {
        setMateGame(null);
        triggerFlashMessage("Se te lavó el mate, te quedaste sin yerba.");
      } else {
        setMateGame((prev) => ({
          ...prev,
          progress: nextProgress,
          attempts: nextAttempts
        }));
        triggerFlashMessage(`¡Perfecto! (${nextProgress}/3)`);
      }
    } else {
      playSound("click");
      const nextAttempts = mateGame.attempts - 1;
      if (nextAttempts <= 0) {
        setMateGame(null);
        triggerFlashMessage("Se te lavó el mate, te quedaste sin yerba.");
      } else {
        setMateGame((prev) => ({
          ...prev,
          progress: 0, // reset progress on miss
          attempts: nextAttempts
        }));
        triggerFlashMessage("¡Lavado! Se reinicia la cebada.");
      }
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
          margin-bottom: 18px;
          position: relative;
          width: 100%;
        }

        .mute-toggle-btn {
          position: absolute;
          right: 0;
          top: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--gold);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          cursor: pointer;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .mute-toggle-btn:hover {
          background: rgba(255, 235, 59, 0.1);
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
          font-size: 0.92rem;
          color: var(--text-muted);
          font-weight: 600;
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        /* Combo styles */
        .combo-container {
          width: 240px;
          margin-bottom: 18px;
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

        .shovel-button.shake .shovel-image {
          animation: shake-fast-anim 0.15s infinite alternate;
        }

        @keyframes shake-fast-anim {
          0% { transform: scale(0.95) rotate(-12deg) translate(3px, 2px); }
          100% { transform: scale(0.95) rotate(-18deg) translate(-3px, -2px); }
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
          font-size: 1.4rem;
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
            transform: translate(-50%, -150px) scale(0.8);
          }
        }

        /* Banner alerts */
        .notification-banner {
          position: fixed;
          top: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(20, 20, 5, 0.92);
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

        /* Action panels row */
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

        /* Trivia Popup Modal */
        .trivia-overlay {
          position: fixed;
          inset: 0;
          background: rgba(5, 5, 2, 0.95);
          backdrop-filter: blur(25px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200000;
          padding: 20px;
          animation: fadeIn 0.25s ease forwards;
        }

        .trivia-card {
          width: 100%;
          max-width: 520px;
          background: rgba(25, 25, 10, 0.85);
          border: 2px solid var(--gold);
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 235, 59, 0.25);
          text-align: center;
          box-sizing: border-box;
          position: relative;
        }

        .trivia-timer-badge {
          position: absolute;
          top: -15px;
          left: 50%;
          transform: translateX(-50%);
          background: #ff3b3b;
          color: #fff;
          font-weight: 800;
          padding: 4px 16px;
          border-radius: 99px;
          font-size: 0.85rem;
          box-shadow: 0 5px 15px rgba(255, 59, 59, 0.4);
        }

        .trivia-badge {
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--gold);
          margin-bottom: 12px;
          display: block;
        }

        .trivia-q {
          font-size: 1.35rem;
          font-weight: 800;
          margin: 0 0 24px;
          line-height: 1.4;
          color: #ffffff;
        }

        .trivia-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .trivia-opt-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #ffffff;
          padding: 14px 20px;
          border-radius: 14px;
          font-size: 0.95rem;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .trivia-opt-btn:hover {
          background: rgba(255, 235, 59, 0.08);
          border-color: var(--gold);
          transform: translateY(-1px);
        }

        .trivia-opt-letter {
          background: rgba(255, 235, 59, 0.15);
          color: var(--gold);
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 800;
        }

        /* Clicker Right Layout */
        .clicker-right {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Tabs styling */
        .shop-tabs {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 4px;
          gap: 2px;
        }

        .shop-tab-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 8px 2px;
          border-radius: 10px;
          font-size: 0.65rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.01em;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .shop-tab-btn.active {
          background: rgba(255, 235, 59, 0.1);
          color: var(--gold);
          border: 1px solid rgba(255, 235, 59, 0.15);
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

        /* Gacha Box Layout */
        .gacha-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          padding: 20px;
          text-align: center;
        }

        .gacha-wheel {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          border: 3px dashed var(--gold);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          background: rgba(255, 235, 59, 0.03);
          box-shadow: 0 0 20px rgba(255, 235, 59, 0.05);
          position: relative;
        }

        .gacha-wheel.spinning {
          animation: spin-fast-anim 0.15s linear infinite;
          border-color: #ff3b3b;
          box-shadow: 0 0 25px rgba(255, 59, 59, 0.2);
        }

        @keyframes spin-fast-anim {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .gacha-item-award {
          animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          background: rgba(255, 235, 59, 0.1);
          border: 1px solid var(--gold);
          border-radius: 12px;
          padding: 8px 16px;
          margin-top: 5px;
        }

        @keyframes popIn {
          from { transform: scale(0.7); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* Casino panel layout */
        .casino-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          padding: 20px;
          text-align: center;
        }

        .casino-coin {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ffd700, #ffeb3b, #b8860b);
          border: 2px solid #fff;
          box-shadow: 0 10px 20px rgba(0,0,0,0.5), 0 0 15px rgba(255,235,59,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 900;
          color: #000;
          text-shadow: 0 1px 1px #fff;
        }

        .casino-coin.flipping {
          animation: coin-flip-animation 0.2s linear infinite;
        }

        @keyframes coin-flip-animation {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }

        .casino-bet-selector {
          display: flex;
          gap: 8px;
          width: 100%;
        }

        .casino-bet-btn {
          flex: 1;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #ffffff;
          padding: 8px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
        }

        .casino-bet-btn.active {
          background: var(--gold);
          color: #000;
          border-color: var(--gold);
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

        /* 6 Tabs display configuration */
        .shop-tabs {
          grid-template-columns: repeat(6, 1fr) !important;
        }

        /* Stock Market tab layout */
        .stocks-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .stock-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 12px;
          gap: 12px;
        }

        .stock-details {
          text-align: left;
          flex: 1;
        }

        .stock-trend-indicator {
          font-weight: 700;
          font-size: 0.75rem;
          margin-left: 6px;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .stock-trend-up {
          color: #4caf50;
          background: rgba(76, 175, 80, 0.1);
        }
        .stock-trend-down {
          color: #f44336;
          background: rgba(244, 67, 54, 0.1);
        }

        .stock-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 100px;
        }

        .stock-action-btn {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          color: #fff;
          border-radius: 8px;
          padding: 4px 8px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .stock-action-btn.buy:hover {
          background: var(--gold-dim);
          border-color: var(--gold);
          color: var(--gold);
        }

        .stock-action-btn.sell:hover {
          background: rgba(244, 67, 54, 0.1);
          border-color: #f44336;
          color: #f44336;
        }

        /* Strike Overlay Banner styling */
        .strike-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          z-index: 1000000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(8px);
          animation: popIn 0.3s ease;
        }

        .strike-card {
          max-width: 480px;
          width: 90%;
          background: radial-gradient(circle at top left, #2b0b0b 0%, #120303 100%);
          border: 2px solid #ff3b3b;
          border-radius: 24px;
          padding: 32px;
          text-align: center;
          box-shadow: 0 0 40px rgba(255, 59, 59, 0.3);
        }

        .strike-card h2 {
          color: #ff3b3b;
          margin-top: 0;
          font-size: 1.8rem;
          font-weight: 900;
        }

        .strike-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 24px;
        }

        .strike-btn {
          padding: 12px;
          font-weight: 800;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.1s;
        }
        .strike-btn:active {
          transform: scale(0.97);
        }
        .strike-btn.bribe {
          background: #ff3b3b;
          border: none;
          color: #fff;
        }
        .strike-btn.negotiate {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
        }

        /* Boss Fight Overlay styling */
        .boss-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(6px);
          animation: popIn 0.2s ease;
        }

        .boss-card {
          width: 90%;
          max-width: 600px;
          background: #111;
          border: 2px solid #ffd700;
          border-radius: 28px;
          padding: 24px;
          text-align: center;
          box-shadow: 0 0 50px rgba(255, 215, 0, 0.25);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .boss-timer {
          font-size: 1.1rem;
          font-weight: 900;
          color: #ff3b3b;
          background: rgba(255, 59, 59, 0.1);
          padding: 4px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 59, 59, 0.2);
        }

        .boss-hp-bar-bg {
          width: 100%;
          height: 24px;
          background: #222;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          overflow: hidden;
          position: relative;
        }

        .boss-hp-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #ff3b3b, #ff8c3b);
          transition: width 0.1s ease;
        }

        .boss-hp-text {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 900;
          color: #fff;
        }

        .boss-avatar-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: transform 0.05s;
          outline: none;
        }

        .boss-avatar-btn:active {
          transform: scale(0.9);
        }

        .boss-avatar-emoji {
          font-size: 6rem;
          display: inline-block;
          animation: wobble-anim-frame 1s infinite alternate;
        }

        @keyframes wobble-anim-frame {
          0% { transform: rotate(-5deg) scale(1); }
          100% { transform: rotate(5deg) scale(1.08); }
        }

        /* Mate Rhythm Game Overlay */
        .mate-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          z-index: 999998;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(5px);
          animation: popIn 0.2s ease;
        }

        .mate-card {
          width: 90%;
          max-width: 440px;
          background: radial-gradient(circle at bottom center, #0f2b0f 0%, #031203 100%);
          border: 2px solid #4caf50;
          border-radius: 28px;
          padding: 24px;
          text-align: center;
          box-shadow: 0 0 50px rgba(76, 175, 80, 0.25);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .mate-spawn-btn {
          position: fixed;
          z-index: 9999;
          font-size: 2.2rem;
          background: rgba(0,0,0,0.5);
          border: 1px solid var(--gold);
          border-radius: 50%;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 0 20px var(--gold);
          animation: bounce-float 1.5s infinite alternate;
        }

        @keyframes bounce-float {
          0% { transform: translateY(0); }
          100% { transform: translateY(-8px); }
        }

        .mate-gauge-container {
          width: 100%;
          height: 40px;
          background: #222;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          position: relative;
          overflow: hidden;
          margin-top: 10px;
        }

        .mate-green-zone {
          position: absolute;
          left: 44%;
          width: 12%;
          height: 100%;
          background: #4caf50;
          border-left: 2px solid #fff;
          border-right: 2px solid #fff;
          opacity: 0.75;
        }

        .mate-pointer {
          position: absolute;
          width: 6px;
          height: 100%;
          background: #fff;
          box-shadow: 0 0 10px #fff;
          top: 0;
          transition: left 0.03s linear;
        }

        .loan-details-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: rgba(255, 59, 59, 0.03);
          border: 1px solid rgba(255, 59, 59, 0.15);
          border-radius: 16px;
          padding: 12px;
          text-align: center;
          margin-top: 10px;
        }
      `}</style>

      {/* Floating notification banner */}
      {buffMessage && (
        <div className="notification-banner">
          {buffMessage}
        </div>
      )}

      {/* Folicular Trivia Modal Popup */}
      {trivia && (
        <div className="trivia-overlay">
          <div className="trivia-card">
            <span className="trivia-timer-badge">Tiempo: {trivia.timer}s</span>
            <span className="trivia-badge">Trivia Folicular</span>
            <h2 className="trivia-q">{trivia.q}</h2>
            <div className="trivia-options">
              {trivia.o.map((opt, i) => (
                <button
                  key={i}
                  className="trivia-opt-btn"
                  onClick={() => handleTriviaAnswer(i)}
                  type="button"
                >
                  <span className="trivia-opt-letter">{["A", "B", "C", "D"][i]}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Golden Click Flying Pelado */}
      {flyingPelado && !trivia && (
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

      {/* Union Strike Modal Overlay */}
      {strikeActive && !trivia && (
        <div className="strike-overlay">
          <div className="strike-card">
            <h2>⚠️ HUELGA SINDICAL ⚠️</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "10px 0" }}>
              El Sindicato de la Pala ha decretado un paro total de actividades. La producción pasiva está completamente congelada (0 palas/s).
            </p>
            <div className="strike-options">
              <button
                className="strike-btn bribe"
                onClick={bribeUnion}
                type="button"
              >
                Pagar Coima ({formatVal(Math.max(1000, Math.floor(basePPS * prestigeMultiplier * 15)))} palas)
              </button>
              <button
                className="strike-btn negotiate"
                onClick={startNegotiation}
                type="button"
              >
                Negociar Convenio (Trivia)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boss Fight Overlay */}
      {boss && (
        <div className="boss-overlay">
          <div className="boss-card">
            <h2 style={{ color: "#ffd700", margin: 0, fontSize: "1.8rem", fontWeight: 900 }}>🚨 ¡PEINE ASESINO ATACA! 🚨</h2>
            <div className="boss-timer">Tiempo restante: {boss.timeLeft}s</div>
            
            <button className="boss-avatar-btn" onClick={damageBoss} type="button">
              <span className="boss-avatar-emoji">🪮</span>
            </button>
            
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "4px 0" }}>
              ¡Hacé click rápido sobre el Peine Asesino antes de que destruya tu cabellera!
            </p>

            <div className="boss-hp-bar-bg">
              <div 
                className="boss-hp-bar-fill" 
                style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%` }} 
              />
              <div className="boss-hp-text">HP: {boss.hp} / {boss.maxHp}</div>
            </div>
          </div>
        </div>
      )}

      {/* Mate Spawning Icon */}
      {mateSpawning && (
        <button
          className="mate-spawn-btn"
          style={{ top: mateCoords.top, left: mateCoords.left }}
          onClick={handleMateIconClick}
          type="button"
        >
          🧉
        </button>
      )}

      {/* Mate Rhythm Game Overlay */}
      {mateGame && (
        <div className="mate-overlay" onClick={brewMateAction}>
          <div className="mate-card" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#4caf50", margin: 0, fontSize: "1.6rem", fontWeight: 900 }}>🧉 Cebando el Mate Perfecto 🧉</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "4px 0" }}>
              Presioná <strong style={{ color: "#fff" }}>ESPACIO</strong> o haz <strong style={{ color: "#fff" }}>CLICK</strong> cuando el indicador esté en la zona verde (44% - 56%).
            </p>
            
            <div style={{ fontSize: "0.9rem", margin: "8px 0" }}>
              Cebadas logradas: <strong style={{ color: "#4caf50", fontSize: "1.2rem" }}>{mateGame.progress} / 3</strong>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Intentos restantes: <strong>{mateGame.attempts}</strong>
            </div>

            <div className="mate-gauge-container">
              <div className="mate-green-zone" />
              <div 
                className="mate-pointer" 
                style={{ left: `${mateGame.pointerPos}%` }} 
              />
            </div>

            <button
              className="action-btn"
              style={{ background: "#4caf50", color: "#fff", border: "none", marginTop: "12px", width: "100%" }}
              onClick={brewMateAction}
              type="button"
            >
              ¡Cebar!
            </button>
          </div>
        </div>
      )}

      <div className="clicker-content">
        <div className="clicker-left">
          <div className="clicker-title-area">
            <h1 className="clicker-title">Pala Clicker</h1>
            {brillo > 0 && (
              <div className="prestige-badge" title={brillo.toLocaleString()}>
                <span>✨</span> Brillo Capilar +{formatVal(brillo)}
              </div>
            )}
            
            {/* Audio Mute/Unmute Toggle */}
            <button
              className="mute-toggle-btn"
              onClick={() => setMuted((prev) => !prev)}
              title={muted ? "Activar Sonido" : "Silenciar"}
              type="button"
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>

          <div className="counter-box">
            <div className="counter-num" title={Math.floor(palas).toLocaleString()}>{formatVal(palas, 0)}</div>
            <div className="counter-pps">
              <span title={palasPerSecond.toLocaleString()}>Auto: {formatVal(palasPerSecond)}/s</span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>•</span>
              <span title={clickPower.toLocaleString()}>Click: {formatVal(clickPower)} (+{(totalCritChance * 100).toFixed(1)}% Crit)</span>
            </div>
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
              className={`shovel-button ${shake ? "shake" : ""}`}
              onClick={handleShovelClick}
              type="button"
            >
              <img src="/imgs/labura/shovel.jpeg" alt="Pala" className="shovel-image" />
            </button>

            {floatingTexts.map((txt) => (
              <span
                key={txt.id}
                className="float-text"
                style={{
                  left: `${txt.x}px`,
                  top: `${txt.y}px`,
                  color: txt.color,
                  transform: `translate(-50%, -50%) scale(${txt.scale})`,
                  fontWeight: txt.scale > 1 ? "900" : "700"
                }}
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
                Cambia {EXCHANGE_COST} palas por +{EXCHANGE_CREDIT}% de Reserva de Pala.
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
              <div className="action-card-title">La Gran Pelada</div>
              <p className="action-card-text">
                Reinicia tu juego a cambio de Brillo Capilar. Requiere palas proporcionales a tu nivel.
              </p>
              <button
                className="action-btn gold-outline"
                disabled={gainedBrillo <= 0}
                onClick={executePrestige}
                type="button"
                title={gainedBrillo.toLocaleString()}
              >
                Prestigio (+{formatVal(gainedBrillo)})
              </button>
            </div>
          </div>
        </div>

        <div className="clicker-right">
          <div className="shop-tabs">
            <button className={`shop-tab-btn ${shopTab === "passive" ? "active" : ""}`} onClick={() => setShopTab("passive")} type="button">Pasivas</button>
            <button className={`shop-tab-btn ${shopTab === "active" ? "active" : ""}`} onClick={() => setShopTab("active")} type="button">Clicks</button>
            <button className={`shop-tab-btn ${shopTab === "collection" ? "active" : ""}`} onClick={() => setShopTab("collection")} type="button">Loot</button>
            <button className={`shop-tab-btn ${shopTab === "casino" ? "active" : ""}`} onClick={() => setShopTab("casino")} type="button">Casino</button>
            <button className={`shop-tab-btn ${shopTab === "stocks" ? "active" : ""}`} onClick={() => setShopTab("stocks")} type="button">Bolsa</button>
            <button className={`shop-tab-btn ${shopTab === "prestige" ? "active" : ""}`} onClick={() => setShopTab("prestige")} type="button">Brillo</button>
          </div>

          <div className="upgrades-container">
            {shopTab === "passive" && (
              /* Passive PPS Upgrades */
              UPGRADES_CONFIG.map((upgrade) => {
                const cost = getCost(upgrade.id, false);
                const count = upgrades[upgrade.id] || 0;
                const canAfford = palas >= cost;

                return (
                  <div key={upgrade.id} className={`upgrade-card ${!canAfford ? "disabled" : ""}`}>
                    <div className="upgrade-info">
                      <div className="upgrade-emoji">{upgrade.emoji}</div>
                      <div className="upgrade-details">
                        <h3 className="upgrade-title">
                          <span>{upgrade.name}</span>
                          {count > 0 && <span className="upgrade-count-badge">x{count}</span>}
                        </h3>
                        <p className="upgrade-desc">{upgrade.desc}</p>
                      </div>
                    </div>
                    <button className="upgrade-buy-btn" disabled={!canAfford} onClick={() => buyUpgrade(upgrade.id)} type="button" title={cost.toLocaleString()}>
                      <span>{formatVal(cost)}</span>
                      <span className="upgrade-cost-label">Palas</span>
                    </button>
                  </div>
                );
              })
            )}

            {shopTab === "active" && (
              /* Active Click Upgrades */
              TOOLS_CONFIG.map((tool) => {
                const cost = getCost(tool.id, true);
                const count = tools[tool.id] || 0;
                const canAfford = palas >= cost;

                return (
                  <div key={tool.id} className={`upgrade-card ${!canAfford ? "disabled" : ""}`}>
                    <div className="upgrade-info">
                      <div className="upgrade-emoji">{tool.emoji}</div>
                      <div className="upgrade-details">
                        <h3 className="upgrade-title">
                          <span>{tool.name}</span>
                          {count > 0 && <span className="upgrade-count-badge">x{count}</span>}
                        </h3>
                        <p className="upgrade-desc">{tool.desc}</p>
                      </div>
                    </div>
                    <button className="upgrade-buy-btn" disabled={!canAfford} onClick={() => buyTool(tool.id)} type="button" title={cost.toLocaleString()}>
                      <span>{formatVal(cost)}</span>
                      <span className="upgrade-cost-label">Palas</span>
                    </button>
                  </div>
                );
              })
            )}

            {shopTab === "collection" && (
              /* Gacha Spin & Collection */
              <div className="gacha-panel">
                <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>Lotería Folicular</div>
                <p className="upgrade-desc">Gastá {GACHA_COST} palas para tirar la ruleta de ítems coleccionables.</p>
                <div className={`gacha-wheel ${spinning ? "spinning" : ""}`}>
                  {spinning ? "🌀" : "🥚"}
                </div>
                
                <button className="action-btn gold-fill" disabled={palas < GACHA_COST || spinning} onClick={spinGacha} type="button">
                  {spinning ? "Girando..." : `Girar (${GACHA_COST} palas)`}
                </button>

                {spinResult && (
                  <div className="gacha-item-award">
                    ¡Ganaste <strong>{spinResult.name}</strong> {spinResult.emoji}!
                  </div>
                )}

                <div style={{ width: "100%", textAlign: "left", marginTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "8px" }}>Tu Colección:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {GACHA_ITEMS.map((item) => {
                      const count = inventory[item.id] || 0;
                      return (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: count > 0 ? "#fff" : "rgba(255,255,255,0.25)" }}>
                          <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <span>{item.emoji}</span>
                            <span>{item.name}</span>
                          </span>
                          <span style={{ fontWeight: 700 }}>x{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {shopTab === "casino" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Gambling Doble o Nada */}
                <div className="casino-panel">
                  <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>Doble o Nada</div>
                  <p className="upgrade-desc">Apostá un porcentaje de tus palas a cara o ceca de cabeza de pelado.</p>
                  <div style={{ fontSize: "0.75rem", color: "#ffc107", fontWeight: 700 }}>⚠️ Retención AFIP del 30% en premios ganados</div>
                  
                  <div className={`casino-coin ${flipping ? "flipping" : ""}`}>
                    {flipping ? "🪙" : "🥚"}
                  </div>

                  <div className="casino-bet-selector">
                    {[10, 25, 50].map((pct) => (
                      <button
                        key={pct}
                        className={`casino-bet-btn ${betPercent === pct ? "active" : ""}`}
                        onClick={() => setBetPercent(pct)}
                        disabled={flipping}
                        type="button"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <button
                    className="action-btn gold-fill"
                    disabled={palas <= 10 || flipping}
                    onClick={gambleFlip}
                    type="button"
                    title={Math.floor(palas * (betPercent / 100)).toLocaleString()}
                  >
                    {flipping ? "Girando..." : `Apostar ${formatVal(Math.floor(palas * (betPercent / 100)))} palas`}
                  </button>

                  {flipResult && !flipping && (
                    <div style={{ fontWeight: 800, fontSize: "0.9rem", color: flipResult === "win" ? "#4caf50" : "#f44336" }}>
                      {flipResult === "win" ? "¡Ganaste!" : "¡Perdiste!"}
                    </div>
                  )}
                </div>

                {/* Mercado Pago Loans */}
                <div className="casino-panel" style={{ border: loan.amount > 0 ? "1px solid #ff3b3b" : "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontWeight: 800, fontSize: "0.95rem", color: loan.amount > 0 ? "#ff3b3b" : "#fff" }}>
                    {loan.amount > 0 ? "🚨 Embargo de Mercado Pago" : "💸 Crédito Folicular Expreso"}
                  </div>
                  <p className="upgrade-desc">
                    {loan.amount > 0 
                      ? `Tenés un préstamo activo de ${formatVal(loan.amount)} palas.` 
                      : "Obtené un préstamo rápido para acelerar tu producción. Se devuelve el doble en 90 segundos."}
                  </p>
                  
                  {loan.amount > 0 ? (
                    <div className="loan-details-box" style={{ width: "100%", boxSizing: "border-box" }}>
                      <div style={{ fontSize: "0.8rem", color: isGarnished ? "#ff3b3b" : "#ffeb3b", fontWeight: 700 }}>
                        {isGarnished 
                          ? "⚠️ ¡CUENTA EMBARGADA! Clicks producen 50% menos." 
                          : `Tiempo restante: ${Math.max(0, Math.ceil((loan.dueTime - Date.now()) / 1000))}s`}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Total a pagar: {formatVal(isGarnished ? Math.floor(loan.amount * 2.4) : loan.amount * 2)} palas
                      </div>
                      <button
                        className="action-btn"
                        style={{ background: "#ff3b3b", color: "#fff", border: "none", marginTop: "8px", width: "100%" }}
                        disabled={palas < (isGarnished ? Math.floor(loan.amount * 2.4) : loan.amount * 2)}
                        onClick={payLoan}
                        type="button"
                      >
                        Liquidar Deuda
                      </button>
                    </div>
                  ) : (
                    <button
                      className="action-btn gold-outline"
                      onClick={takeLoan}
                      type="button"
                      style={{ width: "100%" }}
                    >
                      Solicitar Préstamo ({formatVal(Math.max(100000, Math.floor(palasPerSecond * 300)))} Palas)
                    </button>
                  )}
                </div>
              </div>
            )}

            {shopTab === "stocks" && (
              /* Stock Market Trading */
              <div className="stocks-container">
                <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "16px", padding: "12px", textAlign: "center", marginBottom: "8px" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--gold)" }}>📈 BOLSA FOLICULAR NACIONAL</div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>Los precios fluctúan cada 10s. ¡Especulá y ganá!</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {STOCKS_CONFIG.map((stock) => {
                    const price = stockPrices[stock.id] || stock.basePrice;
                    const owned = shares[stock.id] || 0;
                    const history = stockHistory[stock.id] || [price];
                    const prevPrice = history.length > 1 ? history[history.length - 2] : price;
                    const isUp = price >= prevPrice;
                    const pctChange = prevPrice > 0 ? ((price - prevPrice) / prevPrice * 100).toFixed(1) : "0.0";
                    const displayChange = isUp ? `+${pctChange}%` : `${pctChange}%`;

                    return (
                      <div key={stock.id} className="stock-card">
                        <div style={{ fontSize: "1.6rem" }}>{stock.emoji}</div>
                        <div className="stock-details">
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{stock.name}</span>
                            <span style={{ fontSize: "0.65rem", background: "rgba(255,255,255,0.08)", padding: "2px 4px", borderRadius: "4px", marginLeft: "6px", fontFamily: "monospace" }}>{stock.ticker}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", marginTop: "4px" }}>
                            <span style={{ fontSize: "1.1rem", fontWeight: 900, fontFamily: "monospace" }}>{formatVal(price)}</span>
                            <span className={`stock-trend-indicator ${isUp ? "stock-trend-up" : "stock-trend-down"}`}>
                              {isUp ? "▲" : "▼"} {displayChange}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            Tenés: <strong style={{ color: "#fff" }}>{owned}</strong> ({formatVal(owned * price)} palas en valor)
                          </div>
                        </div>

                        <div className="stock-actions">
                          <button
                            className="stock-action-btn buy"
                            disabled={palas < price}
                            onClick={() => buyStock(stock.id)}
                            type="button"
                          >
                            Comprar
                          </button>
                          <button
                            className="stock-action-btn sell"
                            disabled={owned === 0}
                            onClick={() => sellStock(stock.id)}
                            type="button"
                          >
                            Vender
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {shopTab === "prestige" && (
              /* Prestige Upgrades Shop (spending Brillo Capilar) */
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ background: "rgba(255, 235, 59, 0.03)", border: "1px solid rgba(255, 235, 59, 0.15)", borderRadius: "16px", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--gold)", marginBottom: "4px" }}>Tus Brillo Capilar</div>
                  <div style={{ fontSize: "2rem", fontWeight: 900, fontFamily: "monospace", color: "#fff" }} title={brillo.toLocaleString()}>{formatVal(brillo)} ✨</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {PRESTIGE_UPGRADES_CONFIG.map((upgrade) => {
                    const owned = prestigeUpgrades[upgrade.id] > 0;
                    const canAfford = brillo >= upgrade.cost;

                    return (
                      <div key={upgrade.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", border: owned ? "1px solid rgba(255, 235, 59, 0.2)" : "1px solid rgba(255,255,255,0.05)", borderRadius: "14px", padding: "10px 12px", gap: "10px" }}>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", flex: 1 }}>
                          <span style={{ fontSize: "1.4rem" }}>{upgrade.emoji}</span>
                          <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: owned ? "var(--gold)" : "#fff" }}>{upgrade.name}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.25 }}>{upgrade.desc}</span>
                          </div>
                        </div>

                        <button
                          className="upgrade-buy-btn"
                          disabled={owned || !canAfford}
                          onClick={() => buyPrestigeUpgrade(upgrade.id)}
                          type="button"
                          style={{ minWidth: "70px", padding: "6px" }}
                        >
                          {owned ? (
                            <span style={{ color: "var(--gold)" }}>Comprado</span>
                          ) : (
                            <>
                              <span>{upgrade.cost}</span>
                              <span style={{ fontSize: "0.6rem" }}>Brillo</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
