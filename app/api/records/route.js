import { NextResponse } from "next/server";
import { COOKIE_SESION, leerSesion } from "../../lib/sesion";
import { urlDelServicio } from "../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Consulta los récords consolidados del usuario autenticado.
 */
export async function GET(request) {
  const token = request.cookies.get(COOKIE_SESION)?.value;
  const sesion = leerSesion(token);

  if (!sesion || !sesion.pid) {
    return NextResponse.json({
      autenticado: false,
      playerId: null,
      nombre: null,
      records: null,
    });
  }

  try {
    const res = await fetch(`${urlDelServicio()}/cuentas/records?playerId=${encodeURIComponent(sesion.pid)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return NextResponse.json({ autenticado: true, playerId: sesion.pid, nombre: sesion.nombre, records: null });
    }

    const datos = await res.json();
    return NextResponse.json({
      autenticado: true,
      playerId: sesion.pid,
      nombre: sesion.nombre,
      records: datos?.records || null,
    });
  } catch (e) {
    return NextResponse.json({
      autenticado: true,
      playerId: sesion.pid,
      nombre: sesion.nombre,
      records: null,
    });
  }
}

/**
 * Sincroniza y fusiona récords recibidos con los guardados en la cuenta.
 * Regla de oro: Se conserva siempre el mejor valor entre el local y el de la cuenta.
 */
export async function POST(request) {
  const token = request.cookies.get(COOKIE_SESION)?.value;
  const sesion = leerSesion(token);

  if (!sesion || !sesion.pid) {
    return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const res = await fetch(`${urlDelServicio()}/cuentas/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: sesion.pid,
        records: body?.records || body || {},
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Error en el servicio de almacenamiento" }, { status: 502 });
    }

    const datos = await res.json();
    return NextResponse.json(datos);
  } catch (e) {
    return NextResponse.json({ error: "No se pudo sincronizar con el servidor" }, { status: 502 });
  }
}
