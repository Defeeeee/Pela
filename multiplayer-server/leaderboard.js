import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, "..", "data");
const SAVE_DEBOUNCE_MS = 2000;
const MAX_SAVED_PUZZLES = 30;
const MAX_HISTORY_PLAYERS = 500;

function sanitizeName(name) {
  const trimmed = String(name || "").trim().slice(0, 16);
  return trimmed || "Pelado Anónimo";
}

export class LeaderboardStore {
  constructor(options = {}) {
    const dataDir = options.dataDir || process.env.MP_DATA_DIR || DEFAULT_DATA_DIR;
    this.filePath = path.join(dataDir, "leaderboard.json");
    this.dirPath = dataDir;

    // Estado en memoria
    this.daily = {}; // puzzleId -> [ { playerId, playerName, attempts, solved, solvedAt } ]
    this.history = {}; // playerId -> { playerId, playerName, gamesPlayed, gamesWon, currentStreak, maxStreak, lastPuzzle }
    this.inProgress = new Map(); // `${puzzle}_${playerId}` -> { attemptsCount, guesses, solved, finished }

    this.saveTimeout = null;
    this.isSaving = false;
    this.needsSave = false;
  }

  async init() {
    try {
      if (!fs.existsSync(this.dirPath)) {
        fs.mkdirSync(this.dirPath, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            this.daily = parsed.daily || {};
            this.history = parsed.history || {};
          }
        } catch (parseErr) {
          console.error("[leaderboard] Archivo JSON corrupto. Creando respaldo y reiniciando...", parseErr);
          const backup = `${this.filePath}.corrupto.${Date.now()}`;
          try {
            fs.renameSync(this.filePath, backup);
          } catch (e) {
            console.error("[leaderboard] Error renombrando archivo corrupto:", e);
          }
          this.daily = {};
          this.history = {};
        }
      }
    } catch (err) {
      console.error("[leaderboard] Error inicializando almacenamiento:", err);
    }
  }

  clearSaveTimer() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }

  scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.flushToDisk().catch((err) => {
        console.error("[leaderboard] Error guardando a disco:", err);
      });
    }, SAVE_DEBOUNCE_MS);
  }

  async flushToDisk() {
    this.clearSaveTimer();
    if (this.isSaving) {
      this.needsSave = true;
      return;
    }
    this.isSaving = true;

    try {
      if (!fs.existsSync(this.dirPath)) {
        await fs.promises.mkdir(this.dirPath, { recursive: true });
      }
      // 1. Podar días viejos (máximo 30 puzzles)
      const puzzleKeys = Object.keys(this.daily).sort((a, b) => Number(a) - Number(b));
      if (puzzleKeys.length > MAX_SAVED_PUZZLES) {
        const toDelete = puzzleKeys.slice(0, puzzleKeys.length - MAX_SAVED_PUZZLES);
        for (const k of toDelete) {
          delete this.daily[k];
        }
      }

      // 2. Podar historial general (máximo 500 jugadores destacados)
      const historyEntries = Object.entries(this.history);
      if (historyEntries.length > MAX_HISTORY_PLAYERS) {
        historyEntries.sort((a, b) => (b[1].gamesWon - a[1].gamesWon) || (b[1].maxStreak - a[1].maxStreak));
        const pruned = {};
        for (const [id, stats] of historyEntries.slice(0, MAX_HISTORY_PLAYERS)) {
          pruned[id] = stats;
        }
        this.history = pruned;
      }

      const payload = JSON.stringify({
        updatedAt: new Date().toISOString(),
        daily: this.daily,
        history: this.history,
      });

      const tempFile = `${this.filePath}.tmp.${Date.now()}`;
      await fs.promises.writeFile(tempFile, payload, "utf-8");
      await fs.promises.rename(tempFile, this.filePath);
    } finally {
      this.isSaving = false;
      if (this.needsSave) {
        this.needsSave = false;
        await this.flushToDisk();
      }
    }
  }

  registerAttempt({ puzzle, playerId, playerName, guess, solved }) {
    if (!puzzle || !playerId) {
      return { error: "Faltan puzzle o playerId", attempt: 1 };
    }

    const pz = String(puzzle);
    const pId = String(playerId);
    const cleanName = sanitizeName(playerName);
    const key = `${pz}_${pId}`;

    let record = this.inProgress.get(key);
    if (!record) {
      record = {
        attemptsCount: 0,
        guesses: [],
        solved: false,
        finished: false,
      };
      this.inProgress.set(key, record);
    }

    // Si ya había terminado este puzzle, rechazar nuevos intentos para no alterar posición
    if (record.finished) {
      return {
        ok: true,
        attempt: record.attemptsCount,
        solved: record.solved,
        finished: true,
        alreadyFinished: true,
      };
    }

    record.attemptsCount += 1;
    record.guesses.push(guess);

    if (solved) {
      record.solved = true;
      record.finished = true;
      this.recordCompletion(pz, pId, cleanName, record.attemptsCount, true);
    } else if (record.attemptsCount >= 6) {
      record.finished = true;
      this.recordCompletion(pz, pId, cleanName, record.attemptsCount, false);
    }

    this.scheduleSave();

    return {
      ok: true,
      attempt: record.attemptsCount,
      solved: record.solved,
      finished: record.finished,
    };
  }

  recordCompletion(puzzle, playerId, playerName, attempts, solved) {
    // 1. Ranking del Día
    if (!this.daily[puzzle]) {
      this.daily[puzzle] = [];
    }

    const existingIdx = this.daily[puzzle].findIndex((e) => e.playerId === playerId);
    const entry = {
      playerId,
      playerName,
      attempts,
      solved,
      solvedAt: Date.now(),
    };

    if (existingIdx >= 0) {
      this.daily[puzzle][existingIdx] = entry;
    } else {
      this.daily[puzzle].push(entry);
    }

    // Ordenar ranking diario:
    // 1. Ganadores primero
    // 2. Menor cantidad de intentos (ej. en 2 intentos gana sobre 4 intentos)
    // 3. Menor tiempo / quien lo resolvió antes
    this.daily[puzzle].sort((a, b) => {
      if (a.solved !== b.solved) return b.solved ? 1 : -1;
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      return a.solvedAt - b.solvedAt;
    });

    // 2. Historial Acumulado
    if (!this.history[playerId]) {
      this.history[playerId] = {
        playerId,
        playerName,
        gamesPlayed: 0,
        gamesWon: 0,
        currentStreak: 0,
        maxStreak: 0,
        lastPuzzle: null,
      };
    }

    const h = this.history[playerId];
    h.playerName = playerName; // actualizar nombre en caso de que lo haya cambiado

    // Solo actualizar racha si no habíamos registrado ya este mismo puzzle
    if (h.lastPuzzle !== puzzle) {
      h.gamesPlayed += 1;
      h.lastPuzzle = puzzle;

      if (solved) {
        h.gamesWon += 1;
        h.currentStreak += 1;
        if (h.currentStreak > h.maxStreak) {
          h.maxStreak = h.currentStreak;
        }
      } else {
        h.currentStreak = 0;
      }
    }
  }

  getBoard(puzzle) {
    const pz = String(puzzle || "");
    const dailyRaw = this.daily[pz] || [];

    const daily = dailyRaw.map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      playerName: entry.playerName,
      attempts: entry.attempts,
      solved: entry.solved,
      solvedAt: entry.solvedAt,
    }));

    // Histórico ordenado: más victorias, luego mayor racha
    const history = Object.values(this.history)
      .sort((a, b) => (b.gamesWon - a.gamesWon) || (b.maxStreak - a.maxStreak) || (b.gamesPlayed - a.gamesPlayed))
      .slice(0, 100)
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        gamesPlayed: entry.gamesPlayed,
        gamesWon: entry.gamesWon,
        currentStreak: entry.currentStreak,
        maxStreak: entry.maxStreak,
      }));

    return {
      puzzle: pz,
      daily,
      history,
    };
  }
}
