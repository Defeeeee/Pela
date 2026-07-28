"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useSocialCredit } from "../SocialCreditContext";

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ñ"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BORRAR"]
];

const STATE_KEY = "pelardle_state_v1";
const STATS_KEY = "pelardle_stats_v1";
const DEFAULT_STATS = { played: 0, wins: 0, streak: 0, maxStreak: 0, lastPuzzle: null, dist: [0, 0, 0, 0, 0, 0] };

const TILE_DELAY = 0.26;
const REVEAL_MS = 4 * TILE_DELAY * 1000 + 650;

// Economía de la Reserva de Pala: como el resto del sitio, jugar tiene que
// salir plata. El premio queda por debajo del peaje a propósito, así ganar
// amortigua la visita pero nunca la vuelve gratis.
const ENTRY_COST = 15;
const WIN_REWARD = 5;
const FAIL_COST = 2;

const ACCENTS = { "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U" };
const EMOJI = { correct: "🟩", present: "🟨", absent: "⬛" };

export default function PelardlePage() {
  const [meta, setMeta] = useState(null);
  const [failed, setFailed] = useState(false);
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState("playing");
  const [answer, setAnswer] = useState(null);
  const [resolucion, setResolucion] = useState(null);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [toast, setToast] = useState("");
  const [shake, setShake] = useState(false);
  const [revealRow, setRevealRow] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [copied, setCopied] = useState(false);

  const toastTimer = useRef(null);
  const hasCharged = useRef(false);
  const { addCredit, deductCredit } = useSocialCredit();

  // Peaje de entrada, mismo patrón que /today, /escapa y /autista.
  // El eventId evita que el StrictMode cobre dos veces.
  useEffect(() => {
    if (!hasCharged.current) {
      deductCredit(ENTRY_COST, "visit-/pelardle");
      hasCharged.current = true;
    }
  }, [deductCredit]);

  const maxAttempts = meta?.attempts || 6;
  const wordLength = meta?.length || 5;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/pelardle");
        const data = await res.json();
        if (!alive) return;

        setMeta(data);

        try {
          const rawStats = localStorage.getItem(STATS_KEY);
          if (rawStats) setStats({ ...DEFAULT_STATS, ...JSON.parse(rawStats) });

          const rawState = localStorage.getItem(STATE_KEY);
          if (rawState) {
            const saved = JSON.parse(rawState);
            // Sólo restauramos si es el mismo puzzle: si cambió el día, tablero limpio.
            if (saved.puzzle === data.puzzle) {
              setGuesses(saved.guesses || []);
              setStatus(saved.status || "playing");
              setAnswer(saved.answer || null);
              setResolucion(saved.resolucion || null);
              if (saved.status && saved.status !== "playing") setShowEnd(true);
            }
          }
        } catch (e) {
          // localStorage corrupto: arrancamos de cero sin romper la página
        }
      } catch (e) {
        if (alive) setFailed(true);
      }
    })();

    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!meta) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ puzzle: meta.puzzle, guesses, status, answer, resolucion }));
    } catch (e) { /* storage lleno o bloqueado */ }
  }, [meta, guesses, status, answer, resolucion]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const doShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  const finish = useCallback((outcome, played, word, res) => {
    setStatus(outcome);
    setAnswer(word);
    setResolucion(res || null);

    setStats((prev) => {
      const consecutive = prev.lastPuzzle === meta.puzzle - 1;
      const streak = outcome === "won" ? (consecutive ? prev.streak + 1 : 1) : 0;
      const dist = [...prev.dist];
      if (outcome === "won") dist[played.length - 1] = (dist[played.length - 1] || 0) + 1;

      const next = {
        played: prev.played + 1,
        wins: prev.wins + (outcome === "won" ? 1 : 0),
        streak,
        maxStreak: Math.max(prev.maxStreak, streak),
        lastPuzzle: meta.puzzle,
        dist
      };

      try { localStorage.setItem(STATS_KEY, JSON.stringify(next)); } catch (e) { /* noop */ }
      return next;
    });

    if (outcome === "won") addCredit(WIN_REWARD);
    else deductCredit(FAIL_COST, `pelardle-${meta.puzzle}-fail-${played.length}`);

    setTimeout(() => setShowEnd(true), 450);
  }, [meta, addCredit, deductCredit]);

  const submit = useCallback(async () => {
    if (busy || status !== "playing" || !meta) return;

    if (current.length !== wordLength) {
      showToast(`Faltan letras: el formulario exige ${wordLength}.`);
      doShake();
      return;
    }

    setBusy(true);
    try {
      const attempt = guesses.length + 1;
      const res = await fetch("/api/pelardle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: current, attempt })
      });
      const data = await res.json();

      if (data.status !== "ok") {
        showToast(data.message || "Intento rechazado por Mesa de Entradas.");
        doShake();
        setBusy(false);
        return;
      }

      const next = [...guesses, { word: data.guess, result: data.result }];
      setGuesses(next);
      setCurrent("");
      setRevealRow(next.length - 1);

      // Esperamos a que termine el flip antes de cantar el resultado.
      setTimeout(() => {
        setRevealRow(-1);
        if (data.solved) finish("won", next, data.answer, null);
        else if (data.answer) finish("lost", next, data.answer, data.resolucion);
        else deductCredit(FAIL_COST, `pelardle-${meta.puzzle}-fail-${next.length}`);
        setBusy(false);
      }, REVEAL_MS);
    } catch (e) {
      showToast("Mesa de entradas no responde. Reintente.");
      setBusy(false);
    }
  }, [busy, status, meta, current, wordLength, guesses, showToast, doShake, finish, deductCredit]);

  const onKey = useCallback((key) => {
    if (status !== "playing" || busy) return;
    if (key === "ENTER") { submit(); return; }
    if (key === "BORRAR") { setCurrent((c) => c.slice(0, -1)); return; }
    setCurrent((c) => (c.length < wordLength ? c + key : c));
  }, [status, busy, submit, wordLength]);

  useEffect(() => {
    const handler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { onKey("ENTER"); return; }
      if (e.key === "Backspace") { onKey("BORRAR"); return; }
      if (e.key.length !== 1) return;

      const up = e.key.toUpperCase();
      const letter = ACCENTS[up] || up;
      if (/^[A-ZÑ]$/.test(letter)) onKey(letter);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onKey]);

  // La tecla se queda con su mejor estado: un verde nunca se degrada a gris.
  const keyStates = useMemo(() => {
    const rank = { absent: 1, present: 2, correct: 3 };
    const map = {};
    for (const g of guesses) {
      g.word.split("").forEach((ch, i) => {
        const s = g.result[i];
        if (!map[ch] || rank[s] > rank[map[ch]]) map[ch] = s;
      });
    }
    return map;
  }, [guesses]);

  const share = async () => {
    const head = `Pelardle #${meta.puzzle} ${status === "won" ? guesses.length : "X"}/${maxAttempts}`;
    const grid = guesses.map((g) => g.result.map((r) => EMOJI[r]).join("")).join("\n");
    const text = `${head}\n${grid}\n${window.location.origin}/pelardle`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) {
      showToast("No se pudo copiar. Copialo a mano, como en 1997.");
    }
  };

  if (failed) {
    return (
      <div className="pel-container">
        <PelardleStyles />
        <div className="pel-card">
          <p className="pel-error">
            El Comité de Redacción Folicular no responde. Intentá de nuevo en un rato.
          </p>
          <Link href="/menu" className="pel-back">← Volver al menú</Link>
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="pel-container">
        <PelardleStyles />
        <div className="pel-loading">Consultando el Padrón Folicular…</div>
      </div>
    );
  }

  const rows = Array.from({ length: maxAttempts }, (_, r) => {
    if (r < guesses.length) return { letters: guesses[r].word.split(""), result: guesses[r].result, done: true };
    if (r === guesses.length && status === "playing") {
      return {
        letters: Array.from({ length: wordLength }, (_, i) => current[i] || ""),
        result: null,
        done: false
      };
    }
    return { letters: Array(wordLength).fill(""), result: null, done: false };
  });

  const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxDist = Math.max(1, ...stats.dist);

  return (
    <div className="pel-container">
      <PelardleStyles />

      <div className="pel-card">
        <header className="pel-header">
          <span className="pel-badge">Comité de Redacción Folicular</span>
          <h1 className="pel-title">PELARDLE</h1>
          <p className="pel-subtitle">
            Edición N° {meta.puzzle} · {wordLength} letras · {maxAttempts} intentos reglamentarios
          </p>
        </header>

        {!meta.open && <div className="pel-alert">{meta.aviso}</div>}

        <div className="pel-grid" style={{ gridTemplateRows: `repeat(${maxAttempts}, 1fr)` }}>
          {rows.map((row, r) => (
            <div
              key={r}
              className={`pel-row ${shake && r === guesses.length ? "shake" : ""}`}
              style={{ gridTemplateColumns: `repeat(${wordLength}, 1fr)` }}
            >
              {row.letters.map((letter, i) => {
                const state = row.result ? row.result[i] : null;
                const revealing = revealRow === r;
                return (
                  <div
                    key={i}
                    className={[
                      "pel-tile",
                      letter && !state ? "filled" : "",
                      state || "",
                      revealing ? "reveal" : ""
                    ].filter(Boolean).join(" ")}
                    style={revealing ? { animationDelay: `${i * TILE_DELAY}s` } : undefined}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="pel-keyboard">
          {KEY_ROWS.map((row, r) => (
            <div key={r} className="pel-krow">
              {row.map((key) => {
                const wide = key === "ENTER" || key === "BORRAR";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onKey(key)}
                    className={`pel-key ${wide ? "wide" : ""} ${keyStates[key] || ""}`}
                    disabled={status !== "playing" || busy}
                  >
                    {key === "BORRAR" ? "⌫" : key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="pel-footer">
          <Link href="/menu" className="pel-back">← Volver al menú</Link>
          {status !== "playing" && (
            <button type="button" className="pel-linkbtn" onClick={() => setShowEnd(true)}>
              Ver resultado
            </button>
          )}
        </footer>
      </div>

      {toast && <div className="pel-toast">{toast}</div>}

      {showEnd && status !== "playing" && (
        <div className="pel-overlay" onClick={() => setShowEnd(false)}>
          <div className="pel-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pel-close" onClick={() => setShowEnd(false)}>✕</button>

            <h2 className={`pel-outcome ${status}`}>
              {status === "won" ? "TRÁMITE APROBADO" : "EXPEDIENTE ARCHIVADO"}
            </h2>

            <div className="pel-answer">
              La palabra era <strong>{answer}</strong>
            </div>

            {resolucion && <p className="pel-resolucion">{resolucion}</p>}

            <p className="pel-credit">
              {status === "won"
                ? `+${WIN_REWARD} de Reserva de Pala acreditados por idoneidad capilar. El trámite igual se cobra.`
                : "Se descontó Reserva de Pala por la visita y por cada intento fallido."}
            </p>

            <div className="pel-stats">
              <Stat label="Jugadas" value={stats.played} />
              <Stat label="% Éxito" value={winRate} />
              <Stat label="Racha" value={stats.streak} />
              <Stat label="Mejor" value={stats.maxStreak} />
            </div>

            <p className="pel-streaknote">
              La racha tiene tolerancia sindical: los días que el sitio está cerrado no la cortan.
            </p>

            <div className="pel-dist">
              {stats.dist.map((n, i) => (
                <div key={i} className="pel-distrow">
                  <span className="pel-distlabel">{i + 1}</span>
                  <div
                    className={`pel-distbar ${status === "won" && guesses.length === i + 1 ? "hot" : ""}`}
                    style={{ width: `${Math.max(8, (n / maxDist) * 100)}%` }}
                  >
                    {n}
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className="pel-share" onClick={share}>
              {copied ? "¡Copiado!" : "Compartir resultado"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="pel-stat">
      <div className="pel-statvalue">{value}</div>
      <div className="pel-statlabel">{label}</div>
    </div>
  );
}

function PelardleStyles() {
  return (
    <style>{`
      .pel-container {
        min-height: 100vh;
        background: radial-gradient(circle at 50% 0%, #101418 0%, #060708 60%, #000000 100%);
        color: #ffffff;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 16px 16px 24px;
      }
      .pel-loading {
        margin-top: 40vh;
        color: rgba(255,255,255,0.55);
        font-size: 0.9rem;
        letter-spacing: 0.04em;
      }
      .pel-card {
        width: 100%;
        max-width: 460px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      /* padding-top deja libre la barra de Reserva de Pala, que es fixed */
      .pel-header { text-align: center; padding-top: 44px; }
      .pel-badge {
        background: #43a047;
        color: #04170a;
        font-size: 0.62rem;
        font-weight: 800;
        padding: 4px 10px;
        border-radius: 20px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        display: inline-block;
      }
      .pel-title {
        font-size: 2.1rem;
        font-weight: 900;
        letter-spacing: 0.18em;
        margin: 10px 0 4px;
      }
      .pel-subtitle {
        font-size: 0.78rem;
        color: rgba(255,255,255,0.5);
        margin: 0;
      }
      .pel-alert {
        background: rgba(255, 193, 7, 0.07);
        border: 1px solid rgba(255, 193, 7, 0.22);
        border-radius: 12px;
        padding: 10px 14px;
        font-size: 0.76rem;
        line-height: 1.45;
        color: #ffc107;
      }
      /* El alto manda: el tablero se achica para que la grilla y el teclado
         entren juntos en pantalla sin scroll. El aspect-ratio 5/6 sale de las
         5 columnas por 6 filas, así las celdas quedan cuadradas. */
      .pel-grid {
        display: grid;
        gap: 6px;
        aspect-ratio: 5 / 6;
        height: min(44vh, 380px);
        max-width: 100%;
        align-self: center;
      }
      .pel-row { display: grid; gap: 6px; }
      .pel-row.shake { animation: pel-shake 0.5s ease; }

      .pel-tile {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: clamp(1.3rem, 6.5vw, 1.9rem);
        font-weight: 900;
        border: 2px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        background: transparent;
        user-select: none;
      }
      .pel-tile.filled { border-color: rgba(255,255,255,0.4); animation: pel-pop 0.12s ease; }
      .pel-tile.correct { --tile-bg: #43a047; background: var(--tile-bg); border-color: var(--tile-bg); }
      .pel-tile.present { --tile-bg: #c9a227; background: var(--tile-bg); border-color: var(--tile-bg); }
      .pel-tile.absent  { --tile-bg: #2b2f36; background: var(--tile-bg); border-color: var(--tile-bg); }
      .pel-tile.reveal  { animation: pel-flip 0.6s ease backwards; }

      .pel-keyboard { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
      .pel-krow { display: flex; gap: 5px; justify-content: center; }
      .pel-key {
        flex: 1 1 auto;
        min-width: 0;
        height: 52px;
        border: none;
        border-radius: 8px;
        background: #4a4f58;
        color: #fff;
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.08s ease;
      }
      .pel-key.wide { flex: 1.6 1 auto; font-size: 0.68rem; letter-spacing: 0.03em; }
      .pel-key:hover:not(:disabled) { background: #5b6069; }
      .pel-key:active:not(:disabled) { transform: scale(0.94); }
      .pel-key:disabled { opacity: 0.55; cursor: default; }
      .pel-key.correct { background: #43a047; }
      .pel-key.present { background: #c9a227; }
      .pel-key.absent  { background: #22252a; color: rgba(255,255,255,0.4); }

      .pel-footer { display: flex; justify-content: space-between; align-items: center; }
      .pel-back, .pel-linkbtn {
        color: rgba(255,255,255,0.5);
        font-size: 0.78rem;
        text-decoration: none;
        background: none;
        border: none;
        cursor: pointer;
        font-family: inherit;
        padding: 0;
      }
      .pel-back:hover, .pel-linkbtn:hover { color: #fff; }
      .pel-error { color: #ff8a80; font-size: 0.9rem; line-height: 1.5; text-align: center; }

      .pel-toast {
        position: fixed;
        top: 90px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15,17,20,0.95);
        border: 1px solid rgba(255,255,255,0.14);
        color: #fff;
        padding: 10px 18px;
        border-radius: 10px;
        font-size: 0.8rem;
        z-index: 200;
        max-width: 90vw;
        text-align: center;
        animation: pel-toastin 0.2s ease;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      }

      .pel-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.72);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        z-index: 300;
        animation: pel-fade 0.25s ease;
      }
      .pel-modal {
        width: 100%;
        max-width: 400px;
        max-height: 88vh;
        overflow-y: auto;
        background: rgba(24,27,33,0.96);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 20px;
        padding: 28px 24px;
        text-align: center;
        position: relative;
        box-shadow: 0 24px 60px rgba(0,0,0,0.6);
      }
      .pel-close {
        position: absolute; top: 12px; right: 14px;
        background: none; border: none; color: rgba(255,255,255,0.4);
        font-size: 1rem; cursor: pointer;
      }
      .pel-outcome { font-size: 1.15rem; font-weight: 900; letter-spacing: 0.06em; margin: 0 0 12px; }
      .pel-outcome.won { color: #66bb6a; }
      .pel-outcome.lost { color: #ef5350; }
      .pel-answer { font-size: 0.9rem; color: rgba(255,255,255,0.75); }
      .pel-answer strong { color: #fff; letter-spacing: 0.14em; font-size: 1.1rem; }
      .pel-resolucion {
        font-size: 0.74rem; line-height: 1.5;
        color: rgba(255,255,255,0.5);
        font-style: italic;
        margin: 12px 0 0;
      }
      .pel-credit { font-size: 0.72rem; color: #c9a227; margin: 14px 0 0; }

      .pel-stats { display: flex; gap: 8px; margin: 20px 0 6px; }
      .pel-stat { flex: 1; }
      .pel-statvalue { font-size: 1.5rem; font-weight: 900; }
      .pel-statlabel { font-size: 0.6rem; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.06em; }
      .pel-streaknote { font-size: 0.66rem; color: rgba(255,255,255,0.35); margin: 0 0 16px; line-height: 1.4; }

      .pel-dist { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
      .pel-distrow { display: flex; align-items: center; gap: 8px; }
      .pel-distlabel { font-size: 0.7rem; color: rgba(255,255,255,0.45); width: 10px; }
      .pel-distbar {
        background: #3a3f47;
        border-radius: 4px;
        font-size: 0.66rem;
        font-weight: 700;
        padding: 2px 6px;
        text-align: right;
        transition: width 0.4s ease;
      }
      .pel-distbar.hot { background: #43a047; }

      .pel-share {
        width: 100%;
        background: #43a047;
        color: #04170a;
        border: none;
        border-radius: 10px;
        padding: 13px;
        font-size: 0.85rem;
        font-weight: 800;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s ease;
      }
      .pel-share:hover { background: #4caf50; }

      @keyframes pel-flip {
        0%   { transform: rotateX(0deg);  background: transparent; border-color: rgba(255,255,255,0.4); }
        49%  { transform: rotateX(90deg); background: transparent; border-color: rgba(255,255,255,0.4); }
        50%  { transform: rotateX(90deg); background: var(--tile-bg); border-color: var(--tile-bg); }
        100% { transform: rotateX(0deg);  background: var(--tile-bg); border-color: var(--tile-bg); }
      }
      @keyframes pel-pop {
        from { transform: scale(0.9); }
        to   { transform: scale(1); }
      }
      @keyframes pel-shake {
        10%, 90% { transform: translateX(-2px); }
        20%, 80% { transform: translateX(4px); }
        30%, 50%, 70% { transform: translateX(-8px); }
        40%, 60% { transform: translateX(8px); }
      }
      @keyframes pel-fade {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* El toast ya está centrado con translateX(-50%): la animación tiene que conservarlo. */
      @keyframes pel-toastin {
        from { opacity: 0; transform: translate(-50%, -6px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }

      @media (max-width: 420px) {
        .pel-key { height: 46px; font-size: 0.78rem; }
        .pel-title { font-size: 2rem; }
      }
    `}</style>
  );
}
