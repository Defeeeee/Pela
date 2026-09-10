"use client";

/**
 * Utilidades de sesión para el navegador.
 *
 * La cookie de sesión es HttpOnly, así que desde acá nunca se lee directo: se
 * le pregunta al servidor. Eso mantiene la cookie fuera del alcance de
 * cualquier script que se cuele en la página.
 */

export const CLAVE_ID_ANONIMO = "pela_player_id";
export const CLAVE_NOMBRE = "pela_player_name";

/** Id anónimo del navegador. Es lo que la cuenta adopta al entrar por primera vez. */
export function idAnonimo() {
  if (typeof window === "undefined") return null;
  let id = null;
  try {
    id = localStorage.getItem(CLAVE_ID_ANONIMO);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLAVE_ID_ANONIMO, id);
    }
  } catch (e) {
    // localStorage bloqueado (modo privado, permisos): se juega sin identidad.
  }
  return id;
}

/** Quién soy según el servidor. Nunca tira: si algo falla, devuelve anónimo. */
export async function quienSoy() {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) throw new Error("no ok");
    return await res.json();
  } catch (e) {
    return { loginDisponible: false, autenticado: false, playerId: null, nombre: null };
  }
}

/** Manda al usuario a entrar con Google, llevándose su id anónimo para migrar. */
export function entrarConGoogle(volverA) {
  const destino = volverA || window.location.pathname;
  const pid = idAnonimo() || "";
  window.location.href =
    `/api/auth/google?volverA=${encodeURIComponent(destino)}&pid=${encodeURIComponent(pid)}`;
}

export async function salir() {
  try {
    await fetch("/api/auth/me", { method: "POST" });
  } catch (e) {}
  window.location.reload();
}

/**
 * Ticket para abrir un socket. Devuelve null si no hay sesión, y con eso el
 * llamador sabe que tiene que pedir login antes de dejar jugar.
 */
export async function ticketDeSocket() {
  /**
   * En desarrollo se puede pasar un ticket a mano con `?ticket=`, para entrar
   * al multiplayer de otro servidor junto con `?mp=`.
   *
   * Hace falta porque cada sitio firma sus tickets con su propio secreto: uno
   * emitido acá no vale allá. Hay que traerlo de `/api/auth/socket-token` del
   * sitio de destino, que sigue accesible aunque el bloqueo por horario tape
   * las páginas porque exime `/api`.
   *
   * Dura dos minutos: alcanza para conectarse, no para reconectar. Si el
   * socket se corta hay que buscar uno nuevo.
   */
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const manual = new URLSearchParams(window.location.search).get("ticket");
    if (manual) return manual;
  }

  try {
    const res = await fetch("/api/auth/socket-token", { cache: "no-store" });
    if (!res.ok) return null;
    const datos = await res.json();
    return datos.ticket || null;
  } catch (e) {
    return null;
  }
}
