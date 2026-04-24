"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import DNICapture from "@/components/DNICapture";
import SelfieCapture from "@/components/SelfieCapture";
import ResultadoValidacion from "@/components/ResultadoValidacion";
import { QRCodeSVG } from 'qrcode.react';
import { getSupabase } from "@/lib/supabase";

type Paso = "verificando" | "qr_desktop" | "dniFrente" | "dniDorso" | "selfie" | "procesando" | "resultado" | "error";

export default function ValidacionPage() {
  const { token } = useParams<{ token: string }>();
  const [paso, setPaso] = useState<Paso>("verificando");
  const [isDesktop, setIsDesktop] = useState(false);
  const [forceMobile, setForceMobile] = useState(false);
  
  const [imagenDniFrente, setImagenDniFrente] = useState<string | null>(null);
  const [imagenDniDorso, setImagenDniDorso] = useState<string | null>(null);
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
          return;
        }

        // Detección rudimentaria de Desktop
        const ua = navigator.userAgent;
        if (/Mobi|Android/i.test(ua)) {
          setPaso("dniFrente");
        } else {
          setIsDesktop(true);
          setPaso("qr_desktop"); // PC user!
        }
      })
      .catch(() => {
        setMensajeError("No se pudo conectar. Verificá tu conexión.");
        setPaso("error");
      });
  }, [token]);

  // Si estamos en Desktop, suscribirse por WebSocket usando Supabase Realtime
  useEffect(() => {
    if (paso !== "qr_desktop") return;

    const supabase = getSupabase();
    console.log("Suscribiendo a validacion:", token);
    const channel = supabase.channel('validacion_status')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'validaciones', 
        filter: `token=eq.${token}` 
      }, (payload) => {
        const newData = payload.new;
        if (newData.estado === "aprobado" || newData.estado === "rechazado") {
          setResultado({ estado: newData.estado, similitud: newData.similitud_facial || 0 });
          setPaso("resultado");
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [paso, token]);

  const capturaDniFrente = useCallback((imagen: string, datos?: Record<string, string>) => {
    setImagenDniFrente(imagen);
    if (datos) setDatosDni(d => ({ ...d, ...datos }));
  }, []);

  const capturaDniDorso = useCallback((imagen: string, datos?: Record<string, string>) => {
    setImagenDniDorso(imagen);
    if (datos) setDatosDni(d => ({ ...d, ...datos }));
  }, []);

  const capturaSelfie = useCallback((imagen: string) => {
    setImagenSelfie(imagen);
  }, []);

  const continuarADorso = () => setPaso("dniDorso");
  const avanzarASelfie = () => setPaso("selfie");

  const verificar = async () => {
    if (!imagenDniFrente || !imagenDniDorso || !imagenSelfie) return;
    setPaso("procesando");
    setProgresoMsg("Subiendo fotos y analizando...");

    try {
      const res = await fetch("/api/comparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token, 
          imagenDni: imagenDniFrente, 
          imagenDorso: imagenDniDorso, 
          imagenSelfie, 
          datosDni 
        }),
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
    setImagenDniFrente(null);
    setImagenDniDorso(null);
    setImagenSelfie(null);
    setDatosDni({});
    setResultado(null);
    setMensajeError("");
    setPaso(forceMobile || !isDesktop ? "dniFrente" : "qr_desktop");
  };

  // Cálculo para la barra de pasos visual
  const stepIndex = ["dniFrente", "dniDorso", "selfie"].indexOf(paso);
  const esPasoActivo = stepIndex !== -1;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-5 py-4 shadow-sm relative z-10">
        <div className="flex items-center gap-2.5 max-w-md mx-auto w-full">
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
        
        {paso === "qr_desktop" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Mejor desde el celular</h2>
              <p className="text-sm text-slate-500 mt-2">
                Para tomar fotos más nítidas de tu DNI, te recomendamos abrir este mismo enlace escaneando el código QR con tu teléfono. 
              </p>
            </div>

            <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm inline-block">
              {/* @ts-ignore - QRCodeSVG types issue sometimes */}
              <QRCodeSVG value={typeof window !== 'undefined' ? window.location.href : ""} size={180} />
            </div>

            <p className="text-xs text-slate-400 animate-pulse flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Esperando a que completes desde el celular...
            </p>

            <button 
              onClick={() => { setForceMobile(true); setPaso("dniFrente"); }}
              className="text-sm text-blue-600 font-medium hover:underline mt-4"
            >
              No, prefiero usar la cámara de mi PC
            </button>
          </div>
        )}

        {esPasoActivo && (
          <div className="flex items-center gap-2">
            {[ { id: "dniFrente", label: "Frente" }, { id: "dniDorso", label: "Dorso"}, { id: "selfie", label: "Selfie" }].map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0
                  ${paso === p.id ? "bg-blue-600 text-white" : i < stepIndex ? "bg-green-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                  {i < stepIndex ? "✓" : i + 1}
                </div>
                <span className={`text-xs font-medium truncate ${paso === p.id ? "text-slate-900" : "text-slate-400"}`}>
                  {p.label}
                </span>
                {i < 2 && <div className={`flex-1 min-w-[10px] h-px ${stepIndex > i ? "bg-green-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        )}

        {paso !== "qr_desktop" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex-1 flex flex-col">
            
            {paso === "verificando" && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <svg className="w-7 h-7 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-sm text-slate-500">Validando link...</p>
              </div>
            )}

            {paso === "dniFrente" && (
              <div className="space-y-5 flex-1 flex flex-col">
                <DNICapture tipo="frente" onCaptura={capturaDniFrente} />
                <div className="mt-auto pt-4">
                  {imagenDniFrente && (
                    <button 
                      onClick={continuarADorso} 
                      className="w-full bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 text-white font-bold py-4 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                      Continuar →
                    </button>
                  )}
                </div>
              </div>
            )}

            {paso === "dniDorso" && (
              <div className="space-y-5 flex-1 flex flex-col">
                <DNICapture tipo="dorso" onCaptura={capturaDniDorso} />
                <div className="mt-auto pt-4 space-y-2">
                  {imagenDniDorso && (
                    <button 
                      onClick={avanzarASelfie} 
                      className="w-full bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 text-white font-bold py-4 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                      Continuar a Selfie →
                    </button>
                  )}
                  <button 
                    onClick={() => setPaso("dniFrente")} 
                    className="w-full text-slate-500 hover:text-slate-700 text-sm font-medium py-2 transition-colors active:opacity-60"
                  >
                    ← Volver al Frente
                  </button>
                </div>
              </div>
            )}

            {paso === "selfie" && (
              <div className="space-y-5 flex-1 flex flex-col">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Paso 3: Selfie de Autenticación</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Mirá directo a la cámara con buena luz sin anteojos ni gorras.</p>
                </div>
                <SelfieCapture onCaptura={capturaSelfie} />
                <div className="mt-auto pt-4 space-y-2">
                  {imagenSelfie && (
                    <button 
                      onClick={verificar} 
                      className="w-full bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 text-white font-bold py-4 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                      Verificar Identidad Definitiva →
                    </button>
                  )}
                  <button 
                    onClick={() => setPaso("dniDorso")} 
                    className="w-full text-slate-500 hover:text-slate-700 text-sm font-medium py-2 transition-colors"
                  >
                    ← Volver a cargar el Dorso
                  </button>
                </div>
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
                  <p className="text-base font-bold text-slate-900">{progresoMsg}</p>
                  <div className="flex justify-center mt-3 gap-1">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <p className="text-sm text-slate-400 mt-4 leading-relaxed">
                    Estamos comprobando tu Liveness con IA y procesando tus documentos...
                  </p>
                </div>
              </div>
            )}

            {paso === "resultado" && resultado && (
              <ResultadoValidacion estado={resultado.estado} similitud={resultado.similitud} onReintentar={reintentar} />
            )}

            {paso === "error" && (
              <div className="flex flex-col items-center text-center gap-5 py-8">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center shadow-inner">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-red-800">No pudimos verificar</h2>
                  <p className="text-sm text-slate-600 mt-2 bg-red-50 p-3 rounded-lg border border-red-100">{mensajeError}</p>
                </div>
                <button onClick={reintentar} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-all shadow-md active:scale-95">
                  Intentar de nuevo
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-slate-400 opacity-60">
          Tecnología de Verificación Biométrica Avanzada.
        </p>
      </div>
    </main>
  );
}
