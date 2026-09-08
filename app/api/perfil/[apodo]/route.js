import { NextResponse } from "next/server";
import { urlDelServicio } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Perfil público de un jugador, por apodo.
 *
 * No pide sesión: la gracia de la página es poder pasarle el link a alguien.
 * Lo que se publica lo decide el servicio (ver perfilPublico), que deja afuera
 * el email y los récords que no puede verificar.
 */
export async function GET(request, { params }) {
  const { apodo } = await params;

  try {
    const res = await fetch(
      `${urlDelServicio()}/cuentas/perfil?apodo=${encodeURIComponent(apodo || "")}`,
      { cache: "no-store", signal: AbortSignal.timeout(4000) }
    );

    if (res.status === 404) {
      return NextResponse.json({ error: "No existe ese apodo." }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "No se pudo consultar el perfil." }, { status: 502 });
    }

    const datos = await res.json();
    return NextResponse.json({ perfil: datos.perfil });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo consultar el perfil." }, { status: 502 });
  }
}
