"use client";

import { useRef, useState } from "react";
import Tesseract from "tesseract.js";

type Props = {
  onCaptura: (imagen: string, datosDni: Record<string, string>) => void;
};

export default function DNICapture({ onCaptura }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convierte cualquier imagen (HEIC, PNG, WebP, JPEG...) a un JPEG base64
  // con tamaño máximo 1600px (suficiente para DNI) para cumplir el límite de Face++
  const toJpegDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo leer la imagen. Probá con otro archivo."));
      };
      img.src = url;
    });

  const procesarImagen = async (file: File) => {
    setError(null);
    setProcesando(true);

    try {
      const dataUrl = await toJpegDataUrl(file);
      setPreview(dataUrl);

      const { data } = await Tesseract.recognize(dataUrl, "spa", { logger: () => {} });
      const texto = data.text;

      const datosDni: Record<string, string> = {};
      const matchDni = texto.match(/\b(\d{7,8})\b/);
      if (matchDni) datosDni.numero = matchDni[1];

      const lines = texto.split("\n").map((l) => l.trim()).filter((l) => l.length > 3);
      if (lines[0]) datosDni.nombre_raw = lines[0];

      onCaptura(dataUrl, datosDni);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando la imagen.");
    } finally {
      setProcesando(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    procesarImagen(file);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Sacá una foto al frente de tu DNI con buena iluminación.
      </p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-8 flex flex-col items-center gap-3 transition-colors cursor-pointer"
      >
        {preview ? (
          <img src={preview} alt="DNI" className="max-h-48 rounded-xl object-contain" />
        ) : (
          <>
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <span className="text-sm text-slate-500">Tocar para subir o tomar foto del DNI</span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="hidden"
      />

      {procesando && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Leyendo datos del DNI...
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
