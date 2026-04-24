import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type ValidacionUpdate = Database["public"]["Tables"]["validaciones"]["Update"];

export const maxDuration = 30;

const FACEPP_COMPARE  = "https://api-us.faceplusplus.com/facepp/v3/compare";
const FACEPP_LIVENESS = "https://api-us.faceplusplus.com/facepp/v1/faceliveness";

// Umbral de confianza de comparación facial (0-100)
const UMBRAL_CONFIANZA = 70;
// Umbral de liveness: Face++ devuelve 0-100, >50 = persona real
const UMBRAL_LIVENESS = 50;

function parseDataUrl(dataUrl: string): { mime: string; b64: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) return { mime: match[1], b64: match[2] };
  return { mime: "image/jpeg", b64: dataUrl };
}

const LIMITE_BYTES = 2 * 1024 * 1024;
function base64Size(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

function makeBlob(buf: Buffer, mime: string) {
  return new Blob([new Uint8Array(buf)], { type: mime });
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

    const formatosOk = ["image/jpeg", "image/jpg", "image/png"];
    if (!formatosOk.includes(mimeDni)) {
      return NextResponse.json({ error: `Formato del DNI no soportado (${mimeDni}). Usá JPG o PNG.` }, { status: 422 });
    }
    if (!formatosOk.includes(mimeSelfie)) {
      return NextResponse.json({ error: `Formato de la selfie no soportado (${mimeSelfie}).` }, { status: 422 });
    }

    if (base64Size(b64Dni) > LIMITE_BYTES) {
      return NextResponse.json({ error: "La foto del DNI pesa demasiado (máx 2MB)." }, { status: 413 });
    }
    if (base64Size(b64Selfie) > LIMITE_BYTES) {
      return NextResponse.json({ error: "La selfie pesa demasiado (máx 2MB)." }, { status: 413 });
    }

    const bufDni    = Buffer.from(b64Dni, "base64");
    const bufSelfie = Buffer.from(b64Selfie, "base64");
    const extDni    = mimeDni === "image/png" ? "png" : "jpg";
    const extSelfie = mimeSelfie === "image/png" ? "png" : "jpg";

    // ── 1. Liveness detection en la selfie (en paralelo con la comparación) ──
    const formLiveness = new FormData();
    formLiveness.append("api_key", apiKey);
    formLiveness.append("api_secret", apiSecret);
    formLiveness.append("image_file", makeBlob(bufSelfie, mimeSelfie), `selfie.${extSelfie}`);

    // ── 2. Comparación facial ──
    const formCompare = new FormData();
    formCompare.append("api_key", apiKey);
    formCompare.append("api_secret", apiSecret);
    formCompare.append("image_file1", makeBlob(bufDni, mimeDni), `dni.${extDni}`);
    formCompare.append("image_file2", makeBlob(bufSelfie, mimeSelfie), `selfie.${extSelfie}`);

    // Llamamos ambas en paralelo para ahorrar tiempo
    const [resLiveness, resCompare] = await Promise.all([
      fetch(FACEPP_LIVENESS, { method: "POST", body: formLiveness }),
      fetch(FACEPP_COMPARE,  { method: "POST", body: formCompare }),
    ]);

    const [dataLiveness, dataCompare] = await Promise.all([
      resLiveness.json(),
      resCompare.json(),
    ]);

    // ── Manejo de errores de liveness ──
    console.log("[Liveness] respuesta completa:", JSON.stringify(dataLiveness));
    if (dataLiveness.error_message) {
      // Endpoint de liveness no disponible en este plan — logueamos y continuamos
      console.warn("[Face++ Liveness] error (se omite el check):", dataLiveness.error_message);
    } else {
      const livenessScore: number = dataLiveness.confidence ?? 100;
      console.log(`[Liveness] score=${livenessScore}`);
      if (livenessScore < UMBRAL_LIVENESS) {
        return NextResponse.json(
          { error: "La selfie parece ser una foto de una foto. Por favor tomá una selfie real mirando a la cámara." },
          { status: 422 }
        );
      }
    }

    // ── Manejo de errores de comparación ──
    if (!resCompare.ok || dataCompare.error_message) {
      const msg = dataCompare.error_message || `HTTP ${resCompare.status}`;
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
      console.error("[Face++ Compare]", msg, dataCompare);
      return NextResponse.json({ error: `Error de Face++: ${msg}` }, { status: 502 });
    }

    if (!dataCompare.faces1 || dataCompare.faces1.length === 0) {
      return NextResponse.json(
        { error: "No se detectó ningún rostro en la foto del DNI. Probá con mejor iluminación o un ángulo más frontal." },
        { status: 422 }
      );
    }
    if (!dataCompare.faces2 || dataCompare.faces2.length === 0) {
      return NextResponse.json(
        { error: "No se detectó ningún rostro en la selfie. Asegurate de mirar a la cámara." },
        { status: 422 }
      );
    }

    // ── 3. Protecciones de Seguridad (Anti-spoofing manual) ──
    // Si la imagen es exactamente el mismo archivo:
    if (b64Dni === b64Selfie) {
      return NextResponse.json(
        { error: "La selfie cargada es exactamente el mismo archivo que el DNI. Por favor, tomate una selfie real." },
        { status: 422 }
      );
    }

    const confianza: number = dataCompare.confidence;
    
    // Si la similitud es sospechosamente alta (> 95%), casi seguro es una foto de una foto.
    // Una selfie real contra un DNI impreso muy raramente supera el 90-95% por diferencias de luz, cámara, textura, etc.
    if (confianza > 95) {
      return NextResponse.json(
        { error: "La selfie detectada es sospechosamente idéntica a la del DNI (posible foto de una foto). Por favor, tomate una selfie real en vivo." },
        { status: 422 }
      );
    }

    const similitud = confianza / 100;
    const estado: ValidacionUpdate["estado"] = confianza >= UMBRAL_CONFIANZA ? "aprobado" : "rechazado";

    const supabase = getSupabase();
    
    // Subir imagenes a Storage si configuró el bucket, si falla silenciar para no romper
    try {
      await supabase.storage.from("validaciones").upload(`${token}/dni.${extDni}`, bufDni, {
        contentType: mimeDni,
        upsert: true
      });
      await supabase.storage.from("validaciones").upload(`${token}/selfie.${extSelfie}`, bufSelfie, {
        contentType: mimeSelfie,
        upsert: true
      });
    } catch (err) {
      console.warn("No se pudo subir imágenes al Storage, verifica si creaste el bucket llamado 'validaciones'", err);
    }

    await supabase.from("validaciones").update({
      estado,
      similitud_facial: similitud,
      dni: datosDni?.numero || null,
      datos_dni: datosDni ? {
        ...datosDni, 
        ext_dni: extDni,
        ext_selfie: extSelfie 
      } : {
        ext_dni: extDni,
        ext_selfie: extSelfie
      },
    }).eq("token", token);

    return NextResponse.json({ similitud, estado, confianza });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/comparar]", msg);
    return NextResponse.json({ error: `Error interno: ${msg}` }, { status: 500 });
  }
}
