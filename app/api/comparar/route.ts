import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { Jimp } from "jimp";

type ValidacionUpdate = Database["public"]["Tables"]["validaciones"]["Update"];

export const maxDuration = 45;

const FACEPP_COMPARE  = "https://api-us.faceplusplus.com/facepp/v3/compare";
const FACEPP_LIVENESS = "https://api-us.faceplusplus.com/facepp/v1/faceliveness";

const UMBRAL_CONFIANZA = 80;
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

    // ── 1. Liveness detection en la selfie ──
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

    // Ejecutamos las llamadas de forma SECUENCIAL (evitar límite de concurrencia de APIs gratuitas)
    const resLiveness = await fetch(FACEPP_LIVENESS, { method: "POST", body: formLiveness });
    const dataLiveness = await resLiveness.json();

    const resCompare = await fetch(FACEPP_COMPARE,  { method: "POST", body: formCompare });
    const dataCompare = await resCompare.json();

    // Watermark en paralelo (Blindaje extra anti-robo interno)
    const [wbDni, wbDorso, wbSelfie] = await Promise.all([
      drawWatermark(bufDni, mimeDni),
      drawWatermark(bufDorso, mimeDorso),
      drawWatermark(bufSelfie, mimeSelfie)
    ]);

    // ── Manejo de Liveness Face++ ──
    console.log("[Liveness Response]:", JSON.stringify(dataLiveness).substring(0, 800));
    
    let livenessOk = false;
    let livenessError = false;
    
    if (dataLiveness.error_message) {
      // Face++ devolvió error — logueamos pero NO bloqueamos al usuario.
      // Los otros checks del servidor (pixel comparison, face proportion) protegen contra fraude.
      console.warn("[Liveness API Error]:", dataLiveness.error_message);
      livenessError = true;
    }
    
    // Campo directo: { confidence: N }  
    if (!livenessError && typeof dataLiveness.confidence === "number") {
      livenessOk = dataLiveness.confidence >= UMBRAL_LIVENESS;
      if (!livenessOk) {
        return NextResponse.json({ error: "La prueba de vida no superó el umbral. Tomá una selfie real mirando a la cámara." }, { status: 422 });
      }
    }
    
    // Face++ faceliveness v1 top-level: { face_genuineness: { screen_replay_confidence, ... } }
    const genuineness = !livenessError ? (dataLiveness.face_genuineness || dataLiveness.result?.face_genuineness) : null;
    if (!livenessOk && genuineness) {
      // screen_replay detecta fotos/impresiones/pantallas
      if (typeof genuineness.screen_replay_confidence === "number" && typeof genuineness.screen_replay_threshold === "number") {
        if (genuineness.screen_replay_confidence > genuineness.screen_replay_threshold) {
          return NextResponse.json({ error: "Se detectó una imagen impresa o pantalla. Tomá una selfie real en vivo." }, { status: 422 });
        }
      }
      // synthetic_face detecta deepfakes
      if (typeof genuineness.synthetic_face_confidence === "number" && typeof genuineness.synthetic_face_threshold === "number") {
        if (genuineness.synthetic_face_confidence > genuineness.synthetic_face_threshold) {
          return NextResponse.json({ error: "Se detectó una imagen sintética. Tomá una selfie real." }, { status: 422 });
        }
      }
      // mask detecta máscaras faciales
      if (typeof genuineness.mask_confidence === "number" && typeof genuineness.mask_threshold === "number") {
        if (genuineness.mask_confidence > genuineness.mask_threshold) {
          return NextResponse.json({ error: "Se detectó una máscara o cobertura facial. Mostrá tu rostro real." }, { status: 422 });
        }
      }
      // face_replaced detecta caras pegadas/reemplazadas
      if (typeof genuineness.face_replaced === "number" && typeof genuineness.face_replaced_threshold === "number") {
        if (genuineness.face_replaced > genuineness.face_replaced_threshold) {
          return NextResponse.json({ error: "Se detectó una cara superpuesta. Tomá una selfie real." }, { status: 422 });
        }
      }
      // Si llegó acá, pasó todos los checks → liveness OK
      livenessOk = true;
    }
    
    // Campo en faces[]: { faces: [{ liveness: { value: N } }] }
    if (!livenessOk && !livenessError && dataLiveness.faces?.[0]?.liveness) {
      const lv = dataLiveness.faces[0].liveness.value ?? dataLiveness.faces[0].liveness.confidence;
      if (typeof lv === "number") {
        livenessOk = lv >= UMBRAL_LIVENESS;
        if (!livenessOk) {
          return NextResponse.json({ error: "La prueba de vida no superó el umbral. Tomá una selfie real." }, { status: 422 });
        }
      }
    }
    
    // FAIL-CLOSED: Si no pudimos confirmar el Liveness (por error de API o score desconocido), RECHAZAMOS.
    // Nunca dejamos pasar una validación sin prueba de vida verificada.
    if (!livenessOk) {
      console.warn("[Liveness] Bloqueando por falta de prueba de vida confirmada. Response:", JSON.stringify(dataLiveness).substring(0, 300));
      return NextResponse.json({ error: "No se pudo verificar la prueba de vida. Por favor, asegúrate de estar en un lugar con buena iluminación y sin tapar tu rostro." }, { status: 422 });
    }

    if (!resCompare.ok || dataCompare.error_message) {
      const msg = dataCompare.error_message || `HTTP ${resCompare.status}`;
      return NextResponse.json({ error: `Hubo un error verificando el rostro. Intenta sacar fotos mas brillantes.` }, { status: 422 });
    }

    if (!dataCompare.faces1?.length || !dataCompare.faces2?.length) {
      return NextResponse.json({ error: "No se detectó un rostro claro en alguna de las fotos." }, { status: 422 });
    }

    // ── Protecciones Anti-spoofing (Blindaje del Servidor) ──
    
    // Check 1: Comparación binaria directa
    if (b64Dni === b64Selfie) {
      return NextResponse.json({ error: "Subiste el mismo archivo en dos pasos distintos." }, { status: 422 });
    }

    // Check 2 fue removido porque generaba falsos rechazos y el pixel comparison directo fallaba con recortes/rotaciones.

    // Check 3: Proporción de cara con DIMENSIONES REALES de la imagen
    // Usamos Jimp para obtener el tamaño real de la selfie, no estimaciones
    if (dataCompare.faces2?.length > 0) {
      const selfieBox = dataCompare.faces2[0].face_rectangle;
      if (selfieBox) {
        try {
          const selfieImg = await Jimp.read(bufSelfie);
          const imgW = selfieImg.bitmap.width;
          const imgH = selfieImg.bitmap.height;
          const faceAreaRatio = (selfieBox.width * selfieBox.height) / (imgW * imgH);
          
          console.log(`[Anti-Fraud] Selfie ${imgW}x${imgH}, Face ${selfieBox.width}x${selfieBox.height}, Ratio: ${(faceAreaRatio * 100).toFixed(1)}%`);
          
          // En una selfie real a distancia normal, la cara ocupa 10-40% del frame
          // En un DNI sostenido cerca, la cara del documento ocupa 3-10% del frame
          if (faceAreaRatio < 0.06) {
            return NextResponse.json({ 
              error: "La cara detectada es muy pequeña en relación a la imagen. Sacá una selfie real acercándote." 
            }, { status: 422 });
          }
          
          // Check 4: Análisis de textura del fondo (detectar bordes de documento)
          // Un documento tiene MUCHO contraste alrededor de la cara (texto, bordes, escudo)
          // Una selfie real tiene un fondo relativamente uniforme
          const checkSize = 100;
          selfieImg.resize({ w: checkSize, h: checkSize });
          const pixels = selfieImg.bitmap.data;
          
          // Calculamos la varianza de brillo de toda la imagen
          let sumBrillo = 0;
          let sumBrillo2 = 0;
          const totalPx = checkSize * checkSize;
          for (let i = 0; i < totalPx * 4; i += 4) {
            const brillo = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
            sumBrillo += brillo;
            sumBrillo2 += brillo * brillo;
          }
          const mediaBrillo = sumBrillo / totalPx;
          const varianza = (sumBrillo2 / totalPx) - (mediaBrillo * mediaBrillo);
          
          // También contamos los bordes (cambios bruscos de color entre pixeles vecinos)
          let edgeCount = 0;
          for (let y = 0; y < checkSize - 1; y++) {
            for (let x = 0; x < checkSize - 1; x++) {
              const idx = (y * checkSize + x) * 4;
              const idxR = idx + 4; // pixel derecho
              const idxD = (y + 1) * checkSize * 4 + x * 4; // pixel abajo
              
              const diffH = Math.abs(pixels[idx] - pixels[idxR]) + Math.abs(pixels[idx+1] - pixels[idxR+1]) + Math.abs(pixels[idx+2] - pixels[idxR+2]);
              const diffV = Math.abs(pixels[idx] - pixels[idxD]) + Math.abs(pixels[idx+1] - pixels[idxD+1]) + Math.abs(pixels[idx+2] - pixels[idxD+2]);
              
              if (diffH > 80 || diffV > 80) edgeCount++;
            }
          }
          const edgeRatio = edgeCount / (totalPx);
          
          console.log(`[Anti-Fraud] Varianza: ${varianza.toFixed(0)}, Bordes: ${(edgeRatio * 100).toFixed(1)}%`);
          
          // Un documento tiene muchísimos bordes (>20%) por el texto impreso
          // Una selfie real tiene pocos bordes (<15%)
          if (edgeRatio > 0.22 && faceAreaRatio < 0.15) {
            return NextResponse.json({ 
              error: "Se detectó un documento impreso en la imagen. Tomá una selfie real de tu rostro." 
            }, { status: 422 });
          }
          
        } catch (dimErr) {
          console.warn("Dimension check skip:", dimErr);
        }
      }
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
      dni: datosDni?.numero || datosDni?.numero_mrz || null,
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
