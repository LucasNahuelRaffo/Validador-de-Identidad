import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type ValidacionUpdate = Database["public"]["Tables"]["validaciones"]["Update"];

export const maxDuration = 30;

const FACEPP_ENDPOINT = "https://api-us.faceplusplus.com/facepp/v3/compare";

// Face++ recomienda threshold ~76 para FAR 1e-5 (muy estricto, uso real en identidad)
// Usamos 70 para ser un poco más permisivos con fotos de DNI reflejadas/iluminación variable
const UMBRAL_CONFIANZA = 70;

function parseDataUrl(dataUrl: string): { mime: string; b64: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) return { mime: match[1], b64: match[2] };
  return { mime: "image/jpeg", b64: dataUrl };
}

// Face++ tiene límite de 2MB por imagen. Tamaño en bytes del base64 decodificado.
const LIMITE_BYTES = 2 * 1024 * 1024;
function base64Size(b64: string): number {
  // Aproximación: cada 4 chars base64 = 3 bytes
  return Math.floor((b64.length * 3) / 4);
}

export async function POST(req: Request) {
  try {
    const { token, imagenDni, imagenSelfie, datosDni } = await req.json();

    if (!token || !imagenDni || !imagenSelfie) {
      return NextResponse.json({ error: "Faltan datos requeridos." }, { status: 400 });
    }

    const apiKey = process.env.FACEPP_API_KEY;
    const apiSecret = process.env.FACEPP_API_SECRET;
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Face++ no está configurado." }, { status: 500 });
    }

    const { mime: mimeDni, b64: b64Dni } = parseDataUrl(imagenDni);
    const { mime: mimeSelfie, b64: b64Selfie } = parseDataUrl(imagenSelfie);

    // Face++ solo acepta JPG/PNG. Si viene otro formato (HEIC, WebP), rechazar con mensaje claro
    const formatosOk = ["image/jpeg", "image/jpg", "image/png"];
    if (!formatosOk.includes(mimeDni)) {
      return NextResponse.json({ error: `Formato del DNI no soportado (${mimeDni}). Usá JPG o PNG.` }, { status: 422 });
    }
    if (!formatosOk.includes(mimeSelfie)) {
      return NextResponse.json({ error: `Formato de la selfie no soportado (${mimeSelfie}).` }, { status: 422 });
    }

    if (base64Size(b64Dni) > LIMITE_BYTES) {
      return NextResponse.json({ error: "La foto del DNI pesa demasiado. Intentá con una foto más chica (máx 2MB)." }, { status: 413 });
    }
    if (base64Size(b64Selfie) > LIMITE_BYTES) {
      return NextResponse.json({ error: "La selfie pesa demasiado (máx 2MB)." }, { status: 413 });
    }

    // Enviamos las imágenes como archivos (image_file1/2) vía multipart/form-data
    // Es el método más confiable con Face++ para imágenes grandes
    const bufDni = Buffer.from(b64Dni, "base64");
    const bufSelfie = Buffer.from(b64Selfie, "base64");

    const form = new FormData();
    form.append("api_key", apiKey);
    form.append("api_secret", apiSecret);
    const extDni = mimeDni === "image/png" ? "png" : "jpg";
    const extSelfie = mimeSelfie === "image/png" ? "png" : "jpg";
    form.append("image_file1", new Blob([new Uint8Array(bufDni)], { type: mimeDni }), `dni.${extDni}`);
    form.append("image_file2", new Blob([new Uint8Array(bufSelfie)], { type: mimeSelfie }), `selfie.${extSelfie}`);

    const res = await fetch(FACEPP_ENDPOINT, { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok || data.error_message) {
      const msg = data.error_message || `HTTP ${res.status}`;
      if (typeof msg === "string") {
        if (msg.includes("IMAGE_ERROR_UNSUPPORTED_FORMAT")) {
          return NextResponse.json({ error: "Formato de imagen no soportado." }, { status: 422 });
        }
        if (msg.includes("INVALID_IMAGE_SIZE")) {
          return NextResponse.json({ error: "La imagen es demasiado grande o chica." }, { status: 422 });
        }
        if (msg.includes("IMAGE_FILE_TOO_LARGE")) {
          return NextResponse.json({ error: "La imagen pesa demasiado (máx 2MB)." }, { status: 422 });
        }
      }
      console.error("[Face++]", msg, data);
      return NextResponse.json({ error: `Error de Face++: ${msg}` }, { status: 502 });
    }

    // Face++ devuelve faces1[] / faces2[] - si están vacíos, no detectó cara
    if (!data.faces1 || data.faces1.length === 0) {
      return NextResponse.json(
        { error: "No se detectó ningún rostro en la foto del DNI. Probá con mejor iluminación o un ángulo más frontal." },
        { status: 422 }
      );
    }
    if (!data.faces2 || data.faces2.length === 0) {
      return NextResponse.json(
        { error: "No se detectó ningún rostro en la selfie. Asegurate de mirar a la cámara." },
        { status: 422 }
      );
    }

    const confianza: number = data.confidence; // 0-100
    const similitud = confianza / 100; // normalizamos a 0-1 para mantener el schema existente
    const estado: ValidacionUpdate["estado"] = confianza >= UMBRAL_CONFIANZA ? "aprobado" : "rechazado";

    const supabase = getSupabase();
    await supabase.from("validaciones").update({
      estado,
      similitud_facial: similitud,
      dni: datosDni?.numero || null,
      datos_dni: datosDni || null,
    }).eq("token", token);

    return NextResponse.json({ similitud, estado, confianza });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/comparar]", msg);
    return NextResponse.json({ error: `Error interno: ${msg}` }, { status: 500 });
  }
}
