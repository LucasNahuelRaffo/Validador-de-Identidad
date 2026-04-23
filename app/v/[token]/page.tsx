"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import DNICapture from "@/components/DNICapture";
import SelfieCapture from "@/components/SelfieCapture";
import ResultadoValidacion from "@/components/ResultadoValidacion";

type Paso = "verificando" | "dni" | "selfie" | "procesando" | "resultado" | "error";

export default function ValidacionPage() {
  const { token } = useParams<{ token: string }>();
  const [paso, setPaso] = useState<Paso>("verificando");
  const [imagenDni, setImagenDni] = useState<string | null>(null);
  const [datosDni, setDatosDni] = useState<Record<string, string>>({});
  const [imagenSelfie, setImagenSelfie] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ estado: "aprobado" | "rechazado"; similitud: number } | null>(null);
  const [mensajeError, setMensajeError] = useState<string>("");
  const [progresoMsg, setProgresoMsg] = useState("Verificando identidad...");

  useEffect(() => {
    fetch(`/api/validaciones/${token}`)
      .then((res) => {
        if (!res.ok) {
          setMensajeError("Este link de validación no es válido o ya expiró.");
          setPaso("error");
        } else {
          setPaso("dni");
        }
      })
      .catch(() => {
        setMensajeError("No se pudo conectar. Verificá tu conexión.");
        setPaso("error");
      });
  }, [token]);

  const capturaDni = useCallback((imagen: string, datos: Record<string, string>) => {
    setImagenDni(imagen);
    setDatosDni(datos);
  }, []);

  const capturaSelfie = useCallback((imagen: string) => {
    setImagenSelfie(imagen);
  }, []);

  const avanzarASelfie = () => { if (imagenDni) setPaso("selfie"); };

  const verificar = async () => {
    if (!imagenDni || !imagenSelfie) return;
    setPaso("procesando");
    setProgresoMsg("Comparando rostros...");

    try {
      const res = await fetch("/api/comparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, imagenDni, imagenSelfie, datosDni }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeError(data.error || "Error en la verificación.");
        setPaso("error");
        return;
      }

      setResultado({ estado: data.estado, similitud: data.similitud });
      setPaso("resultado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMensajeError(`Error de conexión: ${msg}`);
      setPaso("error");
    }
  };

  const reintentar = () => {
    setImagenDni(null);
    setImagenSelfie(null);
    setDatosDni({});
    setResultado(null);
    setMensajeError("");
    setPaso("dni");
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Verificación de identidad</h1>
            <p className="text-xs text-slate-400">Seguro protegido y privado</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-5 py-6 gap-6">
        {(paso === "dni" || paso === "selfie") && (
          <div className="flex items-center gap-2">
            {["dni", "selfie"].map((p, i) => (
              <div key={p} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${paso === p ? "bg-blue-600 text-white" : i < ["dni","selfie"].indexOf(paso) ? "bg-green-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                  {i < ["dni","selfie"].indexOf(paso) ? "✓" : i + 1}
                </div>
                <span className={`text-xs font-medium ${paso === p ? "text-slate-900" : "text-slate-400"}`}>
                  {p === "dni" ? "Foto DNI" : "Selfie"}
                </span>
                {i < 1 && <div className={`flex-1 h-px ${paso === "selfie" ? "bg-green-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex-1">

          {paso === "verificando" && (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <svg className="w-7 h-7 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm text-slate-500">Validando link...</p>
            </div>
          )}

          {paso === "dni" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Paso 1: Foto del DNI</h2>
                <p className="text-xs text-slate-400 mt-0.5">Asegurate que se vean bien los datos y tu foto</p>
              </div>
              <DNICapture onCaptura={capturaDni} />
              {imagenDni && (
                <button onClick={avanzarASelfie} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors">
                  Continuar →
                </button>
              )}
            </div>
          )}

          {paso === "selfie" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Paso 2: Selfie</h2>
                <p className="text-xs text-slate-400 mt-0.5">Mirá directo a la cámara con buena luz</p>
              </div>
              <SelfieCapture onCaptura={capturaSelfie} />
              {imagenSelfie && (
                <button onClick={verificar} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors">
                  Verificar identidad →
                </button>
              )}
            </div>
          )}

          {paso === "procesando" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 text-blue-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <svg className="w-8 h-8 text-blue-600 animate-spin absolute top-4 left-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-base font-medium text-slate-900">{progresoMsg}</p>
                <p className="text-sm text-slate-400 mt-1">La página sigue activa mientras procesamos</p>
              </div>
            </div>
          )}

          {paso === "resultado" && resultado && (
            <ResultadoValidacion estado={resultado.estado} similitud={resultado.similitud} onReintentar={reintentar} />
          )}

          {paso === "error" && (
            <div className="flex flex-col items-center text-center gap-5 py-8">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-red-700">Ocurrió un problema</h2>
                <p className="text-sm text-slate-500 mt-1">{mensajeError}</p>
              </div>
              <button onClick={reintentar} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors">
                Reintentar
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          Tus datos son procesados de forma segura.
        </p>
      </div>
    </main>
  );
}
