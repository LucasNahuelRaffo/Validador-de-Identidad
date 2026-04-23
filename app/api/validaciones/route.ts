import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
  const body = await req.json();
  const { nombre_cliente } = body;
  const supabase = getSupabase();

  const token = uuidv4().replace(/-/g, "").slice(0, 12);

  const { data, error } = await supabase
    .from("validaciones")
    .insert({ token, nombre_cliente: nombre_cliente || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}

export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("validaciones")
    .select("*")
    .order("creado_en", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
