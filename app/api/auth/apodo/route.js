import { NextResponse } from "next/server";
import { COOKIE_SESION, crearSesion, leerSesion, opcionesCookie } from "../../../lib/sesion";
import { urlDelServicio } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Reserva el apodo de la cuenta.
 *
 * El apodo se elige explícitamente y una sola vez al entrar: es lo que le da
 * dueño al nombre. Mientras la sesión no tenga nombre, la UI no deja usar el
 * ranking ni el multijugador.
 *
 * Al reservarlo hay que volver a emitir la cookie, porque la sesión es sin
 * estado: el nombre viaja adentro y firmado, así que no alcanza con guardarlo
 * en el servicio.
 */
export async function POST(request) {
  const sesion = leerSesion(request.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ error: "Necesitás entrar con Google." }, { status: 401 });
  }

  let apodo;
  try {
    apodo = (await request.json())?.apodo;
  } catch (e) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  // El handle va sin espacios porque es un identificador y viaja en la URL del
  // legajo. Se valida acá además de en el servicio para poder contestar el
  // error puntual sin dar el viaje, pero la regla vive en sanitizarHandle y el
  // servicio la vuelve a aplicar: ésta es una comodidad, no la defensa.
  const bruto = typeof apodo === "string" ? apodo.trim() : "";

  if (/\s/.test(bruto)) {
    return NextResponse.json({ error: "El handle no puede llevar espacios." }, { status: 400 });
  }
  if (bruto.length < 2 || bruto.length > 16) {
    return NextResponse.json({ error: "El handle va de 2 a 16 caracteres." }, { status: 400 });
  }
  const limpio = bruto;

  let respuesta;
  try {
    const res = await fetch(`${urlDelServicio()}/cuentas/apodo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: sesion.pid, apodo: limpio }),
      signal: AbortSignal.timeout(5000),
    });
    respuesta = await res.json();
  } catch (e) {
    return NextResponse.json({ error: "No se pudo guardar el apodo." }, { status: 502 });
  }

  // El servicio es el que sabe si el apodo ya tiene dueño.
  if (!respuesta?.ok) {
    return NextResponse.json({ error: respuesta?.error || "No se pudo guardar el apodo." }, { status: 409 });
  }

  const res = NextResponse.json({ ok: true, apodo: respuesta.apodo });
  res.cookies.set(
    COOKIE_SESION,
    crearSesion({ playerId: sesion.pid, googleSub: sesion.sub, nombre: respuesta.apodo }),
    opcionesCookie()
  );
  return res;
}
