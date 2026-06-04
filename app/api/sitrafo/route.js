import { NextResponse } from "next/server";

// Simple random generator for bureaucratic messages
const REJECTIONS = [
  "Falta el estampillado de la Provincia de Buenos Aires (Ley Folicular 14.821).",
  "La firma digital del escribano capilar no se encuentra certificada por el Colegio de Pelados.",
  "El empleado a cargo de procesar su expediente salió a comprar facturas de dulce de leche.",
  "Mesa de entradas cerrada temporalmente por asamblea extraordinaria del Sindicato de la Pala.",
  "Presentó fotocopia simple. Se requiere copia certificada ante escribano público y tres fotocopias adicionales.",
  "Su nivel de calvicie declarado no coincide con la foto provista. Posible intento de fraude de injerto.",
  "El sistema informático de la Secretaría de Foliculización se encuentra caído por mantenimiento (estimado: 48hs).",
  "No abonó la tasa de timbrado de $450 pesos en un Pago Fácil virtual habilitado."
];

const TRIVIA_TURNO = {
  q: "¿Quién es el máximo exponente del brillo y la argumentación capilar?",
  options: [
    "Juan Domingo Perón",
    "El Pelado Feliz",
    "El Mago Sin Dientes",
    "El Pelado de Crónica"
  ],
  correct: 1
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "turno") {
    const triviaAnswer = searchParams.get("answer");
    
    // Check if they answered trivia correctly to bypass
    if (triviaAnswer !== null) {
      const isCorrect = parseInt(triviaAnswer) === TRIVIA_TURNO.correct;
      if (isCorrect) {
        const appointmentDate = new Date();
        appointmentDate.setFullYear(appointmentDate.getFullYear() + 8); // 8 years from now
        return NextResponse.json({
          status: "success",
          date: appointmentDate.toLocaleDateString("es-AR"),
          time: "07:45 AM",
          office: "Mesa de Entradas de Emergencia - Sótano 2, Anexo B, Ministerio de la Pala",
          code: "TURNO-VIP-" + Math.floor(Math.random() * 900000 + 100000),
          message: "¡Turno asignado excepcionalmente bajo resolución administrativa ministerial!"
        });
      } else {
        return NextResponse.json({
          status: "error",
          message: "Respuesta incorrecta. El trámite ha sido archivado por falta de idoneidad cívico-capilar."
        });
      }
    }

    // 90% of the time, system is down or no slots
    const isSystemDown = Math.random() < 0.85;
    if (isSystemDown) {
      return NextResponse.json({
        status: "no_slots",
        message: "No hay turnos disponibles para los próximos 730 días. El servidor de la Nación se encuentra saturado.",
        trivia: {
          q: TRIVIA_TURNO.q,
          options: TRIVIA_TURNO.options
        }
      });
    }

    // Success (rare)
    const randomYears = Math.floor(Math.random() * 5 + 5); // 5-10 years from now
    const appointmentDate = new Date();
    appointmentDate.setFullYear(appointmentDate.getFullYear() + randomYears);
    return NextResponse.json({
      status: "success",
      date: appointmentDate.toLocaleDateString("es-AR"),
      time: "15:30 PM (sujeto a disponibilidad del empleado)",
      office: "Subdirección General de Alopecía Directa, Ventanilla 4 (atendido por Marta)",
      code: "TRM-" + Math.floor(Math.random() * 900000 + 100000),
      message: "Conserve este código. Debe presentarse con carpeta de cartón amarilla de tres solapas."
    });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, nombre, norwood, photoName } = body;

    if (action === "tramite") {
      if (!nombre || !norwood) {
        return NextResponse.json({
          status: "error",
          message: "Faltan campos obligatorios en el Formulario 93-A."
        });
      }

      // Random rejection (65% chance to simulate bureaucratic rejection)
      const shouldReject = Math.random() < 0.65;
      if (shouldReject) {
        const randomRejection = REJECTIONS[Math.floor(Math.random() * REJECTIONS.length)];
        return NextResponse.json({
          status: "rejected",
          message: randomRejection
        });
      }

      // Successful registration
      const fileNumber = `EXP-SIT-${Math.floor(Math.random() * 90000 + 10000)}/2026`;
      const dniNumber = Math.floor(Math.random() * 10000000 + 35000000);
      
      let rank = "Pelado Común y Silvestre";
      if (norwood >= 6) rank = "Pelado Legendario Superior (Brillo Absoluto)";
      else if (norwood >= 4) rank = "Pelado de Grado Intermedio (Herradura de Acero)";
      else if (norwood >= 2) rank = "Pelado en Trámite (Entradas Prominentes)";

      return NextResponse.json({
        status: "approved",
        message: "¡Su trámite ha sido APROBADO por el Honorable Consejo Capilar!",
        fileNumber,
        dniNumber,
        rank,
        nombre,
        norwood,
        timestamp: new Date().toLocaleString("es-AR")
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
