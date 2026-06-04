import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, nombre, remainingHairs, headReflectivity, capsOwned } = body;

    if (action === "categorizar") {
      if (!nombre || remainingHairs === undefined || headReflectivity === undefined) {
        return NextResponse.json({
          status: "error",
          message: "Faltan campos obligatorios para la categorización del Monotributo Folicular (F. 460)."
        });
      }

      const hairs = parseInt(remainingHairs) || 0;
      const reflectivity = parseFloat(headReflectivity) || 0;
      const caps = parseInt(capsOwned) || 0;

      let categoria = "A";
      let desc = "Herradura Absoluta (Pelado Puro)";
      let baseTax = 0;
      let exemption = "Exento por falta total de materia prima capilar.";

      if (hairs > 80000) {
        categoria = "K";
        desc = "Melena Presidencial (Cabellera Abundante)";
        baseTax = 45000;
        exemption = "Sujeto a retención máxima de emergencia patria.";
      } else if (hairs > 50000) {
        categoria = "I";
        desc = "Flequillo Rebelde y Tupido";
        baseTax = 28000;
        exemption = "No califica para subsidios de Minoxidil.";
      } else if (hairs > 20000) {
        categoria = "G";
        desc = "Coronilla Expandida";
        baseTax = 12000;
        exemption = "Paga impuesto a las ganancias por retención parcial.";
      } else if (hairs > 5000) {
        categoria = "D";
        desc = "Entradas Prominentes de la Pampa";
        baseTax = 3500;
        exemption = "Reducción del 20% si presenta certificado de gorra permanente.";
      } else if (hairs > 500) {
        categoria = "B";
        desc = "Pelusa Incipiente";
        baseTax = 800;
        exemption = "Categoría subsidiada por el Sindicato de la Pala.";
      }

      // Reflectivity Glare Tax
      const glareTax = Math.floor(reflectivity * 120);
      // Cap tax deduction
      const capDeduction = Math.min(baseTax * 0.5, caps * 350);
      const totalTax = Math.max(0, baseTax + glareTax - capDeduction);

      return NextResponse.json({
        status: "success",
        nombre,
        categoria,
        desc,
        baseTax,
        glareTax,
        capDeduction,
        totalTax,
        cuit: `20-${Math.floor(Math.random() * 80000000 + 10000000)}-${Math.floor(Math.random() * 9)}`,
        date: new Date().toLocaleDateString("es-AR")
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "factura") {
    const nombre = searchParams.get("nombre") || "Contribuyente Anónimo";
    const cuit = searchParams.get("cuit") || "20-99999999-9";
    const categoria = searchParams.get("categoria") || "A";
    const totalTax = parseInt(searchParams.get("totalTax")) || 0;
    const baseTax = parseInt(searchParams.get("baseTax")) || 0;
    const glareTax = parseInt(searchParams.get("glareTax")) || 0;
    const capDeduction = parseInt(searchParams.get("capDeduction")) || 0;

    const invoiceNumber = `0004-${Math.floor(Math.random() * 90000000 + 10000000)}`;
    const cae = Math.floor(Math.random() * 90000000000000 + 10000000000000);
    const caeExpiration = new Date();
    caeExpiration.setDate(caeExpiration.getDate() + 10);

    return NextResponse.json({
      cuitResponsable: "30-50001234-9 (AFIP-ELA NACIÓN)",
      puntoVenta: "0004",
      compNumero: invoiceNumber,
      fecha: new Date().toLocaleDateString("es-AR"),
      cae,
      caeVto: caeExpiration.toLocaleDateString("es-AR"),
      contribuyente: {
        nombre,
        cuit,
        condicion: `Monotributista Folicular - Cat ${categoria}`
      },
      items: [
        { desc: "Tasa Básica Folicular (Monotributo)", precio: baseTax },
        { desc: "Impuesto al Brillo Lumínico y Reflejo en Vía Pública", precio: glareTax },
        { desc: "Descuento por Uso Declarado de Gorra/Sombrero", precio: -capDeduction }
      ],
      total: totalTax
    });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
