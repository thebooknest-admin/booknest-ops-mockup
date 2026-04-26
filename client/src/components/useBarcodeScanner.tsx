/**
 * useBarcodeScanner — live barcode scanning via @zxing/browser
 *
 * Usage:
 *   const { open, ScannerModal } = useBarcodeScanner({ onScan: (isbn) => ... });
 *   <button onClick={open}>Scan</button>
 *   <ScannerModal />
 *
 * Install: npm install @zxing/browser @zxing/library
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { X, Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UseBarcodeScanner {
  onScan: (value: string) => void;
}

export function useBarcodeScanner({ onScan }: UseBarcodeScanner) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleScan = useCallback((value: string) => {
    onScan(value);
    close();
  }, [onScan, close]);

  const ScannerModal = useCallback(() => {
    if (!isOpen) return null;
    return <BarcodeScannerModal onScan={handleScan} onClose={close} />;
  }, [isOpen, handleScan, close]);

  return { open, close, isOpen, ScannerModal };
}

// ─── Scanner Modal ────────────────────────────────────────────────────────────

interface BarcodeScannerModalProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

function BarcodeScannerModal({ onScan, onClose }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const hasScanned = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const startScanner = async () => {
      try {
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        // Get available cameras, prefer back camera on iPad
        const devices = await navigator.mediaDevices.enumerateDevices().then(ds => ds.filter(d => d.kind === "videoinput"));
        const backCamera = devices.find((d: MediaDeviceInfo) =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rear") ||
          d.label.toLowerCase().includes("environment")
        ) ?? devices[devices.length - 1]; // last device is usually back camera

        if (!backCamera) {
          setErrorMsg("No camera found on this device.");
          setStatus("error");
          return;
        }

        if (cancelled) return;
        setStatus("scanning");

        await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current!,
          (result, err) => {
            if (cancelled || hasScanned.current) return;
            if (result) {
              const text = result.getText();
              // Filter to ISBN-like values (10 or 13 digit numbers)
              const clean = text.replace(/[^0-9X]/gi, "");
              if (clean.length === 10 || clean.length === 13) {
                hasScanned.current = true;
                setLastResult(clean);
                // Brief flash then close
                setTimeout(() => {
                  if (!cancelled) onScan(clean);
                }, 400);
              }
            }
            // Suppress NotFoundException — it fires continuously when no barcode is visible
            if (err && !(err instanceof NotFoundException)) {
              console.warn("Scanner error:", err);
            }
          }
        );
      } catch (err: any) {
        if (cancelled) return;
        if (err?.name === "NotAllowedError") {
          setErrorMsg("Camera permission denied. Please allow camera access and try again.");
        } else if (err?.name === "NotFoundError") {
          setErrorMsg("No camera found on this device.");
        } else {
          setErrorMsg("Could not start camera. Try refreshing the page.");
        }
        setStatus("error");
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (readerRef.current) {
        try {
          // Stop the video stream directly
          const video = videoRef.current;
          if (video && video.srcObject) {
            (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            video.srcObject = null;
          }
        } catch {}
      }
    };
  }, [onScan]);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl bg-black">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 absolute top-0 left-0 right-0 z-10">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-white/80" />
            <span className="text-sm font-medium text-white">
              {status === "loading" ? "Starting camera…" : status === "error" ? "Camera error" : "Scan barcode"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Video feed */}
        <div className="relative aspect-3/4 bg-black">
          <video
            ref={videoRef}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              status === "scanning" ? "opacity-100" : "opacity-0"
            )}
            playsInline
            muted
          />

          {/* Loading spinner */}
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <Camera className="w-10 h-10 text-white/40" />
              <p className="text-sm text-white/70">{errorMsg}</p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {/* Scanning overlay — viewfinder */}
          {status === "scanning" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Dimmed areas outside the scan zone */}
              <div className="absolute inset-0 bg-black/40" />
              {/* Scan window */}
              <div className="relative w-64 h-36 z-10">
                {/* Corner brackets */}
                {["tl", "tr", "bl", "br"].map(corner => (
                  <div
                    key={corner}
                    className={cn(
                      "absolute w-6 h-6 border-white",
                      corner === "tl" && "top-0 left-0 border-t-2 border-l-2 rounded-tl",
                      corner === "tr" && "top-0 right-0 border-t-2 border-r-2 rounded-tr",
                      corner === "bl" && "bottom-0 left-0 border-b-2 border-l-2 rounded-bl",
                      corner === "br" && "bottom-0 right-0 border-b-2 border-r-2 rounded-br",
                    )}
                  />
                ))}
                {/* Scan line animation */}
                <div
                  className="absolute left-1 right-1 h-0.5 bg-green-400/80 rounded-full"
                  style={{ animation: "scanline 2s ease-in-out infinite" }}
                />
                {/* Clear center */}
                <div className="absolute inset-0 bg-transparent" />
              </div>
            </div>
          )}

          {/* Success flash */}
          {lastResult && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 z-20 pointer-events-none">
              <div className="bg-green-500 text-white text-sm font-mono font-bold px-4 py-2 rounded-xl shadow-lg">
                {lastResult}
              </div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        {status === "scanning" && !lastResult && (
          <div className="px-4 py-3 bg-black text-center">
            <p className="text-xs text-white/50">Point the camera at the barcode on the book's back cover</p>
          </div>
        )}
      </div>

      {/* Scanline keyframe */}
      <style>{`
        @keyframes scanline {
          0%   { top: 8px; opacity: 1; }
          50%  { top: calc(100% - 8px); opacity: 1; }
          100% { top: 8px; opacity: 1; }
        }
      `}</style>
    </div>
  );
}