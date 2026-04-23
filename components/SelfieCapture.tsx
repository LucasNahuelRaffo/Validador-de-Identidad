"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type Props = {
  onCaptura: (imagen: string) => void;
};

export default function SelfieCapture({ onCaptura }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [modo, setModo] = useState<"idle" | "camara" | "preview">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Asignar el stream al video una vez que el elemento esté en el DOM
  useEffect(() => {
    if (modo === "camara" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, [modo]);

  const abrirCamara = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setModo("camara"); // primero renderizamos el video, luego el efecto asigna el stream
    } catch {
      setError("No se pudo acceder a la cámara. Verificá los permisos del navegador.");
    }
  }, []);

  const capturar = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);
    setModo("preview");

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    onCaptura(dataUrl);
  }, [onCaptura]);

  const reintentar = useCallback(() => {
    setPreview(null);
    setModo("idle");
  }, []);

  return (
    <div className="space-y-4">
      {modo === "idle" && (
        <button
          type="button"
          onClick={abrirCamara}
          className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-10 flex flex-col items-center gap-3 transition-colors"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">Abrir cámara</p>
            <p className="text-xs text-slate-400 mt-0.5">Usá la cámara frontal mirando de frente</p>
          </div>
        </button>
      )}

      {/* Video siempre en DOM cuando está en modo camara para que el ref esté disponible */}
      <div className={modo === "camara" ? "space-y-3" : "hidden"}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {/* Guía de posicionamiento */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-60 border-2 border-white/50 rounded-full" />
          </div>
          <p className="absolute bottom-3 left-0 right-0 text-center text-white/70 text-xs">
            Centrá tu cara dentro del óvalo
          </p>
        </div>
        <button
          onClick={capturar}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
        >
          Capturar selfie
        </button>
      </div>

      {modo === "preview" && preview && (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden aspect-video bg-black">
            <img src={preview} alt="Selfie" className="w-full h-full object-cover" />
          </div>
          <button
            onClick={reintentar}
            className="w-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            Volver a tomar
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
