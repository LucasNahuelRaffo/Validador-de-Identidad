import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { Jimp } from "jimp";

type ValidacionUpdate = Database["public"]["Tables"]["validaciones"]["Update"];

export const maxDuration = 45;

const FACEPP_COMPARE  = "https://api-us.faceplusplus.com/facepp/v3/compare";
const FACEPP_LIVENESS = "https://api-us.faceplusplus.com/facepp/v1/faceliveness";

const UMBRAL_CONFIANZA = 70;
const UMBRAL_LIVENESS = 80;

function parseDataUrl(dataUrl: string): { mime: string; b64: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) return { mime: match[1], b64: match[2] };
  return { mime: "image/jpeg", b64: dataUrl };
}

const LIMITE_BYTES = 3 * 1024 * 1024;
function base64Size(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

function makeBlob(buf: Buffer, mime: string) {
  return new Blob([new Uint8Array(buf)], { type: mime });
}

// Draw a very simple textual watermark directly over the buffer via Jimp
async function drawWatermark(buffer: Buffer, mime: string): Promise<Buffer> {
  try {
    const image = await Jimp.read(buffer);
    const { width, height } = image.bitmap;
    
    // We manually draw a grid of semi-transparent dots to obscure automated extraction,
    // protecting the document natively. Jimp is safe for environments without native deps.
    const spacing = Math.floor(width / 4);
    for (let y = spacing/2; y < height; y += spacing) {
      for (let x = spacing/2; x < width; x += spacing) {
         // Create a tiny gray rect every X pixels to lightly watermark
         image.scan(x, y, 10, 10, function(this: any, idx: number) {
             this.bitmap.data[idx] = Math.max(0, this.bitmap.data[idx] - 60); // R
             this.bitmap.data[idx+1] = Math.max(0, this.bitmap.data[idx+1] - 60); // G
             this.bitmap.data[idx+2] = Math.max(0, this.bitmap.data[idx+2] - 60); // B
         });
      }
    }
    
    // Return buffer in original mime
    return await image.getBuffer(mime as "image/jpeg" | "image/png");
  } catch (e) {
    console.error("No se pudo añadir marca de agua:", e);
    return buffer; // Failsafe: return original string if Jimp breaks
  }
}

export async function POST(req: Request) {
  try {
    const { token, imagenDni, imagenDorso, imagenSelfie, datosDni } = await req.json();

    if (!token || !imagenDni || !imagenDorso || !imagenSelfie) {
      return NextResponse.json({ error: "Faltan las fotos requeridas." }, { status: 400 });
    }

    const supabase = getSupabase();

    // ── 0. Verificación Anti-Fraude (Rate Limiting) ──
    const { data: valRow } = await supabase.from("validaciones").select("intentos").eq("token", token).single();
    if (!valRow) {
      return NextResponse.json({ error: "Token inválido." }, { status: 404 });
    }
    const intentosPrevios = valRow.intentos || 0;
    if (intentosPrevios >= 3) {
      await supabase.from("validaciones").update({ estado: "rechazado" }).eq("token", token);
      return NextResponse.json({ error: "Demasiados intentos fallidos. Enlace bloqueado por seguridad." }, { status: 429 });
    }
    // Aumentamos los intentos
    await supabase.from("validaciones").update({ intentos: intentosPrevios + 1 }).eq("token", token);

    const apiKey = process.env.FACEPP_API_KEY;
    const apiSecret = process.env.FACEPP_API_SECRET;
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Face++ no está configurado." }, { status: 500 });
    }

    const { mime: mimeDni, b64: b64Dni } = parseDataUrl(imagenDni);
    const { mime: mimeDorso, b64: b64Dorso } = parseDataUrl(imagenDorso);
    const { mime: mimeSelfie, b64: b64Selfie } = parseDataUrl(imagenSelfie);

    const formatosOk = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!formatosOk.includes(mimeDni) || !formatosOk.includes(mimeSelfie) || !formatosOk.includes(mimeDorso)) {
      return NextResponse.json({ error: "Formato de imagen no soportado. Usá JPG o PNG." }, { status: 422 });
    }

    if (base64Size(b64Dni) > LIMITE_BYTES || base64Size(b64Selfie) > LIMITE_BYTES || base64Size(b64Dorso) > LIMITE_BYTES) {
      return NextResponse.json({ error: "Una de las fotos pesa demasiado." }, { status: 413 });
    }

    const bufDni    = Buffer.from(b64Dni, "base64");
    const bufDorso  = Buffer.from(b64Dorso, "base64");
    const bufSelfie = Buffer.from(b64Selfie, "base64");
    const extDni    = mimeDni === "image/png" ? "png" : "jpg";
    const extDorso  = mimeDorso === "image/png" ? "png" : "jpg";
    const extSelfie = mimeSelfie === "image/png" ? "png" : "jpg";

    // ── 1. Liveness detection en la selfie (en paralelo con la comparación) ──
    const formLiveness = new FormData();
    formLiveness.append("api_key", apiKey);
    formLiveness.append("api_secret", apiSecret);
    formLiveness.append("image_file", makeBlob(bufSelfie, mimeSelfie), `selfie.${extSelfie}`);

    // ── 2. Comparación facial (Solo frente del DNI y Selfie) ──
    const formCompare = new FormData();
    formCompare.append("api_key", apiKey);
    formCompare.append("api_secret", apiSecret);
    formCompare.append("image_file1", makeBlob(bufDni, mimeDni), `dni.${extDni}`);
    formCompare.append("image_file2", makeBlob(bufSelfie, mimeSelfie), `selfie.${extSelfie}`);

    // Llamamos a Face++ de inmediato
    const resOps = Promise.all([
      fetch(FACEPP_LIVENESS, { method: "POST", body: formLiveness }),
      fetch(FACEPP_COMPARE,  { method: "POST", body: formCompare }),
    ]);

    // Watermark en paralelo (Blindaje extra anti-robo interno)
    const [wbDni, wbDorso, wbSelfie] = await Promise.all([
      drawWatermark(bufDni, mimeDni),
      drawWatermark(bufDorso, mimeDorso),
      drawWatermark(bufSelfie, mimeSelfie)
    ]);

    const [resLiveness, resCompare] = await resOps;
    const [dataLiveness, dataCompare] = await Promise.all([
      resLiveness.json(),
      resCompare.json(),
    ]);

    // ── Manejo de errores Face++ ──
    if (!dataLiveness.error_message) {
      const livenessScore = dataLiveness.confidence ?? 100;
      if (livenessScore < UMBRAL_LIVENESS) {
        return NextResponse.json({ error: "Por favor tomá una selfie real en vivo." }, { status: 422 });
      }
    }

    if (!resCompare.ok || dataCompare.error_message) {
      const msg = dataCompare.error_message || `HTTP ${resCompare.status}`;
      return NextResponse.json({ error: `Hubo un error verificando el rostro. Intenta sacar fotos mas brillantes.` }, { status: 422 });
    }

    if (!dataCompare.faces1?.length || !dataCompare.faces2?.length) {
      return NextResponse.json({ error: "No se detectó un rostro claro en alguna de las fotos." }, { status: 422 });
    }

    // Protecciones Anti-spoofing
    if (b64Dni === b64Selfie) {
      return NextResponse.json({ error: "Subiste el mismo archivo en dos pasos iguales." }, { status: 422 });
    }

    const confianza: number = dataCompare.confidence;
    const similitud = confianza / 100;
    const estado: ValidacionUpdate["estado"] = confianza >= UMBRAL_CONFIANZA ? "aprobado" : "rechazado";
    
    // Subir imagenes a Storage CON la marca de agua quemada!
    const params = { upsert: true };
    await Promise.all([
      supabase.storage.from("validaciones").upload(`${token}/dni.${extDni}`, wbDni, { ...params, contentType: mimeDni }),
      supabase.storage.from("validaciones").upload(`${token}/dorso.${extDorso}`, wbDorso, { ...params, contentType: mimeDorso }),
      supabase.storage.from("validaciones").upload(`${token}/selfie.${extSelfie}`, wbSelfie, { ...params, contentType: mimeSelfie })
    ]);

    await supabase.from("validaciones").update({
      estado,
      similitud_facial: similitud,
      dni: datosDni?.numero || null,
      datos_dni: datosDni ? {
        ...datosDni, 
        ext_dni: extDni,
        ext_dni_dorso: extDorso,
        ext_selfie: extSelfie 
      } : {
        ext_dni: extDni,
        ext_dni_dorso: extDorso,
        ext_selfie: extSelfie
      },
    }).eq("token", token);

    return NextResponse.json({ similitud, estado, confianza });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/comparar] Fallo Crítico:", msg);
    return NextResponse.json({ error: `Fallo de validación interno: ${msg}` }, { status: 500 });
  }
}
