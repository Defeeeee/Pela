import Link from "next/link";
import { urlDelServicio } from "../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Legajo público de un pelado.
 *
 * Es un componente de servidor y no un cliente que hace fetch: la página está
 * pensada para pasarle el link a alguien, así que conviene que llegue armada
 * en vez de mostrar un cartel de "cargando" y después el contenido.
 *
 * Ojo con el horario: proxy.js bloquea todas las páginas fuera del horario
 * laboral, así que un link compartido de noche rebota a /closed como cualquier
 * otra cosa del sitio. Es a propósito, es el chiste del proyecto.
 */
async function traerPerfil(apodo) {
  try {
    const res = await fetch(
      `${urlDelServicio()}/cuentas/perfil?apodo=${encodeURIComponent(apodo)}`,
      { cache: "no-store", signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    return (await res.json())?.perfil || null;
  } catch (e) {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { apodo } = await params;
  const nombre = decodeURIComponent(apodo || "");
  return { title: `Legajo de ${nombre} — Pela` };
}

export default async function PerfilPage({ params }) {
  const { apodo } = await params;
  const perfil = await traerPerfil(decodeURIComponent(apodo || ""));

  if (!perfil) {
    return (
      <div className="perfil-fondo">
        <div className="perfil-caja">
          <h1 className="perfil-nombre">Legajo inexistente</h1>
          <p className="perfil-vacio">
            No hay ningún pelado con ese apodo. O nunca existió, o se lo comió el sistema.
          </p>
          <Link href="/menu" className="perfil-volver">← Volver al Panel de Control</Link>
        </div>
        <EstilosPerfil />
      </div>
    );
  }

  const { pelardle, agarra, puestoHistorico, deCuantos } = perfil;
  const efectividad = pelardle.played > 0 ? Math.round((pelardle.wins / pelardle.played) * 100) : 0;

  return (
    <div className="perfil-fondo">
      <div className="perfil-caja">
        <div className="perfil-sello">LEGAJO FOLICULAR</div>
        <h1 className="perfil-nombre">{perfil.apodo}</h1>

        {puestoHistorico ? (
          <p className="perfil-puesto">
            Puesto <strong>#{puestoHistorico}</strong> de {deCuantos} en el Cuadro de Honor
          </p>
        ) : (
          <p className="perfil-puesto">Todavía sin puesto en el Cuadro de Honor</p>
        )}

        <h2 className="perfil-seccion">Pelardle</h2>
        <div className="perfil-grilla">
          <Dato valor={pelardle.played} etiqueta="Trámites" />
          <Dato valor={pelardle.wins} etiqueta="Aprobados" />
          <Dato valor={`${efectividad}%`} etiqueta="Efectividad" />
          <Dato valor={`🔥 ${pelardle.currentStreak}`} etiqueta="Racha actual" />
          <Dato valor={`🏆 ${pelardle.maxStreak}`} etiqueta="Mejor racha" />
        </div>

        <h2 className="perfil-seccion">Agarrá.io</h2>
        <div className="perfil-grilla">
          <Dato valor={agarra.maxMass || "—"} etiqueta="Mayor masa" />
        </div>

        {/* Se aclara porque es la diferencia entre este número y los que se ven
            en el menú de cada uno: acá sólo va lo que el servidor mide él mismo. */}
        <p className="perfil-nota">
          Todos estos números los cuenta el servidor. Los récords de Escapá a la Pala y del
          Clicker no figuran acá porque esos juegos corren enteros en el navegador.
        </p>

        <Link href="/menu" className="perfil-volver">← Volver al Panel de Control</Link>
      </div>
      <EstilosPerfil />
    </div>
  );
}

function Dato({ valor, etiqueta }) {
  return (
    <div className="perfil-dato">
      <span className="perfil-valor">{valor}</span>
      <span className="perfil-etiqueta">{etiqueta}</span>
    </div>
  );
}

/* <style> plano con clases prefijadas, como el resto del proyecto: con
   styled-jsx los selectores se scopean con un hash y el <a> que genera <Link>
   no lo recibe, así que los links salen con el azul del navegador. */
function EstilosPerfil() {
  return (
    <style>{`
      .perfil-fondo {
        min-height: 100vh;
        background: #000;
        background-image: radial-gradient(circle at 50% 0%, #1a1a00 0%, #000 60%);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      .perfil-caja {
        width: 100%;
        max-width: 460px;
        background: rgba(20, 20, 10, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 28px 24px;
        text-align: center;
      }

      .perfil-sello {
        display: inline-block;
        font-size: 0.62rem;
        letter-spacing: 0.18em;
        color: #ffeb3b;
        border: 1px solid rgba(255, 235, 59, 0.35);
        border-radius: 999px;
        padding: 4px 12px;
        margin-bottom: 14px;
      }

      .perfil-nombre {
        color: #fff;
        font-size: clamp(1.5rem, 6vw, 2.1rem);
        margin: 0 0 6px;
        word-break: break-word;
      }

      .perfil-puesto {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.82rem;
        margin: 0 0 22px;
      }

      .perfil-puesto strong { color: #ffeb3b; }

      .perfil-seccion {
        color: rgba(255, 255, 255, 0.75);
        font-size: 0.72rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        text-align: left;
        margin: 20px 0 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .perfil-grilla {
        display: grid;
        /* auto-fill y no auto-fit: con auto-fit las pistas vacías colapsan y
           una sección de un solo dato (Agarrá) estiraba el recuadro a todo
           el ancho, que quedaba desproporcionado al lado de Pelardle. */
        grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
        gap: 8px;
      }

      .perfil-dato {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 12px 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .perfil-valor {
        color: #ffeb3b;
        font-size: 1.25rem;
        font-weight: 800;
      }

      .perfil-etiqueta {
        color: rgba(255, 255, 255, 0.5);
        font-size: 0.66rem;
      }

      .perfil-nota {
        color: rgba(255, 255, 255, 0.35);
        font-size: 0.68rem;
        line-height: 1.5;
        margin: 20px 0 0;
      }

      .perfil-vacio {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.85rem;
        line-height: 1.5;
      }

      .perfil-volver {
        display: inline-block;
        margin-top: 20px;
        color: #ffeb3b;
        text-decoration: none;
        font-size: 0.8rem;
      }

      .perfil-volver:hover { text-decoration: underline; }
    `}</style>
  );
}
