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
