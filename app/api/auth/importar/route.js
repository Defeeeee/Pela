import { NextResponse } from "next/server";
import { COOKIE_SESION, leerSesion } from "../../../lib/sesion";
import { urlDelServicio } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Sube a la cuenta lo que el navegador tenía guardado de Pelardle.
 *
 * Hasta que existió el login, las rachas vivían sólo en el localStorage de
 * cada uno. Esto es lo que hace que quien venía jugando no pierda la suya al
 * migrar. El servicio decide qué acepta: sólo una racha viva, y los contadores
 * por el máximo (ver importarProgresoLocal).
 */
export async function POST(request) {
  const sesion = leerSesion(request.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ error: "Necesitás entrar con Google." }, { status: 401 });
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  try {
    const res = await fetch(`${urlDelServicio()}/cuentas/importar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: sesion.pid,
        puzzleActual: cuerpo?.puzzleActual,
        stats: cuerpo?.stats,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo importar el progreso." }, { status: 502 });
  }
}
