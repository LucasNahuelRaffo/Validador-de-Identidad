import { useEffect } from "react";
import { motion } from "framer-motion";

type Props = {
  estado: "aprobado" | "rechazado";
  similitud: number;
  onReintentar: () => void;
};

export default function ResultadoValidacion({ estado, similitud, onReintentar }: Props) {
  const aprobado = estado === "aprobado";

  useEffect(() => {
    if (aprobado) {
      // Redirigir automáticamente a WhatsApp después de 4.5 segundos
      const timer = setTimeout(() => {
        window.location.href = "https://wa.me/"; // Reemplazar con el link exacto
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [aprobado]);

  return (
    <div className="flex flex-col items-center text-center gap-6 py-4 overflow-hidden">
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className={`w-20 h-20 rounded-full flex items-center justify-center ${aprobado ? "bg-green-100" : "bg-red-100"}`}
      >
        {aprobado ? (
          <motion.svg 
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-10 h-10 text-green-600" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <motion.path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </motion.svg>
        ) : (
          <motion.svg 
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-10 h-10 text-red-500" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <motion.path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </motion.svg>
        )}
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className={`text-2xl font-bold ${aprobado ? "text-green-700" : "text-red-600"}`}>
          {aprobado ? "Identidad verificada" : "No se pudo verificar"}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {aprobado
            ? "Tu identidad fue validada correctamente. Redirigiendo a WhatsApp..."
            : "La similitud facial no fue suficiente para validar tu identidad o la foto falló los controles de seguridad."}
        </p>
      </motion.div>

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="w-full bg-slate-100 rounded-xl px-5 py-4 text-left space-y-1"
      >
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Similitud facial</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(similitud * 100).toFixed(0)}%` }}
              transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${aprobado ? "bg-green-500" : "bg-red-400"}`}
            />
          </div>
          <motion.span 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="text-sm font-semibold text-slate-700"
          >
            {(similitud * 100).toFixed(1)}%
          </motion.span>
        </div>
        <p className="text-xs text-slate-400">Umbral mínimo: 80%</p>
      </motion.div>

      {aprobado && (
        <motion.a
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          href="https://wa.me/"
          className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
          </svg>
          Continuar al WhatsApp
        </motion.a>
      )}

      {!aprobado && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={onReintentar}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors"
        >
          Reintentar validación
        </motion.button>
      )}
    </div>
  );
}
