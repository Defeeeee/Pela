"use client";

import { quienSoy } from "./sesionCliente";

export const CLAVE_CHASE = "escapecv_highscore_chase";
export const CLAVE_DODGE = "escapecv_highscore_dodge";
export const CLAVE_CHASE_LEGACY = "escapecv_highscore";
export const CLAVE_AGARRA_MASS = "agarra_record_max_mass";
export const CLAVE_PELARDLE_STATS = "pelardle_stats_v1";

export const CLAVES_CLICKER = {
  palas: "clicker_palas_v6",
  upgrades: "clicker_upgrades_v6",
  tools: "clicker_tools_v6",
  inventory: "clicker_inventory_v6",
  brillo: "clicker_brillo_v6",
  prestigeUpgrades: "clicker_prestige_upgrades_v6",
  achievements: "clicker_achievements_v6",
  shares: "clicker_shares_v6",
  stockPrices: "clicker_stock_prices_v6",
  loan: "clicker_loan_v6",
  garnished: "clicker_garnished_v6",
};

/**
 * Lee los récords guardados en el almacenamiento local del navegador.
 */
export function obtenerRecordsLocales() {
  if (typeof window === "undefined") {
    return {
      escapecv: { chase: 0, dodge: 0 },
      agarra: { maxMass: 0 },
      pelardle: { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, lastPuzzle: null },
      clicker: null,
    };
  }

  let chase = 0;
  let dodge = 0;
  let agarraMass = 0;
  let pelardle = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, lastPuzzle: null };
  let clicker = null;

  try {
    chase = parseInt(localStorage.getItem(CLAVE_CHASE) || localStorage.getItem(CLAVE_CHASE_LEGACY) || "0", 10) || 0;
    dodge = parseInt(localStorage.getItem(CLAVE_DODGE) || "0", 10) || 0;
    agarraMass = parseInt(localStorage.getItem(CLAVE_AGARRA_MASS) || "0", 10) || 0;

    const rawPelardle = localStorage.getItem(CLAVE_PELARDLE_STATS);
    if (rawPelardle) {
      const parsed = JSON.parse(rawPelardle);
      pelardle = {
        played: Number(parsed.played) || 0,
        wins: Number(parsed.wins) || 0,
        currentStreak: Number(parsed.streak !== undefined ? parsed.streak : parsed.currentStreak) || 0,
        maxStreak: Number(parsed.maxStreak) || 0,
        lastPuzzle: parsed.lastPuzzle !== null && parsed.lastPuzzle !== undefined ? Number(parsed.lastPuzzle) : null,
      };
    }

    const rawPalas = localStorage.getItem(CLAVES_CLICKER.palas);
    if (rawPalas !== null) {
      const parseJson = (key) => {
        try {
          const item = localStorage.getItem(key);
          return item ? JSON.parse(item) : null;
        } catch (e) {
          return null;
        }
      };

      clicker = {
        palas: parseFloat(rawPalas) || 0,
        brillo: parseInt(localStorage.getItem(CLAVES_CLICKER.brillo) || "0", 10) || 0,
        upgrades: parseJson(CLAVES_CLICKER.upgrades) || {},
        tools: parseJson(CLAVES_CLICKER.tools) || {},
        inventory: parseJson(CLAVES_CLICKER.inventory) || {},
        prestigeUpgrades: parseJson(CLAVES_CLICKER.prestigeUpgrades) || {},
        achievements: parseJson(CLAVES_CLICKER.achievements) || {},
        shares: parseJson(CLAVES_CLICKER.shares) || {},
        stockPrices: parseJson(CLAVES_CLICKER.stockPrices) || {},
        loan: parseJson(CLAVES_CLICKER.loan) || {},
        isGarnished: localStorage.getItem(CLAVES_CLICKER.garnished) === "true",
      };
    }
  } catch (e) {
    // localStorage bloqueado
  }

  return {
    escapecv: { chase, dodge },
    agarra: { maxMass: agarraMass },
    pelardle,
    clicker,
  };
}

/**
 * Guarda los récords en localStorage preservando siempre el valor máximo para no perder progreso.
 */
export function guardarRecordsLocales(records) {
  if (typeof window === "undefined" || !records) return;

  try {
    // 1. EscapeCV
    if (records.escapecv) {
      const localChase = parseInt(localStorage.getItem(CLAVE_CHASE) || localStorage.getItem(CLAVE_CHASE_LEGACY) || "0", 10) || 0;
      const bestChase = Math.max(localChase, Number(records.escapecv.chase) || 0);
      localStorage.setItem(CLAVE_CHASE, bestChase.toString());

      const localDodge = parseInt(localStorage.getItem(CLAVE_DODGE) || "0", 10) || 0;
      const bestDodge = Math.max(localDodge, Number(records.escapecv.dodge) || 0);
      localStorage.setItem(CLAVE_DODGE, bestDodge.toString());
    }

    // 2. Agarrá.io
    if (records.agarra) {
      const localMass = parseInt(localStorage.getItem(CLAVE_AGARRA_MASS) || "0", 10) || 0;
      const bestMass = Math.max(localMass, Number(records.agarra.maxMass) || 0);
      localStorage.setItem(CLAVE_AGARRA_MASS, bestMass.toString());
    }

    // 3. Pelardle
    if (records.pelardle) {
      let localPelardle = {};
      try {
        const raw = localStorage.getItem(CLAVE_PELARDLE_STATS);
        if (raw) localPelardle = JSON.parse(raw);
      } catch (e) {}

      const rachaDelServidor = Number(
        records.pelardle.currentStreak !== undefined
          ? records.pelardle.currentStreak
          : records.pelardle.streak
      ) || 0;

      const mergedPelardle = {
        played: Math.max(Number(localPelardle.played) || 0, Number(records.pelardle.played) || 0),
        wins: Math.max(Number(localPelardle.wins) || 0, Number(records.pelardle.wins) || 0),
        maxStreak: Math.max(Number(localPelardle.maxStreak) || 0, Number(records.pelardle.maxStreak) || 0),
        // La racha en curso la manda el servidor tal cual, sin máximo: él es
        // el que cuenta los intentos, así que sabe si sigue viva. Tomar el
        // máximo contra el localStorage mostraba una racha ya cortada en
        // cualquier dispositivo que hubiera quedado viejo.
        streak: rachaDelServidor,
        currentStreak: rachaDelServidor,
        lastPuzzle: records.pelardle.lastPuzzle !== null && records.pelardle.lastPuzzle !== undefined ? Number(records.pelardle.lastPuzzle) : localPelardle.lastPuzzle,
      };

      localStorage.setItem(CLAVE_PELARDLE_STATS, JSON.stringify(mergedPelardle));
    }

    // 4. Clicker
    if (records.clicker && typeof records.clicker === "object") {
      const inc = records.clicker;
      const localPalas = parseFloat(localStorage.getItem(CLAVES_CLICKER.palas) || "0") || 0;
      const localBrillo = parseInt(localStorage.getItem(CLAVES_CLICKER.brillo) || "0", 10) || 0;

      const incBrillo = Number(inc.brillo) || 0;
      const bestBrillo = Math.max(localBrillo, incBrillo);
      const bestPalas = incBrillo > localBrillo ? (Number(inc.palas) || 0) : (localBrillo > incBrillo ? localPalas : Math.max(localPalas, Number(inc.palas) || 0));

      localStorage.setItem(CLAVES_CLICKER.palas, bestPalas.toString());
      localStorage.setItem(CLAVES_CLICKER.brillo, bestBrillo.toString());

      const mergeJsonLocal = (key, incObj) => {
        if (!incObj) return;
        try {
          const cur = JSON.parse(localStorage.getItem(key) || "{}");
          const merged = { ...cur };
          for (const [k, v] of Object.entries(incObj)) {
            if (typeof v === "number") {
              merged[k] = Math.max(Number(merged[k]) || 0, Number(v) || 0);
            } else if (typeof v === "boolean") {
              if (v) merged[k] = true;
            } else {
              merged[k] = merged[k] || v;
            }
          }
          localStorage.setItem(key, JSON.stringify(merged));
        } catch (e) {}
      };

      mergeJsonLocal(CLAVES_CLICKER.upgrades, inc.upgrades);
      mergeJsonLocal(CLAVES_CLICKER.tools, inc.tools);
      mergeJsonLocal(CLAVES_CLICKER.inventory, inc.inventory);
      mergeJsonLocal(CLAVES_CLICKER.achievements, inc.achievements);
      mergeJsonLocal(CLAVES_CLICKER.prestigeUpgrades, inc.prestigeUpgrades);
      if (inc.shares && !localStorage.getItem(CLAVES_CLICKER.shares)) {
        localStorage.setItem(CLAVES_CLICKER.shares, JSON.stringify(inc.shares));
      }
      if (inc.stockPrices && !localStorage.getItem(CLAVES_CLICKER.stockPrices)) {
        localStorage.setItem(CLAVES_CLICKER.stockPrices, JSON.stringify(inc.stockPrices));
      }
    }
  } catch (e) {
    // localStorage falló
  }

  // Notificar a cualquier componente abierto
  try {
    window.dispatchEvent(new CustomEvent("pela_records_sync", { detail: records }));
  } catch (e) {}
}

/**
 * Sincroniza con el servidor. Si el usuario está logueado, envía los récords locales
 * (o los parciales recién conseguidos), el servidor fusiona con la cuenta quedándose
 * con el mejor valor de cada uno, y se actualiza el localStorage de inmediato.
 */
export async function sincronizarRecords(parciales = null) {
  if (typeof window === "undefined") return { autenticado: false, records: null };

  const locales = obtenerRecordsLocales();

  // Fusionar parciales antes de enviar si vinieron
  const paraEnviar = {
    escapecv: {
      chase: Math.max(locales.escapecv.chase, Number(parciales?.escapecv?.chase) || 0),
      dodge: Math.max(locales.escapecv.dodge, Number(parciales?.escapecv?.dodge) || 0),
    },
    agarra: {
      maxMass: Math.max(locales.agarra.maxMass, Number(parciales?.agarra?.maxMass) || 0),
    },
    pelardle: parciales?.pelardle ? { ...locales.pelardle, ...parciales.pelardle } : locales.pelardle,
    clicker: parciales?.clicker || locales.clicker,
  };

  // Guardar inmediatamente en local por si acaso
  guardarRecordsLocales(paraEnviar);

  const yo = await quienSoy();
  if (!yo || !yo.autenticado) {
    return { autenticado: false, records: paraEnviar };
  }

  try {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: paraEnviar }),
    });

    if (!res.ok) {
      return { autenticado: true, records: paraEnviar };
    }

    const datos = await res.json();
    if (datos?.records) {
      guardarRecordsLocales(datos.records);
      return { autenticado: true, records: datos.records };
    }
  } catch (e) {
    // Falló la red, seguimos con local
  }

  return { autenticado: true, records: paraEnviar };
}

/**
 * Obtiene los récords del usuario (del servidor si está autenticado, o locales si no).
 */
export async function cargarRecords() {
  if (typeof window === "undefined") return { autenticado: false, records: null };

  const yo = await quienSoy();
  if (!yo || !yo.autenticado) {
    return { autenticado: false, records: obtenerRecordsLocales() };
  }

  try {
    const res = await fetch("/api/records", { cache: "no-store" });
    if (res.ok) {
      const datos = await res.json();
      if (datos?.records) {
        guardarRecordsLocales(datos.records);
        return { autenticado: true, records: datos.records };
      }
    }
  } catch (e) {}

  return { autenticado: true, records: obtenerRecordsLocales() };
}
