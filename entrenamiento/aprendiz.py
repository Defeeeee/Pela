"""
Aprendiz PPO para los bots de Agarrá.io.

Arquitectura actor-aprendiz: los actores son procesos de Node que sólo simulan
la arena (el mismo código que corre en producción), y este proceso tiene la
política en la GPU. Los actores no hacen nada de matemática de red: en JS puro
un forward de 1,5M de parámetros son ~900 por segundo, cuando un core simulando
pide ~40.000 por segundo. Por eso la red va en la GPU y la simulación en los
cores, cada uno haciendo lo que le sale barato.

Se usa PPO y no DQN porque el agente tiene que *probar cosas*: PPO muestrea de
una distribución y el bono de entropía lo empuja a explorar, en vez de elegir
siempre el máximo de una tabla de valores.
"""

import argparse
import json
import os
import struct
import subprocess
import sys
import threading
import time
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

AQUI = os.path.dirname(os.path.abspath(__file__))

# Posición de masaPico dentro del bloque de estadísticas que manda el actor
# (ver el orden de salSta en actor.js). Es la única que no se junta sumando.
IDX_MASA_PICO = 4


# ─────────────────────────────────────────────────────────────────────────────
# Actores
# ─────────────────────────────────────────────────────────────────────────────

class Actor:
    """Un proceso de Node simulando muchas arenas."""

    def __init__(self, idx, arenas, agentes, semilla, nodo="node", espectador=None):
        self.idx = idx
        cmd = [nodo, os.path.join(AQUI, "actor.js"),
               f"--arenas={arenas}", f"--agentes={agentes}", f"--semilla={semilla}"]
        if espectador:
            cmd.append(f"--espectador={espectador}")
        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            bufsize=0, cwd=AQUI,
        )
        cab = self._leer(20)
        magia, self.n, self.tam_obs, self.n_acc, self.repetir = struct.unpack("<5i", cab)
        if magia != 0x50454C41:
            raise RuntimeError(f"actor {idx}: cabecera inesperada")

        self.n_stats = 16
        self.bytes_salida = (self.n * self.tam_obs * 4 + self.n * 4 + self.n
                             + self.n * self.n_acc + self.n_stats * 4)
        self.buf = bytearray(self.bytes_salida)
        self.obs = None
        self.rec = None
        self.fin = None
        self.msc = None
        self.stats = None

    def _leer(self, n):
        datos = bytearray(n)
        vista = memoryview(datos)
        leido = 0
        while leido < n:
            r = self.proc.stdout.readinto(vista[leido:])
            if not r:
                raise RuntimeError(f"actor {self.idx} se cerró")
            leido += r
        return bytes(datos)

    def recibir(self):
        """Lee el lote completo y lo parte en vistas numpy sin copiar."""
        vista = memoryview(self.buf)
        leido = 0
        while leido < self.bytes_salida:
            r = self.proc.stdout.readinto(vista[leido:])
            if not r:
                raise RuntimeError(f"actor {self.idx} se cerró")
            leido += r

        b = np.frombuffer(self.buf, dtype=np.uint8)
        o = 0
        k = self.n * self.tam_obs * 4
        self.obs = b[o:o + k].view(np.float32).reshape(self.n, self.tam_obs); o += k
        k = self.n * 4
        self.rec = b[o:o + k].view(np.float32); o += k
        self.fin = b[o:o + self.n]; o += self.n
        k = self.n * self.n_acc
        self.msc = b[o:o + k].reshape(self.n, self.n_acc); o += k
        self.stats = b[o:o + self.n_stats * 4].view(np.float32)

    def enviar(self, acciones_i32):
        self.proc.stdin.write(acciones_i32.tobytes())
        self.proc.stdin.flush()

    def cerrar(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


class Enjambre:
    """Los actores en conjunto, con un hilo por actor para solapar la E/S."""

    def __init__(self, n_workers, arenas, agentes, nodo="node", dir_espectador=None):
        self.actores = [
            Actor(i, arenas, agentes, 1000 + i * 31, nodo,
                  os.path.join(dir_espectador, f"espectador-{i}.json") if dir_espectador else None)
            for i in range(n_workers)
        ]
        self.n_por_actor = self.actores[0].n
        self.n = self.n_por_actor * n_workers
        self.tam_obs = self.actores[0].tam_obs
        self.n_acc = self.actores[0].n_acc
        self.repetir = self.actores[0].repetir
        self.pool = [None] * n_workers

    def recibir(self):
        hilos = [threading.Thread(target=a.recibir) for a in self.actores]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        obs = np.concatenate([a.obs for a in self.actores])
        rec = np.concatenate([a.rec for a in self.actores])
        fin = np.concatenate([a.fin for a in self.actores])
        msc = np.concatenate([a.msc for a in self.actores])
        # Casi todas las estadísticas son contadores y se juntan sumando. La
        # excepción es masaPico, que es un MÁXIMO: sumar los máximos de los 8
        # actores daba la suma de los ocho mejores (~8x el valor real) y el
        # panel mostraba un récord inflado que no se correspondía con nada de
        # lo que se veía en el espectador.
        pilas = np.stack([a.stats for a in self.actores])
        sta = pilas.sum(axis=0)
        sta[IDX_MASA_PICO] = pilas[:, IDX_MASA_PICO].max()
        return obs, rec, fin, msc, sta

    def enviar(self, acciones):
        trozos = np.split(acciones.astype(np.int32), len(self.actores))
        hilos = [threading.Thread(target=a.enviar, args=(t,))
                 for a, t in zip(self.actores, trozos)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()

    def cerrar(self):
        for a in self.actores:
            a.cerrar()


# ─────────────────────────────────────────────────────────────────────────────
# Política
# ─────────────────────────────────────────────────────────────────────────────

class Politica(nn.Module):
    """Tronco compartido con dos cabezas: acción y valor."""

    def __init__(self, tam_obs, n_acc, ancho=1024):
        super().__init__()
        self.tronco = nn.Sequential(
            nn.Linear(tam_obs, ancho), nn.ReLU(),
            nn.Linear(ancho, ancho), nn.ReLU(),
            nn.Linear(ancho, ancho // 2), nn.ReLU(),
        )
        self.cabeza_accion = nn.Linear(ancho // 2, n_acc)
        self.cabeza_valor = nn.Linear(ancho // 2, 1)

        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.orthogonal_(m.weight, gain=np.sqrt(2))
                nn.init.zeros_(m.bias)
        nn.init.orthogonal_(self.cabeza_accion.weight, gain=0.01)
        nn.init.orthogonal_(self.cabeza_valor.weight, gain=1.0)

    def forward(self, x, mascara=None):
        h = self.tronco(x)
        logits = self.cabeza_accion(h)
        if mascara is not None:
            # Las acciones ilegales se apagan poniendo su logit en -inf, así la
            # softmax les da probabilidad cero. Enmascarar es mejor que
            # castigar: una acción que no cambia el estado no enseña nada.
            logits = logits.masked_fill(mascara == 0, -1e9)
        return logits, self.cabeza_valor(h).squeeze(-1)


def varianza_explicada(pred, real):
    var = real.var()
    return float(1 - (real - pred).var() / var) if var > 0 else 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Entrenamiento
# ─────────────────────────────────────────────────────────────────────────────

class MuestreadorGPU(threading.Thread):
    """Muestrea la GPU en segundo plano y promedia.

    Una sola lectura de nvidia-smi en el momento de escribir las métricas no
    dice nada: la GPU trabaja a ráfagas (backprop) y el valor instantáneo salta
    entre 5% y 99% según cuándo caiga la lectura. Lo que interesa es la
    ocupación media a lo largo del ciclo.
    """

    def __init__(self, periodo=0.2):
        super().__init__(daemon=True)
        self.periodo = periodo
        self.lock = threading.Lock()
        self.muestras = []
        self.ultimo = {"gpuMemMB": 0, "gpuMemTotalMB": 0, "gpuTemp": 0}

    def run(self):
        while True:
            try:
                s = subprocess.run(
                    ["nvidia-smi",
                     "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
                     "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, timeout=2).stdout.strip()
                u, m, mt, t = [float(x) for x in s.split(",")]
                with self.lock:
                    self.muestras.append(u)
                    self.ultimo = {"gpuMemMB": m, "gpuMemTotalMB": mt, "gpuTemp": t}
            except Exception:
                pass
            time.sleep(self.periodo)

    def drenar(self):
        with self.lock:
            ms = self.muestras
            self.muestras = []
            info = dict(self.ultimo)
        info["gpuUso"] = round(sum(ms) / len(ms), 1) if ms else 0.0
        info["gpuPico"] = round(max(ms), 1) if ms else 0.0
        info["gpuMuestras"] = len(ms)
        return info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=7)
    ap.add_argument("--arenas", type=int, default=24)
    ap.add_argument("--agentes", type=int, default=4)
    ap.add_argument("--rollout", type=int, default=48)
    ap.add_argument("--epocas", type=int, default=3)
    ap.add_argument("--minilote", type=int, default=16384)
    ap.add_argument("--lr", type=float, default=3e-4)
    # Horizonte efectivo 1/(1-gamma): con 0,995 son 200 decisiones = 20s, que
    # alcanza para reaccionar pero no para "me hago grande ahora para comer
    # dentro de un minuto". Con vidas de 10 minutos hace falta más vista: 0,998
    # son 500 decisiones = 50s. Más que eso empieza a costar mucha varianza.
    ap.add_argument("--gamma", type=float, default=0.998)
    ap.add_argument("--lam", type=float, default=0.95)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--entropia", type=float, default=0.01)
    ap.add_argument("--ancho", type=int, default=1024)
    ap.add_argument("--nodo", type=str, default="node")
    ap.add_argument("--salida", type=str, default=os.path.join(AQUI, "estado"))
    args = ap.parse_args()

    os.makedirs(args.salida, exist_ok=True)
    métricas = open(os.path.join(args.salida, "metricas.jsonl"), "a", buffering=1)

    dispositivo = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.backends.cudnn.benchmark = True

    muestreador = MuestreadorGPU()
    muestreador.start()

    enjambre = Enjambre(args.workers, args.arenas, args.agentes, args.nodo, args.salida)
    N, TAM, NACC = enjambre.n, enjambre.tam_obs, enjambre.n_acc
    print(f"[aprendiz] {args.workers} actores x {enjambre.n_por_actor} agentes = {N} agentes",
          flush=True)
    print(f"[aprendiz] obs={TAM} acciones={NACC} repetición={enjambre.repetir} "
          f"dispositivo={dispositivo}", flush=True)

    politica = Politica(TAM, NACC, args.ancho).to(dispositivo)
    optim = torch.optim.Adam(politica.parameters(), lr=args.lr, eps=1e-5)

    # Copia que actúa mientras la otra se entrena.
    #
    # Sin esto, recolectar y aprender se turnan: los 8 cores quedan parados
    # durante el backprop y la GPU queda parada durante la simulación (se medía
    # 70% simulando / 24% aprendiendo, con GPU al 51% y CPU al 61%). Con dos
    # copias, el hilo de fondo entrena el lote k mientras el principal recolecta
    # el k+1, y las dos cosas se usan a la vez.
    #
    # Las acciones quedan un lote desactualizadas respecto de los pesos que se
    # están entrenando. PPO ya lo contempla: el cociente de probabilidades se
    # calcula contra la política que EFECTIVAMENTE actuó, que es ésta, así que
    # la corrección de importancia sigue siendo la correcta.
    politica_act = Politica(TAM, NACC, args.ancho).to(dispositivo)
    politica_act.load_state_dict(politica.state_dict())
    politica_act.eval()

    ruta_ckpt = os.path.join(args.salida, "politica.pt")
    paso_global = 0
    if os.path.exists(ruta_ckpt):
        ck = torch.load(ruta_ckpt, map_location=dispositivo, weights_only=False)
        if ck.get("tam_obs") == TAM and ck.get("n_acc") == NACC and ck.get("ancho") == args.ancho:
            politica.load_state_dict(ck["politica"])
            politica_act.load_state_dict(ck["politica"])
            optim.load_state_dict(ck["optim"])
            paso_global = ck.get("paso", 0)
            print(f"[aprendiz] retomando desde el paso {paso_global}", flush=True)
        else:
            print("[aprendiz] checkpoint incompatible con esta arquitectura; empiezo de cero",
                  flush=True)

    T = args.rollout

    class Lote:
        """Un rollout completo. Hacen falta dos: uno se llena mientras el otro
        se entrena."""
        def __init__(self):
            self.obs = torch.zeros((T, N, TAM), device=dispositivo)
            self.msc = torch.zeros((T, N, NACC), dtype=torch.bool, device=dispositivo)
            self.acc = torch.zeros((T, N), dtype=torch.long, device=dispositivo)
            self.lgp = torch.zeros((T, N), device=dispositivo)
            self.rec = torch.zeros((T, N), device=dispositivo)
            self.fin = torch.zeros((T, N), device=dispositivo)
            self.val = torch.zeros((T, N), device=dispositivo)
            self.ven = torch.zeros((T, N), device=dispositivo)
            self.ret = torch.zeros((T, N), device=dispositivo)

    lotes = [Lote(), Lote()]
    cual = 0
    hilo_aprender = None
    resultado = {}

    obs_np, _, _, msc_np, _ = enjambre.recibir()
    obs = torch.from_numpy(obs_np).to(dispositivo)
    msc = torch.from_numpy(msc_np).to(dispositivo).bool()

    t_inicio = time.time()
    hist_ret = deque(maxlen=200)
    # Ventana móvil de contadores crudos. Las razones por episodio se calculan
    # sumando la ventana entera y dividiendo una sola vez, en vez de promediar
    # razones ciclo a ciclo: un ciclo donde terminaron 5 episodios en vez de 60
    # da una razón diez veces más grande sin que haya cambiado nada del juego.
    ventana = deque(maxlen=20)
    hist_masa = deque(maxlen=200)
    acum = {k: 0.0 for k in ("episodios", "muertes", "porTiempo", "masaFinalSuma",
                             "pasosSuma", "kills", "divisiones", "divLegales",
                             "picoEpisodioSuma", "crecimientoSuma", "episodiosChicos",
                             "picoChicosSuma", "episodiosDivisibles", "reciclajes", "ticks")}
    masa_pico_global = 0.0
    ret_parcial = np.zeros(N, dtype=np.float64)
    histograma = np.zeros(NACC, dtype=np.int64)

    def entrenar_lote(lote, salida):
        """Un paso de PPO sobre un lote ya cerrado. Corre en un hilo aparte;
        las operaciones de torch sueltan el GIL, así que el hilo principal
        sigue recolectando mientras esto ocupa la GPU."""
        t0 = time.time()
        f_obs = lote.obs.reshape(-1, TAM)
        f_msc = lote.msc.reshape(-1, NACC)
        f_acc = lote.acc.reshape(-1)
        f_lgp = lote.lgp.reshape(-1)
        f_ven = lote.ven.reshape(-1)
        f_ret = lote.ret.reshape(-1)
        f_ven = (f_ven - f_ven.mean()) / (f_ven.std() + 1e-8)

        total = f_obs.shape[0]
        p_loss = v_loss = ent = kl = clipf = 0.0
        n_lotes = 0
        for _ in range(args.epocas):
            perm = torch.randperm(total, device=dispositivo)
            for i in range(0, total, args.minilote):
                idx = perm[i:i + args.minilote]
                logits, val = politica(f_obs[idx], f_msc[idx])
                dist = torch.distributions.Categorical(logits=logits)
                lgp = dist.log_prob(f_acc[idx])
                ratio = (lgp - f_lgp[idx]).exp()

                perdida_pol = -torch.min(
                    ratio * f_ven[idx],
                    torch.clamp(ratio, 1 - args.clip, 1 + args.clip) * f_ven[idx],
                ).mean()
                perdida_val = F.mse_loss(val, f_ret[idx])
                entropia = dist.entropy().mean()

                perdida = perdida_pol + 0.5 * perdida_val - args.entropia * entropia
                optim.zero_grad(set_to_none=True)
                perdida.backward()
                nn.utils.clip_grad_norm_(politica.parameters(), 0.5)
                optim.step()

                with torch.no_grad():
                    p_loss += float(perdida_pol)
                    v_loss += float(perdida_val)
                    ent += float(entropia)
                    kl += float((f_lgp[idx] - lgp).mean())
                    clipf += float(((ratio - 1).abs() > args.clip).float().mean())
                n_lotes += 1

        salida.clear()
        salida.update({
            "perdidaPolitica": p_loss / n_lotes, "perdidaValor": v_loss / n_lotes,
            "entropia": ent / n_lotes, "klAprox": kl / n_lotes,
            "fraccionRecortada": clipf / n_lotes,
            "varianzaExplicada": varianza_explicada(
                lote.val.reshape(-1).cpu().numpy(), f_ret.cpu().numpy()),
            "segundos": time.time() - t0,
        })

    while True:
        t_ciclo = time.time()
        t_sim = 0.0
        acum_local = {k: 0.0 for k in acum}
        masa_pico_ciclo = 0.0
        b = lotes[cual]

        for t in range(T):
            b.obs[t] = obs
            b.msc[t] = msc

            with torch.no_grad():
                logits, valores = politica_act(obs, msc)
                dist = torch.distributions.Categorical(logits=logits)
                acciones = dist.sample()
                b.lgp[t] = dist.log_prob(acciones)
                b.acc[t] = acciones
                b.val[t] = valores

            acc_np = acciones.cpu().numpy()
            histograma += np.bincount(acc_np, minlength=NACC)

            t0 = time.time()
            enjambre.enviar(acc_np)
            obs_np, rec_np, fin_np, msc_np, sta = enjambre.recibir()
            t_sim += time.time() - t0

            b.rec[t] = torch.from_numpy(rec_np.copy()).to(dispositivo)
            b.fin[t] = torch.from_numpy(fin_np.astype(np.float32)).to(dispositivo)

            ret_parcial += rec_np
            terminados = fin_np.astype(bool)
            if terminados.any():
                hist_ret.extend(ret_parcial[terminados].tolist())
                ret_parcial[terminados] = 0.0

            for k, v in zip(("episodios", "muertes", "porTiempo", "masaFinalSuma",
                             "masaPico", "pasosSuma", "kills", "divisiones",
                             "divLegales", "picoEpisodioSuma", "crecimientoSuma",
                             "episodiosChicos", "picoChicosSuma",
                             "episodiosDivisibles", "reciclajes", "ticks"), sta):
                if k == "masaPico":
                    masa_pico_ciclo = max(masa_pico_ciclo, float(v))
                else:
                    acum_local[k] += float(v)

            obs = torch.from_numpy(obs_np.copy()).to(dispositivo)
            msc = torch.from_numpy(msc_np.copy()).to(dispositivo).bool()

        # ── GAE, con la misma política que actuó ──
        with torch.no_grad():
            _, ultimo_valor = politica_act(obs, msc)
            acumulada = torch.zeros(N, device=dispositivo)
            for t in reversed(range(T)):
                sig_val = ultimo_valor if t == T - 1 else b.val[t + 1]
                no_fin = 1.0 - b.fin[t]
                delta = b.rec[t] + args.gamma * sig_val * no_fin - b.val[t]
                acumulada = delta + args.gamma * args.lam * no_fin * acumulada
                b.ven[t] = acumulada
            b.ret.copy_(b.ven + b.val)

        # El lote anterior ya se estuvo entrenando durante toda esta recolección;
        # acá sólo se espera lo que falte y se pasan los pesos a la copia que actúa.
        t_espera = time.time()
        if hilo_aprender is not None:
            hilo_aprender.join()
            politica_act.load_state_dict(politica.state_dict())
        t_espera = time.time() - t_espera

        hilo_aprender = threading.Thread(target=entrenar_lote, args=(b, resultado), daemon=True)
        hilo_aprender.start()
        cual ^= 1

        apr = dict(resultado)
        t_apr = apr.get("segundos", 0.0)
        p_loss = apr.get("perdidaPolitica", 0.0)
        v_loss = apr.get("perdidaValor", 0.0)
        ent = apr.get("entropia", 0.0)
        kl = apr.get("klAprox", 0.0)
        clipf = apr.get("fraccionRecortada", 0.0)
        vc = apr.get("varianzaExplicada", 0.0)
        n_lotes = 1

        paso_global += 1
        for k in acum:
            acum[k] += acum_local[k]
        masa_pico_global = max(masa_pico_global, masa_pico_ciclo)

        transiciones = T * N
        dur = time.time() - t_ciclo
        ventana.append(acum_local)
        suma = {k: sum(c[k] for c in ventana) for k in acum_local}
        eps = max(1.0, suma["episodios"])
        dist_acc = histograma / max(1, histograma.sum())

        m = {
            "paso": paso_global,
            "tiempo": round(time.time() - t_inicio, 1),
            # rendimiento
            "transicionesPorSeg": round(transiciones / dur),
            "ticksPorSeg": round(acum_local["ticks"] / dur),
            "vecesTiempoReal": round(acum_local["ticks"] / dur / 30),
            "segSimuladosPorSeg": round(acum_local["ticks"] / dur / 30, 1),
            "fraccionSimulando": round(t_sim / dur, 3),
            "fraccionAprendiendo": round(t_apr / dur, 3),
            "esperaPorAprendiz": round(t_espera / dur, 3),
            "transicionesTotales": paso_global * transiciones,
            # juego
            "episodios": int(acum["episodios"]),
            "episodiosPorSeg": round(acum_local["episodios"] / dur, 1),
            "episodiosEnVentana": int(suma["episodios"]),
            "tasaMuerte": round(suma["muertes"] / eps, 3),
            "masaMediaFinal": round(suma["masaFinalSuma"] / max(1, suma["porTiempo"]), 1),
            "masaPicoMediaEpisodio": round(suma["picoEpisodioSuma"] / eps, 1),
            "crecimientoRelativo": round(suma["crecimientoSuma"] / eps, 3),
            "masaPicoNacidosChicos": round(
                suma["picoChicosSuma"] / max(1, suma["episodiosChicos"]), 1),
            "fraccionVidasDivisibles": round(suma["episodiosDivisibles"] / eps, 4),
            "reciclajes": int(acum["reciclajes"]),
            "masaPicoCiclo": round(masa_pico_ciclo, 1),
            "masaPicoGlobal": round(masa_pico_global, 1),
            "supervivenciaSeg": round(suma["pasosSuma"] / eps / 10, 1),
            "killsPorEpisodio": round(suma["kills"] / eps, 4),
            "divisionesPorEpisodio": round(suma["divisiones"] / eps, 2),
            "divisionesEfectivas": round(suma["divLegales"] / max(1, suma["divisiones"]), 3),
            "retornoMedio": round(float(np.mean(hist_ret)) if hist_ret else 0.0, 2),
            "recompensaPorPaso": round(float(b.rec.mean()), 4),
            # aprendizaje
            "perdidaPolitica": round(p_loss, 5),
            "perdidaValor": round(v_loss, 4),
            "entropia": round(ent, 4),
            "entropiaMax": round(float(np.log(NACC)), 4),
            "klAprox": round(kl, 5),
            "fraccionRecortada": round(clipf, 4),
            "varianzaExplicada": round(vc, 3),
            "lr": args.lr,
            # hardware
            "cargaCPU": round(os.getloadavg()[0], 2),
            "cores": os.cpu_count(),
            **muestreador.drenar(),
            # configuración
            "agentes": N,
            "workers": args.workers,
            "arenasPorWorker": args.arenas,
            "loteRollout": transiciones,
            "distribucionAcciones": [round(float(x), 4) for x in dist_acc],
        }
        métricas.write(json.dumps(m) + "\n")
        histograma[:] = 0

        print(f"[{paso_global}] {m['transicionesPorSeg']:>7,}/s  "
              f"{m['vecesTiempoReal']:>6}x  masa~{m['masaPicoMediaEpisodio']:>6}  "
              f"pico {m['masaPicoGlobal']:>6}  ret {m['retornoMedio']:>7}  "
              f"H {m['entropia']:.2f}  gpu {m['gpuUso']:.0f}%  cpu {m['cargaCPU']:.1f}",
              flush=True)

        if paso_global % 20 == 0:
            torch.save({"politica": politica.state_dict(), "optim": optim.state_dict(),
                        "paso": paso_global, "tam_obs": TAM, "n_acc": NACC,
                        "ancho": args.ancho}, ruta_ckpt)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[aprendiz] detenido", flush=True)
