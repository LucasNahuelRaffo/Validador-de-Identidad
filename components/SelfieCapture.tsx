"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";
import { motion, AnimatePresence } from "framer-motion";
import Tesseract from "tesseract.js";

type Props = {
  onCaptura: (imagen: string) => void;
};

type Distancia = "buscando" | "lejos" | "cerca" | "perfecto";

function calcularMovimiento(ctx: CanvasRenderingContext2D, frame1: ImageData, frame2: ImageData): number {
  const d1 = frame1.data;
  const d2 = frame2.data;
  let distintos = 0;
  const total = d1.length / 4;
  for (let i = 0; i < d1.length; i += 4) {
    const dr = Math.abs(d1[i] - d2[i]);
    const dg = Math.abs(d1[i + 1] - d2[i + 1]);
    const db = Math.abs(d1[i + 2] - d2[i + 2]);
    if (dr + dg + db > 30) distintos++;
  }
  return distintos / total;
}

export default function SelfieCapture({ onCaptura }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const detectorRef = useRef<FaceDetector | null>(null);

  const [modo, setModo] = useState<"idle" | "camara" | "preview">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [distancia, setDistancia] = useState<Distancia>("buscando");
  const [countdown, setCountdown] = useState<number | null>(null);

  const distanciaRef = useRef<Distancia>("buscando");
  const tiempoPerfectoRef = useRef<number>(0);
  const primerFrameCapturaRef = useRef<ImageData | null>(null);
  const [cargandoModelo, setCargandoModelo] = useState(false);

  const initDetector = async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
      });
      detectorRef.current = detector;
    } catch (err) {
      console.error("Error al cargar FaceDetector:", err);
    }
  };

  const capturarFrameData = useCallback((): ImageData | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  const [procesandoOcr, setProcesandoOcr] = useState(false);

  const capturarYFinalizar = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const frame2 = capturarFrameData();
    const frame1 = primerFrameCapturaRef.current;

    // 1. Verificación básica de liveness por movimiento (ya existente)
    if (frame1 && frame2) {
      const ctx = canvas.getContext("2d")!;
      const mov = calcularMovimiento(ctx, frame1, frame2);
      if (mov < 0.025) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setModo("idle");
        setError("Parece que mostraste una foto estática. Mirá directo a la cámara y movete levemente.");
        return;
      }
    }

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    // 2. Verificación Anti-Fraude OCR & Proporción (Reforzada)
    setProcesandoOcr(true);
    try {
      // Regla de Tamaño: Si la cara en la selfie es muy pequeña (como en un carnet), sospechamos de fraude
      if (distanciaRef.current !== "perfecto") {
        setError("⚠️ Seguridad: La cara está muy lejos o es muy pequeña. Acercate más para validar tu identidad.");
        reintentar();
        return;
      }

      const { data: { text } } = await Tesseract.recognize(dataUrl, "spa+eng");
      const keywords = ["ARGENTINA", "DOCUMENTO", "NACIONAL", "REPUBLICA", "APELLIDO", "NOMBRE", "N°", "DOCUMENT", "IDENTITY", "47.", "20-"];
      const isDoc = keywords.some(k => text.toUpperCase().includes(k));
      
      if (isDoc) {
        setError("❌ INTENTO DE FRAUDE DETECTADO: Estás mostrando un documento físico. Poné tu CARA frente a la cámara.");
        reintentar();
        return;
      }
    } catch (e) {
      console.warn("OCR skip en selfie:", e);
    } finally {
      setProcesandoOcr(false);
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    setPreview(dataUrl);
    setModo("preview");
    onCaptura(dataUrl);
  }, [capturarFrameData, onCaptura]);

  useEffect(() => {
    let active = true;

    const detectFrame = () => {
      if (!active || !videoRef.current || modo === "preview" || modo === "idle" || !detectorRef.current) return;

      const video = videoRef.current;
      const detector = detectorRef.current;

      if (video.readyState >= 2) {
        const startTime = performance.now();
        const detections = detector.detectForVideo(video, startTime);
        let newStatus: Distancia = "buscando";

        if (detections.detections.length > 0) {
          // Si hay más de 1 cara, es sospechoso (usuario + DNI)
          if (detections.detections.length > 1) {
            newStatus = "buscando";
            setError("Se detectaron múltiples caras. Sacá cualquier documento del encuadre.");
          } else {
            const bestFace = detections.detections[0].boundingBox!;
            const videoWidth = video.videoWidth || 1;
            const normalizedWidth = bestFace.width / videoWidth;

            if (normalizedWidth < 0.40) {
              newStatus = "lejos";
            } else if (normalizedWidth > 0.65) {
              newStatus = "cerca";
            } else {
              newStatus = "perfecto";
            }
          }
        }

        if (newStatus !== distanciaRef.current) {
          distanciaRef.current = newStatus;
          setDistancia(newStatus);
          if (newStatus === "perfecto") {
            tiempoPerfectoRef.current = performance.now();
            primerFrameCapturaRef.current = capturarFrameData();
            setCountdown(3);
          } else {
            tiempoPerfectoRef.current = 0;
            setCountdown(null);
          }
        } else if (newStatus === "perfecto" && tiempoPerfectoRef.current > 0) {
          const transcurrido = performance.now() - tiempoPerfectoRef.current;
          if (transcurrido > 3000) {
            capturarYFinalizar();
            return;
          } else if (transcurrido > 2000) {
            setCountdown(1);
          } else if (transcurrido > 1000) {
            setCountdown(2);
          }
        }
      }
      if (active) requestRef.current = requestAnimationFrame(detectFrame);
    };

    if (modo === "camara") {
      requestRef.current = requestAnimationFrame(detectFrame);
    }

    return () => {
      active = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [capturarFrameData, capturarYFinalizar, modo]);

  const abrirCamara = async () => {
    setError(null);
    setCargandoModelo(true);
    if (!detectorRef.current) await initDetector();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setModo("camara");
      setDistancia("buscando");
      distanciaRef.current = "buscando";
      tiempoPerfectoRef.current = 0;
      setCountdown(null);
    } catch {
      setError("No se pudo acceder a la cámara. Verificá los permisos del navegador.");
    } finally {
      setCargandoModelo(false);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const reintentar = () => {
    setPreview(null);
    setError(null);
    setModo("idle");
    setCountdown(null);
    distanciaRef.current = "buscando";
    setDistancia("buscando");
  };

  const getBorderColor = () => {
    if (distancia === "perfecto") return "border-green-500 bg-green-500/10";
    if (distancia === "lejos") return "border-red-500 bg-red-500/10";
    if (distancia === "cerca") return "border-red-500 bg-red-500/10";
    return "border-white/50 bg-black/10";
  };

  const getTextGuide = () => {
    if (countdown !== null) return `¡Agarrá firme! Tomando foto en ${countdown}...`;
    if (distancia === "lejos") return "Acercate más a la cámara";
    if (distancia === "cerca") return "Alejate un poco";
    return "Centrá tu cara dentro del óvalo";
  };

  return (
    <div className="space-y-4">
      {modo === "idle" && (
        <button
          type="button"
          onClick={abrirCamara}
          disabled={cargandoModelo}
          className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-10 flex flex-col items-center gap-3 transition-colors disabled:opacity-50"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
            {cargandoModelo ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            ) : (
              <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">{cargandoModelo ? "Preparando cámara..." : "Abrir cámara"}</p>
            <p className="text-xs text-slate-400 mt-0.5">Usá la cámara frontal con buena luz</p>
          </div>
        </button>
      )}

      <div className={modo === "camara" ? "space-y-3" : "hidden"}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
          <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted autoPlay />
          
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
             {/* Este div crea el "agujero" transparente rodeado de negro */}
             <motion.div 
                animate={{ scale: [0.98, 1, 0.98] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className={`w-56 h-[320px] border-[5px] rounded-[100%] transition-colors duration-300 ${getBorderColor()} shadow-[0_0_0_9999px_rgba(0,0,0,0.85)] bg-transparent`} 
             />
          </div>

          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none px-4">
             <AnimatePresence mode="wait">
                <motion.div
                   key={getTextGuide()}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className={`px-4 py-2 rounded-full shadow-lg ${
                      distancia === "perfecto" ? "bg-green-600 font-bold" : 
                      (distancia === "lejos" || distancia === "cerca") ? "bg-red-600" : "bg-black/60"
                   } text-white text-sm whitespace-nowrap`}
                >
                   {getTextGuide()}
                </motion.div>
             </AnimatePresence>
          </div>
        </div>
      </div>

      {modo === "preview" && preview && (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden aspect-[3/4] bg-black border-2 border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selfie" className="w-full h-full object-cover scale-x-[-1]" />

            {procesandoOcr && (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-center px-6">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-white font-bold">Analizando seguridad...</p>
                  <p className="text-blue-200 text-[10px] uppercase tracking-widest mt-1">Verificación Anti-Suplantación</p>
                </div>
              </div>
            )}
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
