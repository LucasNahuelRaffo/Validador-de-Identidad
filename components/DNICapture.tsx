"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Tesseract from "tesseract.js";
import imageCompression from "browser-image-compression";
import { motion } from "framer-motion";

type Props = {
  tipo: "frente" | "dorso";
  onCaptura: (imagen: string, datosDni?: Record<string, string>) => void;
};

export default function DNICapture({ tipo, onCaptura }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [modo, setModo] = useState<"idle" | "camara" | "preview">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detenerCamara = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => detenerCamara();
  }, [detenerCamara]);

  const abrirCamara = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setModo("camara");
    } catch (err) {
      console.error(err);
      setError("No se pudo acceder a la cámara trasera. Verificá los permisos del navegador.");
    }
  };

  const procesarImagenBase64 = async (dataUrl: string) => {
    setError(null);
    setProcesando(true);

    try {
      // 1. Convert base64 back to file for compression
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "dni.jpg", { type: "image/jpeg" });

      // 2. Compresión
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        initialQuality: 0.9
      });

      const compressedDataUrl = await imageCompression.getDataUrlFromFile(compressedFile);
      
      // 3. OCR (Solo necesario en el frente para sacar el número)
      const datosDni: Record<string, string> = {};
      
      if (tipo === "frente") {
        const { data } = await Tesseract.recognize(compressedDataUrl, "spa", { logger: () => {} });
        const texto = data.text;
        
        const matchDni = texto.match(/\b(\d{7,8})\b/);
        if (matchDni) datosDni.numero = matchDni[1];
        
        const lines = texto.split("\n").map((l) => l.trim()).filter((l) => l.length > 3);
        if (lines[0]) datosDni.nombre_raw = lines[0];
      }

      onCaptura(compressedDataUrl, tipo === "frente" ? datosDni : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando la imagen.");
    } finally {
      setProcesando(false);
    }
  };

  const capturarFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d")!;
    
    // Draw the current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    detenerCamara();
    setPreview(dataUrl);
    setModo("preview");
    procesarImagenBase64(dataUrl);
  };

  const reintentar = () => {
    setPreview(null);
    setError(null);
    setProcesando(false);
    setModo("idle");
    setTimeout(abrirCamara, 100); // Reabrirmos automaticamente
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-blue-900">
            {tipo === "frente" ? "Frente del DNI" : "Dorso del DNI"}
          </h3>
          <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
            {tipo === "frente" 
              ? "Enfocá el frente de tu DNI de modo que los bordes encajen en el recuadro."
              : "Enfocá el dorso de tu DNI. Asegurate de que se vea bien el código de barras."}
          </p>
        </div>
      </div>

      {modo === "idle" && (
        <button
          type="button"
          onClick={abrirCamara}
          className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-10 flex flex-col items-center gap-3 transition-colors"
        >
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-700">Abrir cámara</span>
        </button>
      )}

      <div className={modo === "camara" ? "space-y-4" : "hidden"}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
          
          {/* Overlay oscuro con agujero rectangular */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <div className="absolute inset-0 bg-black/40"></div>
             {/* El "agujero" en sí mismo lo logramos usando un div transparente con outline gigante o box-shadow */}
             <div className="relative w-[85%] aspect-[5.5/8.5] sm:aspect-[8.5/5.5] border-2 border-green-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] bg-transparent overflow-hidden">
                {/* Esquinas (corners) decorativas */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
             </div>
          </div>

          {/* Guía en texto encima del video */}
          <div className="absolute top-6 left-0 right-0 flex justify-center pointer-events-none px-4">
             <motion.div
                 initial={{ opacity: 0, y: -10 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="px-4 py-2 rounded-full bg-black/60 text-white text-sm whitespace-nowrap backdrop-blur-sm"
             >
                 Centrá el DNI en el recuadro
             </motion.div>
          </div>
        </div>
        
        <button
          onClick={capturarFrame}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5 text-white/80" fill="currentColor" viewBox="0 0 24 24">
             <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4-9H8v-2h8v2z" />
          </svg>
          Tomar Foto
        </button>
      </div>

      {modo === "preview" && preview && (
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden aspect-[3/4] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="DNI Capturado" className="w-full h-full object-cover" />
            
            {procesando && (
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                 <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
                 <p className="text-white text-sm font-medium animate-pulse">Analizando imagen y optimizando...</p>
                 <p className="text-white/70 text-xs px-8 text-center mt-2 max-w-sm">Si la foto sale borrosa, vas a tener que reintentarlo enseguida.</p>
              </div>
            )}
          </div>
          
          {!procesando && (
            <button
              onClick={reintentar}
              className="w-full border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 py-3.5 rounded-xl transition-colors shadow-sm"
            >
              Volver a tomar foto
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
