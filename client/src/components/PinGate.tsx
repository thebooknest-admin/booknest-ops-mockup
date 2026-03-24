// BookNest Ops — PIN Gate Lock Screen
import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, Lock, Eye, EyeOff } from "lucide-react";

const SESSION_KEY = "booknest_ops_unlocked";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const CORRECT_PIN = import.meta.env.VITE_APP_PIN as string;

function isSessionValid(): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts < SESSION_DURATION_MS;
  } catch {
    return false;
  }
}

function setSession() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now() }));
}

interface PinGateProps {
  children: React.ReactNode;
}

export default function PinGate({ children }: PinGateProps) {
  const [unlocked, setUnlocked] = useState(() => isSessionValid());
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        setTimeLeft(0);
      } else {
        setTimeLeft(remaining);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  // Auto-focus input
  useEffect(() => {
    if (!unlocked) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [unlocked]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }, []);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();

    if (lockedUntil && Date.now() < lockedUntil) return;

    if (pin === CORRECT_PIN) {
      setSession();
      setUnlocked(true);
      setError("");
      setAttempts(0);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin("");
      triggerShake();

      if (newAttempts >= 5) {
        const lockout = Date.now() + 30_000; // 30 second lockout
        setLockedUntil(lockout);
        setError("Too many attempts. Locked for 30 seconds.");
      } else {
        setError(`Incorrect PIN. ${5 - newAttempts} attempt${5 - newAttempts === 1 ? "" : "s"} remaining.`);
      }
    }
  }, [pin, attempts, lockedUntil, triggerShake]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (pin.length === 6) {
      handleSubmit();
    }
  }, [pin, handleSubmit]);

  if (unlocked) return <>{children}</>;

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "oklch(0.97 0.01 75)" }}
    >
      {/* Background texture dots */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, oklch(0.88 0.03 75) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.5,
        }}
      />

      <div
        className={`relative w-full max-w-sm transition-transform ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
        style={{
          animation: shake ? "shake 0.5s ease-in-out" : undefined,
        }}
      >
        {/* Card */}
        <div
          className="bg-white rounded-2xl shadow-xl border overflow-hidden"
          style={{ borderColor: "oklch(0.88 0.03 75)" }}
        >
          {/* Top accent bar */}
          <div className="h-1 w-full" style={{ backgroundColor: "oklch(0.42 0.11 155)" }} />

          <div className="p-8 text-center">
            {/* Logo */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm"
              style={{ backgroundColor: "oklch(0.95 0.04 155)" }}
            >
              <BookOpen className="w-8 h-8" style={{ color: "oklch(0.42 0.11 155)" }} />
            </div>

            <h1
              className="text-xl font-bold tracking-tight mb-0.5"
              style={{ color: "oklch(0.22 0.04 75)", fontFamily: "'Inter', sans-serif" }}
            >
              BookNest Ops
            </h1>
            <p className="text-sm mb-6" style={{ color: "oklch(0.55 0.04 75)" }}>
              Enter your PIN to continue
            </p>

            {/* Lock icon */}
            <div className="flex justify-center mb-5">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: isLocked ? "oklch(0.95 0.06 25)" : "oklch(0.95 0.04 75)" }}
              >
                <Lock
                  className="w-5 h-5"
                  style={{ color: isLocked ? "oklch(0.50 0.20 25)" : "oklch(0.55 0.08 75)" }}
                />
              </div>
            </div>

            {/* PIN dots display */}
            <div className="flex justify-center gap-2.5 mb-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full transition-all duration-150"
                  style={{
                    backgroundColor:
                      i < pin.length
                        ? "oklch(0.42 0.11 155)"
                        : "oklch(0.88 0.03 75)",
                    transform: i < pin.length ? "scale(1.2)" : "scale(1)",
                  }}
                />
              ))}
            </div>

            {/* PIN input form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    if (isLocked) return;
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setPin(val);
                    if (error) setError("");
                  }}
                  disabled={!!isLocked}
                  placeholder="······"
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 px-4 rounded-xl border transition-all focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    borderColor: error ? "oklch(0.60 0.20 25)" : "oklch(0.85 0.04 75)",
                    backgroundColor: "oklch(0.98 0.01 75)",
                    color: "oklch(0.22 0.04 75)",
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                  style={{ color: "oklch(0.60 0.04 75)" }}
                  tabIndex={-1}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Error / lockout message */}
              {(error || isLocked) && (
                <p
                  className="text-xs font-medium text-center"
                  style={{ color: "oklch(0.50 0.20 25)" }}
                >
                  {isLocked ? `Locked — try again in ${timeLeft}s` : error}
                </p>
              )}

              <button
                type="submit"
                disabled={pin.length === 0 || !!isLocked}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                Unlock Dashboard
              </button>
            </form>
          </div>

          {/* Footer */}
          <div
            className="px-8 py-3 text-center border-t"
            style={{ borderColor: "oklch(0.92 0.03 75)", backgroundColor: "oklch(0.98 0.01 75)" }}
          >
            <p className="text-xs" style={{ color: "oklch(0.65 0.04 75)" }}>
              Session stays unlocked for 8 hours
            </p>
          </div>
        </div>
      </div>

      {/* Shake keyframes */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
