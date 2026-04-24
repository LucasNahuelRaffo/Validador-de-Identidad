import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = getSupabase();

    // 1. Obtener los metadatos de esa validación (para saber las extensiones si las hay)
    const { data: val, error: valErr } = await supabase
      .from("validaciones")
      .select("datos_dni")
      .eq("token", token)
      .single();

    if (valErr || !val) {
      return NextResponse.json({ error: "Validación no encontrada." }, { status: 404 });
    }

    const result = val as { datos_dni: Record<string, string> | null };
    const datos_dni = result.datos_dni;
    const extDni = datos_dni?.ext_dni || "jpg";
    const extSelfie = datos_dni?.ext_selfie || "jpg";

    // 2. Pedir URLs firmadas al Storage (válidas por 600 segundos)
    const [dniUrlData, selfieUrlData] = await Promise.all([
      supabase.storage.from("validaciones").createSignedUrl(`${token}/dni.${extDni}`, 600),
      supabase.storage.from("validaciones").createSignedUrl(`${token}/selfie.${extSelfie}`, 600)
    ]);

    if (dniUrlData.error && selfieUrlData.error) {
       return NextResponse.json({ error: "No se encontraron las fotos de este usuario." }, { status: 404 });
    }

    return NextResponse.json({
       dniUrl: dniUrlData.data?.signedUrl || null,
       selfieUrl: selfieUrlData.data?.signedUrl || null,
    });
  } catch (err) {
    console.error("[/api/validaciones/fotos]", err);
    return NextResponse.json({ error: "Error obteniendo fotos" }, { status: 500 });
  }
}
