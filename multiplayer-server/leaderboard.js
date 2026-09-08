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
    this.cuentas = {}; // googleSub -> { playerId, email, vinculadaEn }
    // apodo en minúsculas -> { playerId, apodo }. Guarda también la forma con
    // mayúsculas porque ése es el nombre canónico que se muestra: leerlo del
    // historial sería circular, ya que el historial es justo lo que el cliente
    // puede intentar pisar.
    this.apodos = {};
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
            this.cuentas = parsed.cuentas || {};
            this.apodos = parsed.apodos || {};
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
          this.cuentas = {};
          this.apodos = {};
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

      // 1b. Podar los intentos en curso con el mismo criterio de retención.
      // inProgress no se persiste, pero vive en un proceso que corre meses:
      // sin esto acumula un registro por cada par (puzzle, jugador) para
      // siempre, con el array de intentos adentro.
      this.podarEnCurso();

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
        cuentas: this.cuentas,
        apodos: this.apodos,
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

  /**
   * Descarta los intentos en curso de puzzles más viejos que la ventana de
   * retención. La clave es `${puzzle}_${playerId}` y el puzzle es numérico,
   * así que el primer guión bajo siempre separa bien aunque el id traiga otros.
   */
  podarEnCurso() {
    let puzzleMax = 0;
    for (const key of this.inProgress.keys()) {
      const n = Number(key.slice(0, key.indexOf("_")));
      if (Number.isFinite(n) && n > puzzleMax) puzzleMax = n;
    }

    const corte = puzzleMax - MAX_SAVED_PUZZLES;
    if (corte <= 0) return;

    for (const key of [...this.inProgress.keys()]) {
      const n = Number(key.slice(0, key.indexOf("_")));
      if (Number.isFinite(n) && n < corte) this.inProgress.delete(key);
    }
  }

  /**
   * Ata una cuenta de Google a una identidad de jugador.
   *
   * Si el navegador ya venía jugando como anónimo, esa identidad se adopta en
   * vez de crear una nueva: así la racha y las victorias que ya estaban
   * guardadas bajo ese id pasan a ser de la cuenta. Es la migración.
   *
   * Reglas de conflicto:
   * - Si la cuenta ya estaba vinculada, gana el vínculo existente. Entrar
   *   desde otro navegador no te cambia de identidad ni te roba la del otro.
   * - Un id anónimo que ya pertenece a otra cuenta no se adopta (dos personas
   *   compartiendo una computadora); se crea una identidad nueva.
   */
  vincularCuenta({ googleSub, email, nombreGoogle, playerIdAnonimo }) {
    if (!googleSub) return { error: "Falta googleSub" };
    const sub = String(googleSub);

    const yaVinculada = this.cuentas[sub];
    if (yaVinculada) {
      const h = this.history[yaVinculada.playerId];
      return {
        playerId: yaVinculada.playerId,
        // El nombre de la sesión es el apodo RESERVADO, no el que quedó en el
        // historial: ese pudo haberlo tipeado cualquiera desde el navegador y
        // no es dueño de nada. Sin apodo reservado, la sesión arranca sin
        // nombre y la UI obliga a elegir uno.
        apodo: this.apodoDe(yaVinculada.playerId),
        sugerencia: h?.playerName || null,
        nueva: false,
      };
    }

    const reclamadosPorOtros = new Set(Object.values(this.cuentas).map((c) => c.playerId));
    const anonimo = playerIdAnonimo ? String(playerIdAnonimo) : null;
    const puedeAdoptar = anonimo && !reclamadosPorOtros.has(anonimo);

    const playerId = puedeAdoptar ? anonimo : `u_${sub}`;

    this.cuentas[sub] = { playerId, email: email || null, vinculadaEn: Date.now() };

    const h = this.history[playerId];
    if (h && nombreGoogle && !h.playerName) h.playerName = sanitizeName(nombreGoogle);

    this.scheduleSave();
    return {
      playerId,
      apodo: this.apodoDe(playerId),
      // Lo que venía usando en el navegador sirve como propuesta para el
      // cuadro de elección, pero no se le adjudica solo.
      sugerencia: h?.playerName || (nombreGoogle ? sanitizeName(nombreGoogle) : null),
      nueva: !puedeAdoptar,
      adoptoAnonimo: Boolean(puedeAdoptar),
    };
  }

  /**
   * Importa lo que el navegador tenía guardado, para quien venía jugando desde
   * antes de que existiera el leaderboard: esas rachas sólo viven en su
   * localStorage y el servidor no las tiene.
   *
   * La racha del cliente NO se puede verificar, así que sólo se acepta si está
   * viva: el último puzzle jugado tiene que ser el de hoy o el del día hábil
   * anterior. Una racha vieja ya estaba cortada igual, y fabricar una requiere
   * haber venido jugando de verdad. Los contadores acumulados se toman por el
   * máximo para no hacer perder nada a quien ya tenía historia en el servidor.
   */
  importarProgresoLocal({ playerId, puzzleActual, stats }) {
    if (!playerId || !stats) return { error: "Faltan playerId o stats" };
    const pId = String(playerId);
    const actual = Number(puzzleActual);

    const previo = this.history[pId] || {
      playerId: pId,
      playerName: null,
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastPuzzle: null,
    };

    const ultimo = Number(stats.lastPuzzle);
    const rachaViva =
      Number.isFinite(ultimo) && Number.isFinite(actual) && (ultimo === actual || ultimo === actual - 1);

    const importada = rachaViva ? Math.max(0, Number(stats.streak) || 0) : 0;

    previo.gamesPlayed = Math.max(previo.gamesPlayed, Number(stats.played) || 0);
    previo.gamesWon = Math.max(previo.gamesWon, Number(stats.wins) || 0);
    previo.maxStreak = Math.max(previo.maxStreak, Number(stats.maxStreak) || 0, importada);
    previo.currentStreak = Math.max(previo.currentStreak, importada);
    if (Number.isFinite(ultimo)) {
      previo.lastPuzzle = Math.max(Number(previo.lastPuzzle) || 0, ultimo);
    }

    this.history[pId] = previo;
    this.scheduleSave();
    return { ok: true, rachaImportada: importada, rachaViva, historial: previo };
  }

  /**
   * Reserva un apodo para una identidad. Un apodo tiene un solo dueño: es lo
   * que impide que otro se haga pasar por vos en el ranking y en el multi.
   */
  reservarApodo({ playerId, apodo }) {
    if (!playerId || !apodo) return { error: "Faltan playerId o apodo" };
    const pId = String(playerId);
    const limpio = sanitizeName(apodo);
    const clave = limpio.toLowerCase();

    const dueño = this.apodos[clave];
    if (dueño && dueño.playerId !== pId) return { error: "Ese apodo ya está tomado.", apodo: limpio };

    // Liberar el apodo anterior de este jugador, si cambió.
    for (const [k, v] of Object.entries(this.apodos)) {
      if (v.playerId === pId && k !== clave) delete this.apodos[k];
    }

    this.apodos[clave] = { playerId: pId, apodo: limpio };
    if (!this.history[pId]) {
      this.history[pId] = {
        playerId: pId,
        playerName: limpio,
        gamesPlayed: 0,
        gamesWon: 0,
        currentStreak: 0,
        maxStreak: 0,
        lastPuzzle: null,
      };
    } else {
      this.history[pId].playerName = limpio;
    }

    this.scheduleSave();
    return { ok: true, apodo: limpio };
  }

  /** Apodo reservado por una identidad, o null si todavía no eligió ninguno. */
  apodoDe(playerId) {
    const pId = String(playerId);
    for (const registro of Object.values(this.apodos)) {
      if (registro.playerId === pId) return registro.apodo;
    }
    return null;
  }

  /** Una identidad tiene cuenta si algún googleSub la reclamó. */
  tieneCuenta(playerId) {
    return Object.values(this.cuentas).some((c) => c.playerId === playerId);
  }

  registerAttempt({ puzzle, playerId, playerName, guess, solved }) {
    if (!puzzle || !playerId) {
      return { error: "Faltan puzzle o playerId", attempt: 1 };
    }

    const pz = String(puzzle);
    const pId = String(playerId);
    // Mismo criterio que en updatePlayerName: si la identidad tiene apodo
    // reservado, ése es el nombre que vale, venga lo que venga en el cuerpo
    // del pedido. Es lo que impide entrar al ranking con el nombre de otro.
    const cleanName = this.apodoDe(pId) || sanitizeName(playerName);
    const key = `${pz}_${pId}`;

    let record = this.inProgress.get(key);
    if (!record) {
      record = {
        attemptsCount: 0,
        guesses: [],
        solved: false,
        finished: false,
      };

      // El guard de "ya terminaste" vive en memoria, pero este proceso se
      // reinicia en cada deploy. Sin reconstruirlo desde el ranking ya
      // persistido, quien resolvió hoy podía volver a jugar sabiendo la
      // palabra y pisar su propio 5/6 con un 1/6.
      const yaRegistrado = (this.daily[pz] || []).find((e) => e.playerId === pId);
      if (yaRegistrado) {
        record.attemptsCount = yaRegistrado.attempts;
        record.solved = yaRegistrado.solved;
        record.finished = true;
      }

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

    // El puzzle llega como string desde la ruta HTTP; se normaliza a número
    // porque abajo hace falta compararlo con el día hábil anterior.
    const puzzleNum = Number(puzzle);
    const ultimoNum = h.lastPuzzle === null || h.lastPuzzle === undefined ? null : Number(h.lastPuzzle);

    // Solo actualizar racha si no habíamos registrado ya este mismo puzzle
    if (ultimoNum !== puzzleNum) {
      h.gamesPlayed += 1;

      if (solved) {
        h.gamesWon += 1;
        // La racha se corta si te salteaste algún día hábil. Sin esta
        // comparación sería simplemente el total de victorias, y mostraría
        // un número distinto al que calcula el cliente en el mismo modal.
        const consecutivo = ultimoNum === puzzleNum - 1;
        h.currentStreak = consecutivo ? h.currentStreak + 1 : 1;
        if (h.currentStreak > h.maxStreak) {
          h.maxStreak = h.currentStreak;
        }
      } else {
        h.currentStreak = 0;
      }

      h.lastPuzzle = puzzleNum;
    }
  }

  updatePlayerName(playerId, newName) {
    if (!playerId) {
      return { ok: false, error: "Falta playerId" };
    }
    const clean = sanitizeName(newName);
    const pId = String(playerId);

    // Un apodo reservado no se cambia por acá. Este camino recibe el nombre
    // que tipeó el navegador, sin sesión que lo respalde: si lo dejara pasar,
    // el apodo con dueño se podría pisar mandando un POST, y reservarlo no
    // significaría nada. Para cambiarlo está /cuentas/apodo, que sí exige
    // sesión y vuelve a chequear que no lo tenga otro.
    const reservado = this.apodoDe(pId);
    if (reservado) {
      return { ok: false, error: "Tu apodo lo cambiás desde tu cuenta.", playerName: reservado };
    }

    let updated = false;

    // 1. Actualizar en historial
    if (this.history[pId]) {
      this.history[pId].playerName = clean;
      updated = true;
    }

    // 2. Actualizar en todos los registros diarios almacenados
    for (const pz of Object.keys(this.daily)) {
      const entries = this.daily[pz];
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (entry.playerId === pId) {
            entry.playerName = clean;
            updated = true;
          }
        }
      }
    }

    this.scheduleSave();
    return { ok: true, playerName: clean, updated };
  }

  /**
   * Identidades que pueden aparecer en el ranking: las que tienen cuenta de
   * Google Y apodo reservado.
   *
   * Se piden las dos cosas porque cada una resuelve un problema distinto: la
   * cuenta hace que el puesto sea de una persona y no de un localStorage que
   * se limpia y vuelve a empezar; el apodo reservado hace que el nombre que se
   * muestra tenga dueño y nadie pueda ponerse el de otro.
   *
   * Se arma el conjunto una vez por consulta: `tieneCuenta` recorre todas las
   * cuentas, y llamarlo por cada fila sería cuadrático.
   */
  idsRankeables() {
    const conApodo = new Set(Object.values(this.apodos).map((r) => r.playerId));
    const rankeables = new Set();
    for (const cuenta of Object.values(this.cuentas)) {
      if (conApodo.has(cuenta.playerId)) rankeables.add(cuenta.playerId);
    }
    return rankeables;
  }

  getBoard(puzzle) {
    const pz = String(puzzle || "");
    const rankeables = this.idsRankeables();
    const dailyRaw = this.daily[pz] || [];

    // El puesto se numera DESPUÉS de filtrar: si no, quedarían huecos (1, 3,
    // 7...) donde estaban los anónimos y el ranking se leería mal.
    const daily = dailyRaw
      .filter((entry) => rankeables.has(entry.playerId))
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        attempts: entry.attempts,
        solved: entry.solved,
        solvedAt: entry.solvedAt,
      }));

    // Histórico ordenado: más victorias, luego mayor racha
    const history = Object.values(this.history)
      .filter((entry) => rankeables.has(entry.playerId))
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
