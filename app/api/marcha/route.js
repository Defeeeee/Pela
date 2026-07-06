import { NextResponse } from "next/server";
import sharp from "sharp";

const LUGARES = [
  "Plaza de Mayo, sector con sombra",
  "El Obelisco, vereda con más folículos por metro cuadrado",
  "Puerta del Ministerio de Capilaridad de la Nación",
  "Congreso Nacional, frente al mástil pelado",
  "Plaza de los Dos Congresos, bajo la estatua sin peluca",
  "Puerta de AFIP-ELA, Mesa de Entradas Central"
];

const HORARIOS = [
  "10:00 hs, con tolerancia sindical de 3 horas",
  "12:00 hs, después del asado gremial",
  "16:00 hs, antes de que refresque el cuero cabelludo",
  "9:30 hs, se retoma a las 11 después del primer mate",
  "18:00 hs, horario protegido por Ley Folicular 27.541"
];

const MOTIVOS = [
  "Rechazo al tarifazo del Impuesto al Brillo Craneano",
  "Exigimos pluma capilar gratuita para las Categorías B y D",
  "Repudio a la quita del subsidio nacional de gorra",
  "En defensa de la Ley Folicular 27.541",
  "Paro por falta de pago del aguinaldo capilar",
  "Reclamo de blanqueo para peluqueros en negro"
];

const CANTITOS = [
  "¡Y va a caer, y va a caer, el que no tiene pelo también quiere el poder!",
  "¡Unidad de los pelados, para no ser tercerizados!",
  "¡Minoxidil por derecho, alpiste jamás!",
  "¡El que no salta, tiene pelo!",
  "¡Olé olé olé olá, pelado que lucha no se peina más!"
];

const GREMIOS = [
  "Sindicato de la Pala",
  "Federación Argentina de Trabajadores Foliculares (FATF)",
  "Unión Obrera Pelada Argentina (UOPA)",
  "Confederación General de la Calvicie (CGC)"
];

const CONSIGNAS_SUGERIDAS = [
  "¡Pelados unidos jamás serán vencidos!",
  "Basta de discriminación capilar",
  "Subsidio YA para el minoxidil",
  "Ni un pelado menos",
  "Paro general folicular ¡ya!",
  "Gorra libre y gratuita para el pueblo"
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildCartelSvg({ consigna, gremio }) {
  const width = 900;
  const height = 650;

  const safeConsigna = String(consigna || pick(CONSIGNAS_SUGERIDAS))
    .toUpperCase()
    .slice(0, 90);
  const safeGremio = String(gremio || pick(GREMIOS)).slice(0, 60);

  const maxChars = safeConsigna.length > 40 ? 16 : 12;
  const lines = wrapText(safeConsigna, maxChars).slice(0, 5);
  const fontSize = lines.length <= 2 ? 72 : lines.length <= 3 ? 58 : 44;
  const lineHeight = fontSize * 1.15;
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize / 3;

  const textLines = lines
    .map(
      (line, i) =>
        `<text x="${width / 2}" y="${startY + i * lineHeight}" font-family="Arial Black, Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="#1a1005" text-anchor="middle">${escapeXml(line)}</text>`
    )
    .join("\n");

  const rotation = (Math.random() * 6 - 3).toFixed(2);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${rotation} ${width / 2} ${height / 2})">
      <rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="#d9c69a" stroke="#5c3d1e" stroke-width="14" rx="6"/>
      <rect x="34" y="34" width="${width - 68}" height="${height - 68}" fill="none" stroke="#8b1e1e" stroke-width="6" stroke-dasharray="18,12" rx="4"/>
      ${textLines}
      <text x="${width / 2}" y="${height - 55}" font-family="Arial, sans-serif" font-size="24" font-style="italic" fill="#5c3d1e" text-anchor="middle">${escapeXml(safeGremio)}</text>
      <text x="${width / 2}" y="${height - 22}" font-family="Arial, sans-serif" font-size="16" fill="#8b1e1e" text-anchor="middle">★ PELA-CGT · Bloque Folicular ★</text>
    </g>
  </svg>`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "convocatoria") {
    return NextResponse.json({
      status: "success",
      lugar: pick(LUGARES),
      horario: pick(HORARIOS),
      motivo: pick(MOTIVOS),
      cantito: pick(CANTITOS),
      gremioSugerido: pick(GREMIOS),
      consignaSugerida: pick(CONSIGNAS_SUGERIDAS)
    });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const svg = buildCartelSvg({ consigna: body.consigna, gremio: body.gremio });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    return new NextResponse(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return NextResponse.json({ error: "Error interno al generar el cartel" }, { status: 500 });
  }
}
