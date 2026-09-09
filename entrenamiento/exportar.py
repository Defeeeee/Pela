"""
Exporta la política entrenada a un formato que pueda leer el servidor de
producción, que es Node y no tiene torch.

Los pesos van en binario crudo (float32) y no en JSON: la red tiene ~1,8
millones de parámetros y en texto ocuparía cinco veces más y tardaría un
segundo en parsearse en cada arranque del proceso.
"""
import argparse, json, os, struct
import torch

ap = argparse.ArgumentParser()
ap.add_argument("--entrada", default="entrenamiento/estado/politica.pt")
ap.add_argument("--salida", default="multiplayer-server/pesos-bots")
args = ap.parse_args()

ck = torch.load(args.entrada, map_location="cpu", weights_only=False)
sd = ck["politica"]

# Orden de las capas tal como las recorre el forward en JS.
nombres = ["tronco.0", "tronco.2", "tronco.4", "cabeza_accion"]
capas = []
plano = bytearray()

for n in nombres:
    W = sd[f"{n}.weight"]        # (salida, entrada)
    b = sd[f"{n}.bias"]
    capas.append({"entrada": W.shape[1], "salida": W.shape[0], "offset": len(plano)})
    plano += W.contiguous().float().numpy().tobytes()
    plano += b.contiguous().float().numpy().tobytes()

manifiesto = {
    "tamObs": ck["tam_obs"],
    "numAcciones": ck["n_acc"],
    "ancho": ck["ancho"],
    "paso": ck.get("paso", 0),
    "capas": capas,
    "parametros": sum(c["entrada"] * c["salida"] + c["salida"] for c in capas),
}

with open(args.salida + ".bin", "wb") as f:
    f.write(plano)
with open(args.salida + ".json", "w") as f:
    json.dump(manifiesto, f, indent=2)

print(f"obs={manifiesto['tamObs']} acciones={manifiesto['numAcciones']} paso={manifiesto['paso']}")
print(f"capas: {' -> '.join(str(c['entrada']) for c in capas)} -> {capas[-1]['salida']}")
print(f"{manifiesto['parametros']:,} parámetros | {len(plano)/1e6:.1f} MB")
