"""
Tests del criterio con que se elige `mejor.pt`.

Este archivo existe porque el criterio anterior era `retornoMedio`, la métrica
de entrenamiento, que salta entre 12 y 18 de un ciclo a otro: el checkpoint
"mejor" terminaba siendo el del ciclo más afortunado y no el de la mejor
política. La regla de operación dice "si empeora, restaurá mejor.pt", así que
un criterio ruidoso acá se convierte en restaurar algo peor.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

MIN = 190


def elegir(ciclos):
    """Reproduce la regla de aprendiz.py y devuelve el ciclo que quedó guardado."""
    mejor_eval = float("-inf")
    guardado = None
    for paso, m in ciclos:
        if (paso > 40 and m.get("evalEpisodios", 0) >= MIN
                and m.get("evalMasaPorMinuto", 0.0) > mejor_eval):
            mejor_eval = m["evalMasaPorMinuto"]
            guardado = paso
    return guardado


def caso(nombre, ciclos, esperado):
    obtenido = elegir(ciclos)
    assert obtenido == esperado, f"{nombre}: esperaba paso {esperado}, dio {obtenido}"
    print(f"  ✓ {nombre}")


# Un ciclo con muestra chica y un número altísimo no puede llevarse el puesto:
# es exactamente la trampa que nos engañó cuatro veces.
caso("Una muestra chica no gana aunque su número sea enorme",
     [(100, {"evalMasaPorMinuto": 99.0, "evalEpisodios": 3}),
      (200, {"evalMasaPorMinuto": 13.5, "evalEpisodios": 800})],
     200)

# Con muestras válidas gana el mayor, no el último ni el primero.
caso("Con muestras válidas gana el de mayor evaluación",
     [(100, {"evalMasaPorMinuto": 12.0, "evalEpisodios": 800}),
      (200, {"evalMasaPorMinuto": 13.8, "evalEpisodios": 800}),
      (300, {"evalMasaPorMinuto": 13.4, "evalEpisodios": 800})],
     200)

# Que el retorno de entrenamiento se dispare no tiene que mover nada: es la
# métrica que se movía por ruido y por rivales que cambian.
caso("El retorno de entrenamiento ya no decide",
     [(100, {"evalMasaPorMinuto": 13.8, "evalEpisodios": 800, "retornoMedio": 12.1}),
      (200, {"evalMasaPorMinuto": 13.4, "evalEpisodios": 800, "retornoMedio": 17.6})],
     100)

# Los primeros pasos no cuentan aunque la muestra alcance: la política todavía
# no aprendió nada y su evaluación es la del azar.
caso("Los primeros 40 pasos no pueden ganar",
     [(10, {"evalMasaPorMinuto": 50.0, "evalEpisodios": 800}),
      (100, {"evalMasaPorMinuto": 13.0, "evalEpisodios": 800})],
     100)

# Justo en el borde del piso: 190 entra, 189 no.
caso("El piso de episodios es inclusivo en 190",
     [(100, {"evalMasaPorMinuto": 20.0, "evalEpisodios": 189}),
      (200, {"evalMasaPorMinuto": 13.0, "evalEpisodios": 190})],
     200)

# Si nada alcanza el piso no se guarda nada, en vez de guardar cualquier cosa.
caso("Sin ninguna muestra válida no se guarda nada",
     [(100, {"evalMasaPorMinuto": 40.0, "evalEpisodios": 5}),
      (200, {"evalMasaPorMinuto": 50.0, "evalEpisodios": 10})],
     None)

print("\n¡Todos los tests del criterio de mejor.pt pasaron!")
