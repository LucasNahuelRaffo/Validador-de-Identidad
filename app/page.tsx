"use client";

import { useEffect, useState } from "react";
import type { Validacion } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-yellow-100 text-yellow-800",
  aprobado: "bg-green-100 text-green-800",
  rechazado: "bg-red-100 text-red-800",
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

export default function PanelVendedor() {
  const [validaciones, setValidaciones] = useState<Validacion[]>([]);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [nuevoLink, setNuevoLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(true);
  
  // Estados para el Modal de Fotos
  const [modalAbierto, setModalAbierto] = useState(false);
  const [fotosElegidas, setFotosElegidas] = useState<{ dniUrl: string | null; selfieUrl: string | null } | null>(null);
  const [cargandoFotos, setCargandoFotos] = useState(false);
  const [errorFotos, setErrorFotos] = useState<string | null>(null);

  const cargarValidaciones = async () => {
    try {
      const res = await fetch("/api/validaciones");
      if (!res.ok) { setCargandoLista(false); return; }
      const data = await res.json();
      setValidaciones(data);
    } catch {
      // Supabase no configurado todavía
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarValidaciones();
    const intervalo = setInterval(cargarValidaciones, 10000);
    return () => clearInterval(intervalo);
  }, []);

  const crearValidacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setNuevoLink(null);

    try {
      const res = await fetch("/api/validaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_cliente: nombre }),
      });
      if (!res.ok) { alert("Error al generar el link. Verificá la conexión con Supabase."); return; }
      const data = await res.json();
      const link = `${window.location.origin}/v/${data.token}`;
      setNuevoLink(link);
      setNombre("");
      cargarValidaciones();
    } finally {
      setCargando(false);
    }
  };

  const copiar = () => {
    if (!nuevoLink) return;
    navigator.clipboard.writeText(nuevoLink);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const verFotos = async (token: string) => {
    setModalAbierto(true);
    setCargandoFotos(true);
    setErrorFotos(null);
    setFotosElegidas(null);

    try {
      const res = await fetch(`/api/validaciones/${token}/fotos`);
      const data = await res.json();
      
      if (!res.ok) {
        setErrorFotos(data.error);
      } else {
        setFotosElegidas(data);
      }
    } catch (e) {
      setErrorFotos("No se pudieron cargar las fotos.");
    } finally {
      setCargandoFotos(false);
    }
  };

  const formatFecha = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

  return (
    <main className="min-h-screen bg-slate-50 relative">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Validador de Identidad</h1>
            <p className="text-xs text-slate-500">Panel de vendedores</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Crear validación */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Generar link de validación</h2>
          <form onSubmit={crearValidacion} className="flex gap-3">
            <input
              type="text"
              placeholder="Nombre del cliente (opcional)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
            <button
              type="submit"
              disabled={cargando}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {cargando ? "Generando..." : "Generar link"}
            </button>
          </form>

          {nuevoLink && (
            <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <p className="text-xs text-blue-600 font-medium">Link generado — envialo al cliente por WhatsApp:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 truncate">
                  {nuevoLink}
                </code>
                <button
                  onClick={copiar}
                  className="text-sm font-medium bg-slate-700 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  {copiado ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Hola! Para validar tu identidad entrá a este link: ${nuevoLink}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm font-medium bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Enviar por WhatsApp
            </a>
          </div>
          )}
        </div>

        {/* Lista de validaciones */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Validaciones recientes</h2>
            <button onClick={cargarValidaciones} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Actualizar
            </button>
          </div>

          {cargandoLista ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">Cargando...</div>
          ) : validaciones.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">No hay validaciones todavía.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3">Cliente</th>
                  <th className="text-left px-6 py-3">DNI</th>
                  <th className="text-left px-6 py-3">Estado</th>
                  <th className="text-left px-6 py-3">Similitud</th>
                  <th className="text-left px-6 py-3">Fecha</th>
                  <th className="text-left px-6 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {validaciones.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {v.nombre_cliente || <span className="text-slate-400 font-normal">Sin nombre</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{v.dni || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[v.estado]}`}>
                        {ESTADO_LABEL[v.estado]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {v.similitud_facial != null ? `${(v.similitud_facial * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{formatFecha(v.creado_en)}</td>
                    <td className="px-6 py-4 flex gap-3">
                      <a
                        href={`/v/${v.token}`}
                        target="_blank"
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Link
                      </a>
                      {v.estado !== "pendiente" && (
                        <button
                           onClick={() => verFotos(v.token)}
                           className="text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
                        >
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                           </svg>
                           Fotos
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de visualización de fotos */}
      <AnimatePresence>
        {modalAbierto && (
           <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setModalAbierto(false)}
           >
              <motion.div
                 initial={{ scale: 0.95, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 exit={{ scale: 0.95, opacity: 0 }}
                 onClick={(e) => e.stopPropagation()}
                 className="bg-white rounded-3xl shadow-xl max-w-4xl w-full p-6 space-y-6"
              >
                 <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <h3 className="text-xl font-bold text-slate-900">Evidencia Fotográfica</h3>
                    <button onClick={() => setModalAbierto(false)} className="text-slate-400 hover:text-slate-600">
                       <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                       </svg>
                    </button>
                 </div>

                 {cargandoFotos ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-3">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                       <p className="text-slate-500 text-sm">Descargando archivos seguros...</p>
                    </div>
                 ) : errorFotos ? (
                    <div className="h-64 flex flex-col items-center justify-center text-red-500">
                       <svg className="w-12 h-12 mb-2 text-red-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                       </svg>
                       <p className="font-medium text-red-600">{errorFotos}</p>
                    </div>
                 ) : fotosElegidas && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-3">
                          <h4 className="font-semibold text-slate-700 flex items-center justify-center gap-2">
                             <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">1</span>
                             Foto del DNI
                          </h4>
                          <div className="bg-slate-100 rounded-2xl aspect-[4/3] flex items-center justify-center overflow-hidden border border-slate-200">
                             {fotosElegidas.dniUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={fotosElegidas.dniUrl} alt="Foto DNI Extraída" className="w-full h-full object-contain" />
                             ) : (
                                <span className="text-slate-400 text-sm">No disponible</span>
                             )}
                          </div>
                       </div>
                       
                       <div className="space-y-3">
                          <h4 className="font-semibold text-slate-700 flex items-center justify-center gap-2">
                             <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">2</span>
                             Selfie (Detección en vida)
                          </h4>
                          <div className="bg-slate-100 rounded-2xl aspect-[4/3] flex items-center justify-center overflow-hidden border border-slate-200">
                             {fotosElegidas.selfieUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={fotosElegidas.selfieUrl} alt="Selfie de Verificación" className="w-full h-full object-contain" />
                             ) : (
                                <span className="text-slate-400 text-sm">No disponible</span>
                             )}
                          </div>
                       </div>
                    </div>
                 )}
              </motion.div>
           </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
