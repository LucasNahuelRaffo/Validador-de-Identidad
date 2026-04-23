type Props = {
  estado: "aprobado" | "rechazado";
  similitud: number;
  onReintentar: () => void;
};

export default function ResultadoValidacion({ estado, similitud, onReintentar }: Props) {
  const aprobado = estado === "aprobado";

  return (
    <div className="flex flex-col items-center text-center gap-6 py-4">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center ${aprobado ? "bg-green-100" : "bg-red-100"}`}>
        {aprobado ? (
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>

      <div>
        <h2 className={`text-2xl font-bold ${aprobado ? "text-green-700" : "text-red-600"}`}>
          {aprobado ? "Identidad verificada" : "No se pudo verificar"}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {aprobado
            ? "Tu identidad fue validada correctamente. Ya podés cerrar esta pantalla."
            : "La similitud facial no fue suficiente para validar tu identidad."}
        </p>
      </div>

      <div className="w-full bg-slate-100 rounded-xl px-5 py-4 text-left space-y-1">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Similitud facial</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${aprobado ? "bg-green-500" : "bg-red-400"}`}
              style={{ width: `${(similitud * 100).toFixed(0)}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-slate-700">{(similitud * 100).toFixed(1)}%</span>
        </div>
        <p className="text-xs text-slate-400">Umbral mínimo: 70%</p>
      </div>

      {!aprobado && (
        <button
          onClick={onReintentar}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors"
        >
          Reintentar validación
        </button>
      )}
    </div>
  );
}
