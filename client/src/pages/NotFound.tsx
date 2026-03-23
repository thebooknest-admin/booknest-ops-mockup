import { Link } from "wouter";
import { BookOpen, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
        style={{ backgroundColor: "oklch(0.92 0.04 155)" }}>
        <BookOpen className="w-8 h-8" style={{ color: "oklch(0.42 0.11 155)" }} />
      </div>
      <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
      <p className="text-lg font-semibold text-foreground mb-1">Page not found</p>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs">
        This page doesn't exist yet. Head back to the dashboard to continue your work.
      </p>
      <Link href="/dashboard">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </Link>
    </div>
  );
}
