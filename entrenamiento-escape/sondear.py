"""Pasa las escenas sintéticas de sondear.js por la red y emite qué decidió.

Se importa `Politica` del aprendiz en vez de redefinirla: una copia de la
arquitectura que se desincronice del entrenamiento daría un sondeo de un modelo
que no existe, y el error sería invisible porque los pesos cargarían igual
mientras las formas coincidan.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import torch

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from aprendiz import Politica  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default=os.path.join(AQUI, "estado", "politica.pt"))
ap.add_argument("--nodo", default="node")
ap.add_argument("--salida", default="-")
args = ap.parse_args()

esc = json.loads(subprocess.run(
    [args.nodo, os.path.join(AQUI, "sondear.js")],
    capture_output=True, check=True,
).stdout)

ck = torch.load(args.ckpt, map_location="cpu", weights_only=False)
tam, nacc, ancho = ck["tam_obs"], ck["n_acc"], ck["ancho"]
if tam != esc["tamObs"]:
    raise SystemExit(f"el checkpoint espera obs={tam} y las escenas dan {esc['tamObs']}")

pol = Politica(tam, nacc, ancho)
pol.load_state_dict(ck["politica"])
pol.eval()

obs = torch.tensor(np.array(esc["obs"], dtype=np.float32))
# Máscara todo en unos: en escapecv todas las acciones son siempre legales.
msc = torch.ones(obs.shape[0], nacc, dtype=torch.bool)

with torch.no_grad():
    logits, valor = pol(obs, msc)
    probs = torch.softmax(logits, dim=-1)
    ent = -(probs * torch.log(probs.clamp_min(1e-9))).sum(-1)

salida = {
    "paso": int(ck.get("paso", 0)),
    "ancho": ancho,
    "parametros": sum(p.numel() for p in pol.parameters()),
    "entropiaMax": float(np.log(nacc)),
    "resultados": [
        {
            **e,
            "probs": [round(float(x), 5) for x in probs[i]],
            "accion": int(torch.argmax(probs[i])),
            "valor": round(float(valor[i]), 4),
            "entropia": round(float(ent[i]), 4),
        }
        for i, e in enumerate(esc["escenas"])
    ],
}

txt = json.dumps(salida)
if args.salida == "-":
    print(txt)
else:
    with open(args.salida, "w") as f:
        f.write(txt)
    print(f"[sondear] paso {salida['paso']}, {len(salida['resultados'])} escenas -> {args.salida}")
