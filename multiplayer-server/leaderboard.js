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

/**
 * Normaliza un handle: el nombre con el que alguien aparece en el ranking y en
 * su legajo público.
 *
 * No es un nombre libre como el que se pone en una partida: es un
 * identificador con dueño y va en la URL del perfil (/p/handle). Por eso no
 * lleva espacios — un identificador con espacios obliga a andar percent-
 * encodeando el link para compartirlo y hace que "Juan  Domingo" y
 * "Juan Domingo" parezcan el mismo y no lo sean.
 *
 * Los espacios se convierten en guión bajo en vez de borrarse para que un
 * handle viejo siga siendo reconocible después de migrarlo.
 *
 * Se dejan pasar acentos y la Ñ: el sitio es en castellano y no hay razón para
 * que alguien no pueda llamarse Ñoño. La unicidad sigue siendo sin distinguir
 * mayúsculas, como antes.
 *
 * Devuelve null si no queda nada usable, y el llamador decide qué contestar.
 */
export function sanitizarHandle(bruto) {
  const texto = String(bruto || "").trim();
  if (!texto) return null;

  const limpio = texto
    .replace(/\s+/g, "_")                          // espacios -> guión bajo
    .replace(/[^\p{L}\p{N}_-]/gu, "")              // fuera todo lo demás
    .replace(/_{2,}/g, "_")                        // sin guiones bajos repetidos
    .replace(/^[_-]+|[_-]+$/g, "")                 // ni al principio ni al final
    .slice(0, 16);

  return limpio.length >= 2 ? limpio : null;
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
    this.records = {}; // playerId -> { escapecv, agarra, clicker, updatedAt }
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
            this.records = parsed.records || {};
            this.migrarHandles();
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
          this.records = {};
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
        records: this.records,
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
    const limpio = sanitizarHandle(apodo);
    if (!limpio) {
      return { error: "El handle va de 2 a 16 caracteres, sin espacios ni símbolos raros." };
    }
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

  /**
   * Pasa a handle los apodos guardados antes de que existiera la regla.
   *
   * Corre en cada arranque y es idempotente: un handle que ya cumple queda
   * igual. Se hace acá y no con un script suelto porque el archivo de datos
   * vive en el servidor, fuera del repo, y no hay ningún paso de deploy donde
   * meter una migración; que se arregle sola al levantar es lo único que no
   * depende de que alguien se acuerde de correrla.
   *
   * El nombre nuevo también se propaga al historial y al ranking diario: ahí
   * está copiado el nombre que se muestra, y si no se actualizara el legajo
   * diría una cosa y la tabla otra.
   */
  migrarHandles() {
    const renombrados = [];

    for (const [claveVieja, registro] of Object.entries(this.apodos)) {
      const actual = registro?.apodo;
      if (!actual) continue;

      const nuevo = sanitizarHandle(actual);
      if (!nuevo || nuevo === actual) continue;

      // Si el handle migrado choca con otro que ya existe, se numera. Es raro,
      // pero perder el apodo de alguien por una colisión lo sería más.
      let candidato = nuevo;
      let n = 2;
      while (
        this.apodos[candidato.toLowerCase()] &&
        this.apodos[candidato.toLowerCase()].playerId !== registro.playerId
      ) {
        candidato = `${nuevo.slice(0, 14)}_${n++}`;
      }

      delete this.apodos[claveVieja];
      this.apodos[candidato.toLowerCase()] = { playerId: registro.playerId, apodo: candidato };

      if (this.history[registro.playerId]) {
        this.history[registro.playerId].playerName = candidato;
      }
      for (const entradas of Object.values(this.daily)) {
        if (!Array.isArray(entradas)) continue;
        for (const e of entradas) {
          if (e.playerId === registro.playerId) e.playerName = candidato;
        }
      }

      renombrados.push(`${actual} -> ${candidato}`);
    }

    if (renombrados.length) {
      console.log(`[leaderboard] Handles migrados: ${renombrados.join(", ")}`);
      this.scheduleSave();
    }
  }

  /** Apodo reservado por una identidad, o null si todavía no eligió ninguno. */
  apodoDe(playerId) {
    const pId = String(playerId);
    for (const registro of Object.values(this.apodos)) {
      if (registro.playerId === pId) return registro.apodo;
    }
    return null;
  }

  /**
   * Datos públicos de un jugador, buscado por su apodo.
   *
   * Muestra sólo lo que el servidor mide por su cuenta: las estadísticas de
   * Pelardle (él cuenta los intentos) y la mayor masa del Agarrá (él simula la
   * arena). Los récords de EscapeCV y del Clicker quedan afuera a propósito:
   * son juegos de un solo jugador que corren enteros en el navegador, así que
   * su valor es el que el navegador dice, y una página pública que los
   * mostrara estaría publicando un número que cualquiera se puede poner.
   *
   * Tampoco sale el email ni el googleSub: el apodo es la única identidad
   * pública que eligió la persona.
   */
  perfilPublico(apodo) {
    if (!apodo) return null;
    // Se normaliza lo que viene en la URL con la misma regla del handle, así
    // un link viejo con espacios (/p/Juan%20Domingo) sigue llevando al legajo
    // que ahora se llama Juan_Domingo.
    const clave = sanitizarHandle(apodo);
    const registro = clave ? this.apodos[clave.toLowerCase()] : null;
    if (!registro) return null;

    const pId = registro.playerId;
    const h = this.history[pId] || {};
    const rec = this.records[pId] || {};

    // Puesto en el histórico, con el mismo orden y filtro que el ranking.
    const rankeables = this.idsRankeables();
    const orden = Object.values(this.history)
      .filter((e) => rankeables.has(e.playerId))
      .sort((a, b) => (b.gamesWon - a.gamesWon) || (b.maxStreak - a.maxStreak) || (b.gamesPlayed - a.gamesPlayed));
    const puesto = orden.findIndex((e) => e.playerId === pId);

    return {
      apodo: registro.apodo,
      pelardle: {
        played: Number(h.gamesPlayed) || 0,
        wins: Number(h.gamesWon) || 0,
        currentStreak: Number(h.currentStreak) || 0,
        maxStreak: Number(h.maxStreak) || 0,
      },
      agarra: { maxMass: Number(rec.agarra?.maxMass) || 0 },
      puestoHistorico: puesto >= 0 ? puesto + 1 : null,
      deCuantos: orden.length,
    };
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

  /**
   * Obtiene los récords y estadísticas unificadas de un jugador para todos los juegos.
   */
  getRecords(playerId) {
    if (!playerId) return null;
    const pId = String(playerId);
    const rec = this.records[pId] || {};
    const h = this.history[pId] || {};

    return {
      escapecv: {
        chase: Number(rec.escapecv?.chase) || 0,
        dodge: Number(rec.escapecv?.dodge) || 0,
      },
      agarra: {
        maxMass: Number(rec.agarra?.maxMass) || 0,
      },
      pelardle: {
        played: Number(h.gamesPlayed) || 0,
        wins: Number(h.gamesWon) || 0,
        currentStreak: Number(h.currentStreak) || 0,
        maxStreak: Number(h.maxStreak) || 0,
        lastPuzzle: h.lastPuzzle !== null && h.lastPuzzle !== undefined ? Number(h.lastPuzzle) : null,
      },
      clicker: rec.clicker || null,
      updatedAt: rec.updatedAt || null,
    };
  }

  /**
   * Sincroniza y fusiona récords recibidos con los que ya tiene la cuenta.
   * Regla de oro: Se conserva SIEMPRE el mejor valor (máximo) entre el actual
   * del dispositivo y el guardado en la sesión, para que nadie pierda progreso.
   */
  updateRecords(playerId, incoming, { deConfianza = false } = {}) {
    if (!playerId) return { error: "Falta playerId" };
    const pId = String(playerId);

    if (!this.records[pId]) {
      this.records[pId] = {};
    }
    const current = this.records[pId];

    // 1. EscapeCV: se guarda el mejor (máximo) puntaje en cada modo
    if (incoming?.escapecv) {
      const incomingChase = Number(incoming.escapecv.chase) || 0;
      const incomingDodge = Number(incoming.escapecv.dodge) || 0;
      const currentChase = Number(current.escapecv?.chase) || 0;
      const currentDodge = Number(current.escapecv?.dodge) || 0;

      current.escapecv = {
        chase: Math.max(currentChase, incomingChase),
        dodge: Math.max(currentDodge, incomingDodge),
      };
    }

    // 2. Agarrá.io: la mayor masa alcanzada.
    //
    //    Este dato lo escribe el servidor de la arena, que es quien simula la
    //    partida (ver anotarRecord en agarra.js). Del navegador sólo se acepta
    //    la PRIMERA vez, para no hacerle perder el récord a quien ya venía
    //    jugando sin cuenta; después manda lo medido. Sin ese corte, cualquiera
    //    con sesión se ponía la masa que quisiera con un POST.
    if (incoming?.agarra) {
      const currentMass = Number(current.agarra?.maxMass) || 0;
      const incomingMass = Number(incoming.agarra.maxMass) || 0;
      const esMigracion = currentMass === 0;

      if (deConfianza || esMigracion) {
        current.agarra = { maxMass: Math.max(currentMass, incomingMass) };
      }
    }

    // 3. Pelardle: se sincroniza con this.history[pId]
    if (incoming?.pelardle) {
      if (!this.history[pId]) {
        this.history[pId] = {
          playerId: pId,
          playerName: this.apodoDe(pId) || null,
          gamesPlayed: 0,
          gamesWon: 0,
          currentStreak: 0,
          maxStreak: 0,
          lastPuzzle: null,
        };
      }
      const h = this.history[pId];
      const inc = incoming.pelardle;

      // Los acumulados van por el máximo: sólo crecen, así que fusionarlos
      // entre dispositivos no puede hacer perder nada.
      h.gamesPlayed = Math.max(h.gamesPlayed || 0, Number(inc.played) || 0);
      h.gamesWon = Math.max(h.gamesWon || 0, Number(inc.wins) || 0);
      h.maxStreak = Math.max(h.maxStreak || 0, Number(inc.maxStreak) || 0);
      if (inc.lastPuzzle !== null && inc.lastPuzzle !== undefined) {
        h.lastPuzzle = Math.max(Number(h.lastPuzzle) || 0, Number(inc.lastPuzzle) || 0);
      }

      // La racha EN CURSO no se toca desde acá, a propósito. No es un
      // acumulado: baja a cero cuando se corta, y el servidor ya la lleva bien
      // porque él mismo cuenta los intentos (recordCompletion). Tomar el
      // máximo contra lo que manda el navegador la resucitaba: alcanzaba con
      // abrir el sitio en un dispositivo cuyo localStorage quedó viejo para
      // devolverle una racha a alguien que la había cortado hoy.
      //
      // La única entrada legítima de una racha del cliente es la migración de
      // quien venía jugando sin cuenta, y ésa tiene su propio camino con el
      // chequeo de racha viva (ver importarProgresoLocal).
    }

    // 4. Pala Clicker: fusión de partida completa sin pérdida de progreso
    if (incoming?.clicker && typeof incoming.clicker === "object") {
      const inc = incoming.clicker;
      const cur = current.clicker;

      if (!cur) {
        current.clicker = inc;
      } else {
        const curBrillo = Number(cur.brillo) || 0;
        const incBrillo = Number(inc.brillo) || 0;
        const bestBrillo = Math.max(curBrillo, incBrillo);

        const curPalas = Number(cur.palas) || 0;
        const incPalas = Number(inc.palas) || 0;
        const bestPalas = incBrillo > curBrillo ? incPalas : (curBrillo > incBrillo ? curPalas : Math.max(curPalas, incPalas));

        const mergedUpgrades = { ...(cur.upgrades || {}) };
        for (const [k, v] of Object.entries(inc.upgrades || {})) {
          mergedUpgrades[k] = Math.max(Number(mergedUpgrades[k]) || 0, Number(v) || 0);
        }

        const mergedTools = { ...(cur.tools || {}) };
        for (const [k, v] of Object.entries(inc.tools || {})) {
          mergedTools[k] = Math.max(Number(mergedTools[k]) || 0, Number(v) || 0);
        }

        const mergedInventory = { ...(cur.inventory || {}) };
        for (const [k, v] of Object.entries(inc.inventory || {})) {
          mergedInventory[k] = Math.max(Number(mergedInventory[k]) || 0, Number(v) || 0);
        }

        const mergedAchievements = { ...(cur.achievements || {}) };
        for (const [k, v] of Object.entries(inc.achievements || {})) {
          if (v) mergedAchievements[k] = true;
        }

        const mergedPrestigeUpgrades = { ...(cur.prestigeUpgrades || {}) };
        for (const [k, v] of Object.entries(inc.prestigeUpgrades || {})) {
          if (v) mergedPrestigeUpgrades[k] = true;
        }

        current.clicker = {
          ...cur,
          ...inc,
          palas: bestPalas,
          brillo: bestBrillo,
          upgrades: mergedUpgrades,
          tools: mergedTools,
          inventory: mergedInventory,
          achievements: mergedAchievements,
          prestigeUpgrades: mergedPrestigeUpgrades,
          updatedAt: Date.now(),
        };
      }
    }

    current.updatedAt = Date.now();
    this.scheduleSave();

    return {
      ok: true,
      records: this.getRecords(pId),
    };
  }
}
