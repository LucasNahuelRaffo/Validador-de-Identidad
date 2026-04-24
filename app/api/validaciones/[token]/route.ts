import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type ValidacionUpdate = Database["public"]["Tables"]["validaciones"]["Update"];

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("validaciones")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // === VALIDACIONES DE EXPIRACIÓN ===

  // 1. Ya aprobado
  if (data.estado === "aprobado") {
    return NextResponse.json({ 
      expirado: true, 
      razon: "aprobado",
      mensaje: "Esta verificación ya fue completada exitosamente." 
    }, { status: 410 });
  }

  // 2. Más de 3 intentos
  if (data.intentos && data.intentos >= 3) {
    return NextResponse.json({ 
      expirado: true, 
      razon: "intentos",
      mensaje: "Se superó el límite de intentos permitidos (3)." 
    }, { status: 410 });
  }

  // 3. Más de 1 hora desde la creación
  const creadoEn = new Date(data.creado_en);
  const ahora = new Date();
  const diffMs = ahora.getTime() - creadoEn.getTime();
  const unaHoraMs = 60 * 60 * 1000;
  
  if (diffMs > unaHoraMs) {
    return NextResponse.json({ 
      expirado: true, 
      razon: "expirado",
      mensaje: "Este enlace expiró. Los links tienen una validez de 1 hora." 
    }, { status: 410 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json()) as ValidacionUpdate;
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("validaciones")
    .update(body)
    .eq("token", token)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
