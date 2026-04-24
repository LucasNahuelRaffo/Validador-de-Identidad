"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Tesseract from "tesseract.js";
import imageCompression from "browser-image-compression";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  tipo: "frente" | "dorso";
  onCaptura: (imagen: string, datosDni?: Record<string, string>) => void;
};

function calcularMovimiento(d1: Uint8ClampedArray, d2: Uint8ClampedArray): number {
  let distintos = 0;
  const total = d1.length / 4;
  for (let i = 0; i < d1.length; i += 16) { 
    const dr = Math.abs(d1[i] - d2[i]);
    const dg = Math.abs(d1[i + 1] - d2[i + 1]);
    const db = Math.abs(d1[i + 2] - d2[i + 2]);
    // Aumentamos la tolerancia del color (de 45 a 60) para ignorar vibraciones leves
    if (dr + dg + db > 60) distintos++;
  }
  return distintos / (total / 4);
}

export default function DNICapture({ tipo, onCaptura }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);

  const [modo, setModo] = useState<"idle" | "camara" | "preview">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [soportaFlash, setSoportaFlash] = useState(false);
  const [flashActivado, setFlashActivado] = useState(false);

  const tiempoEstableRef = useRef<number>(0);
  const prevFrameRef = useRef<ImageData | null>(null);
  const isCapturingRef = useRef(false);

  const detenerCamara = useCallback(() => {
    if (streamRef.current) {
      if (flashActivado) {
        try {
          const track = streamRef.current.getVideoTracks()[0];
          track.applyConstraints({ advanced: [{ torch: false }] } as any);
        } catch(e) {}
      }
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    prevFrameRef.current = null;
    isCapturingRef.current = false;
  }, [flashActivado]);

  useEffect(() => {
    return () => detenerCamara();
  }, [detenerCamara]);

  const procesarImagenBase64 = async (dataUrl: string) => {
    setError(null);
    setProcesando(true);

    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "dni.jpg", { type: "image/jpeg" });

      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        initialQuality: 0.9
      });

      const compressedDataUrl = await imageCompression.getDataUrlFromFile(compressedFile);
      
      const datosDni: Record<string, string> = {};

      if (tipo === "frente") {
        // Del frente solo extraemos el número de documento (es grande y claro)
        const { data } = await Tesseract.recognize(compressedDataUrl, "spa", { logger: () => {} });
        const texto = data.text;
        
        // Buscar número con puntos: "47.635.708"
        const matchConPuntos = texto.match(/(\d{1,2}[.\s]\d{3}[.\s]\d{3})/);
        if (matchConPuntos) {
          datosDni.numero = matchConPuntos[1].replace(/[.\s]/g, "");
        } else {
          // Fallback: secuencia de 7-8 dígitos
          const allDigitMatches = texto.match(/\d+/g);
          if (allDigitMatches) {
            const candidato = allDigitMatches.find(d => d.length >= 7 && d.length <= 8);
            if (candidato) datosDni.numero = candidato;
          }
        }
      }
      
      if (tipo === "dorso") {
        // Del dorso extraemos el NOMBRE desde la zona MRZ (Machine Readable Zone)
        // La MRZ del DNI argentino tiene 3 líneas, la última tiene: RAFFO<<LUCAS<NAHUEL<<<<<<
        // "<<" separa apellido de nombre, "<" separa nombres múltiples
        const { data } = await Tesseract.recognize(compressedDataUrl, "eng", { logger: () => {} });
        const texto = data.text;
        
        // Buscar línea MRZ con formato APELLIDO<<NOMBRES
        const mrzNameMatch = texto.match(/([A-Z]{2,})<<([A-Z<]+)/);
        if (mrzNameMatch) {
          const apellido = mrzNameMatch[1];
          const nombres = mrzNameMatch[2].replace(/<+/g, " ").trim();
          datosDni.nombre_raw = `${apellido} ${nombres}`;
        }
        
        // Buscar número de documento en MRZ: IDARG47635708
        const mrzIdMatch = texto.match(/IDARG(\d{7,8})/);
        if (mrzIdMatch) {
          datosDni.numero_mrz = mrzIdMatch[1];
        }
      }

      // Siempre pasar datos si hay alguno
      const tieneData = Object.keys(datosDni).length > 0;
      onCaptura(compressedDataUrl, tieneData ? datosDni : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando la imagen.");
    } finally {
      setProcesando(false);
    }
  };

  const capturarFrame = useCallback(() => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    setCountdown(null);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const guide = document.getElementById("dni-guide");

    if (!video || !canvas || !guide) return;

    // Mathematical Cropping based on DOM 'object-cover'
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = video.clientWidth;
    const ch = video.clientHeight;

    const scale = Math.max(cw / vw, ch / vh);

    const maskW_dom = guide.clientWidth;
    const maskH_dom = guide.clientHeight;
    
    // Relative to the wrapper/video
    const maskX_dom = (cw - maskW_dom) / 2;
    const maskY_dom = (ch - maskH_dom) / 2;

    const sx = ((scale * vw - cw) / 2 + maskX_dom) / scale;
    const sy = ((scale * vh - ch) / 2 + maskY_dom) / scale;
    const sw = maskW_dom / scale;
    const sh = maskH_dom / scale;

    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    detenerCamara();
    setFlashActivado(false);
    setPreview(dataUrl);
    setModo("preview");
    procesarImagenBase64(dataUrl);
  }, [detenerCamara]);

  useEffect(() => {
    let active = true;

    const checkEstatus = () => {
      if (!active || modo !== "camara" || isCapturingRef.current || !videoRef.current || !motionCanvasRef.current) return;

      const video = videoRef.current;
      if (video.readyState >= 2) {
        // Low-res capture for motion detection
        const mCanvas = motionCanvasRef.current;
        const mCtx = mCanvas.getContext("2d")!;
        mCtx.drawImage(video, 0, 0, 100, 100);
        const currentFrame = mCtx.getImageData(0, 0, 100, 100);

        if (prevFrameRef.current) {
          const mov = calcularMovimiento(prevFrameRef.current.data, currentFrame.data);
          
          if (mov < 0.15) { // Estable (Margen de tolerancia aumentado para temblores)
            if (tiempoEstableRef.current === 0) {
              tiempoEstableRef.current = performance.now();
              setCountdown(3);
            } else {
              const pasado = performance.now() - tiempoEstableRef.current;
              if (pasado > 3000) {
                capturarFrame();
                return;
              } else if (pasado > 2000) {
                setCountdown(1);
              } else if (pasado > 1000) {
                setCountdown(2);
              }
            }
          } else { // Movimiento
            tiempoEstableRef.current = 0;
            setCountdown(null);
          }
        }
        prevFrameRef.current = currentFrame;
      }
      
      if (active) requestRef.current = requestAnimationFrame(checkEstatus);
    };

    if (modo === "camara") {
      requestRef.current = requestAnimationFrame(checkEstatus);
    }

    return () => {
      active = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [modo, capturarFrame]);

  const abrirCamara = async (conFlash: boolean = flashActivado) => {
    setError(null);
    try {
      const constraints: any = {
        video: { 
          facingMode: { ideal: "environment" }, 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        }
      };

      // Intentamos pedir el flash desde el inicio si es posible (Chrome/Android)
      if (conFlash) {
        constraints.video.advanced = [{ torch: true }];
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : {};
      
      if (capabilities.torch) {
        setSoportaFlash(true);
        // Si pedimos flash pero no prendió automáticamente, intentamos applyConstraints una vez
        if (conFlash && !flashActivado) {
          try {
            await track.applyConstraints({ advanced: [{ torch: true }] } as any);
            setFlashActivado(true);
          } catch (e) {
            console.warn("No se pudo forzar flash tras reinicio:", e);
          }
        }
      }

      prevFrameRef.current = null;
      tiempoEstableRef.current = 0;
      setCountdown(null);
      isCapturingRef.current = false;
      setModo("camara");
    } catch (err) {
      console.error(err);
      setError("No se pudo acceder a la cámara trasera. Verificá los permisos del navegador.");
    }
  };

  const toggleFlash = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const nuevoEstado = !flashActivado;
    
    try {
        // Intentamos el camino normal (sin reiniciar)
        await track.applyConstraints({
            advanced: [{ torch: nuevoEstado }]
        } as any);
        setFlashActivado(nuevoEstado);

        // Si la cámara se pausó o se ve negra (readyState < 2), forzamos reinicio rápido
        setTimeout(() => {
          if (videoRef.current && videoRef.current.readyState < 2) {
             abrirCamara(nuevoEstado);
          }
        }, 300);

    } catch (e) {
        console.warn("applyConstraints falló, intentando reinicio de stream con flash:", e);
        // Si falla el comando directo, reiniciamos la cámara pidiendo el flash desde cero
        setFlashActivado(nuevoEstado);
        abrirCamara(nuevoEstado);
    }
  };

  const reintentar = () => {
    setPreview(null);
    setError(null);
    setProcesando(false);
    setModo("idle");
    setTimeout(() => abrirCamara(), 100);
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
              ? "Sostené tu DNI de forma horizontal y enfocalo para que encaje dentro del recuadro."
              : "Sostené el dorso de tu DNI de forma horizontal. Asegurá que el código de barras se vea bien claro."}
          </p>
        </div>
      </div>

      {modo === "idle" && (
        <button
          type="button"
          onClick={() => abrirCamara()}
          className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-10 flex flex-col items-center gap-3 transition-colors"
        >
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-700">Abrir cámara inteligente</span>
        </button>
      )}

      <div className={modo === "camara" ? "space-y-4" : "hidden"}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
          
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
             <div className="absolute inset-0 bg-black/40 transition-opacity"></div>
             
             {/* Marco dinámico transparente HORIZONTAL */}
             <div 
               id="dni-guide"
               className={`relative w-[85%] aspect-[8.5/5.5] border-2 rounded-xl bg-transparent overflow-hidden transition-all duration-300 ${countdown !== null ? "border-green-400 shadow-[0_0_0_9999px_rgba(34,197,94,0.15)]" : "border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"}`}
             >
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white opacity-80 rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white opacity-80 rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white opacity-80 rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white opacity-80 rounded-br-lg"></div>
             </div>
          </div>

          {soportaFlash && (
            <button 
               onClick={toggleFlash}
               className={`absolute top-4 right-4 z-10 w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg border ${flashActivado ? 'bg-yellow-400 text-yellow-900 border-yellow-300' : 'bg-black/50 text-white border-white/20 hover:bg-black/70'}`}
            >
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
               </svg>
            </button>
          )}

          <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none px-4">
             <AnimatePresence mode="wait">
                 <motion.div
                     key={countdown !== null ? 'counting' : 'searching'}
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -10 }}
                     className={`px-6 py-3 rounded-full font-semibold shadow-xl text-white text-sm whitespace-nowrap backdrop-blur-md ${countdown !== null ? 'bg-green-600/90' : 'bg-black/70'}`}
                 >
                     {countdown !== null 
                        ? `¡No lo muevas! Auto-captura en ${countdown}...` 
                        : "Sostené el DNI dentro del recuadro"}
                 </motion.div>
             </AnimatePresence>
          </div>
        </div>
        
        {/* Fallback button if auto-capture is taking too long for the user */}
        <button
          onClick={capturarFrame}
          className="w-full bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-semibold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5 text-white/80" fill="currentColor" viewBox="0 0 24 24">
             <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4-9H8v-2h8v2z" />
          </svg>
          Forzar captura manual
        </button>
      </div>

      {modo === "preview" && preview && (
        <div className="space-y-4">
          {/* Mostramos el recorte con el aspecto real de la tarjeta */}
          <div className="relative rounded-xl overflow-hidden aspect-[8.5/5.5] border border-slate-200 bg-black max-w-sm mx-auto shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="DNI Cortado" className="w-full h-full object-cover" />
            
            {procesando && (
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                 <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
                 <p className="text-white text-sm font-medium animate-pulse">Analizando imagen...</p>
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
      <canvas ref={motionCanvasRef} width={100} height={100} className="hidden" />
    </div>
  );
}
