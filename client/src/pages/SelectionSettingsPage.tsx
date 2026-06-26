import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Strength = "off" | "low" | "medium" | "high";

type SelectionSettingsForm = {
  discoveryPicksPerShipment: number;
  interestMatchTargetPercentage: number;
  seriesContinuationStrength: Strength;
  maximumSameSeriesPerShipment: number;
  authorDiversityStrength: Strength;
  themeDiversityStrength: Strength;
  inventoryHealthStrength: Strength;
  readingProgressionStrength: Strength;
  allowPreviouslySentInSuggestions: boolean;
  excludePreviouslySentFromBundleCreation: boolean;
  seasonalFiltering: boolean;
  themeVariety: boolean;
};

const STRENGTH_OPTIONS: Strength[] = ["off", "low", "medium", "high"];

function strengthLabel(value: Strength) {
  return value[0].toUpperCase() + value.slice(1);
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-xl border border-border bg-card p-4">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function StrengthField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: Strength;
  onChange: (value: Strength) => void;
}) {
  return (
    <label className="block rounded-xl border border-border bg-card p-4">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Strength)}
        className="mt-3 w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {STRENGTH_OPTIONS.map(option => (
          <option key={option} value={option}>{strengthLabel(option)}</option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left"
    >
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "mt-0.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          checked ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
        )}
      >
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

export default function SelectionSettingsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, refetch, isRefetching } = trpc.selectionSettings.get.useQuery();
  const [form, setForm] = useState<SelectionSettingsForm | null>(null);

  useEffect(() => {
    if (data?.settings) setForm(data.settings as SelectionSettingsForm);
  }, [data?.settings]);

  const update = trpc.selectionSettings.update.useMutation({
    onSuccess: (result) => {
      setForm(result.settings as SelectionSettingsForm);
      utils.selectionSettings.get.invalidate();
      toast.success("Selection settings saved.");
    },
    onError: (error) => toast.error("Could not save settings: " + error.message),
  });

  const reset = trpc.selectionSettings.reset.useMutation({
    onSuccess: (result) => {
      setForm(result.settings as SelectionSettingsForm);
      utils.selectionSettings.get.invalidate();
      toast.success("Selection settings reset to defaults.");
    },
    onError: (error) => toast.error("Could not reset settings: " + error.message),
  });

  const updateField = <K extends keyof SelectionSettingsForm>(key: K, value: SelectionSettingsForm[K]) => {
    setForm(current => current ? { ...current, [key]: value } : current);
  };

  if (isLoading || !form) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading selection settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Selection Settings</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tune Pippa's internal book-selection behavior without editing code. Changes apply to future selections only.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Source: {data?.source === "database" ? "saved database settings" : "code defaults"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            onClick={() => update.mutate(form)}
            disabled={update.isPending}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <NumberField
          label="Discovery picks per shipment"
          description="How many Pippa's Surprise books to aim for when inventory allows. Default: 1."
          min={0}
          max={3}
          value={form.discoveryPicksPerShipment}
          onChange={(value) => updateField("discoveryPicksPerShipment", value)}
        />
        <NumberField
          label="Interest match target percentage"
          description="Target share of books matching member interests. Default: 85, which usually leaves one discovery pick in Cozy Nest."
          min={50}
          max={100}
          value={form.interestMatchTargetPercentage}
          onChange={(value) => updateField("interestMatchTargetPercentage", value)}
        />
        <StrengthField
          label="Series continuation strength"
          description="How strongly Pippa prefers the next book in a series the member has already started."
          value={form.seriesContinuationStrength}
          onChange={(value) => updateField("seriesContinuationStrength", value)}
        />
        <NumberField
          label="Maximum same series per shipment"
          description="Prevents one shipment from clustering multiple books from the same series. Default: 1."
          min={1}
          max={3}
          value={form.maximumSameSeriesPerShipment}
          onChange={(value) => updateField("maximumSameSeriesPerShipment", value)}
        />
        <StrengthField
          label="Author diversity strength"
          description="How much to avoid repeating the same author when alternatives exist."
          value={form.authorDiversityStrength}
          onChange={(value) => updateField("authorDiversityStrength", value)}
        />
        <StrengthField
          label="Theme diversity strength"
          description="How much to avoid repeated themes. Book Nest prefers repeating author over repeating theme when constrained."
          value={form.themeDiversityStrength}
          onChange={(value) => updateField("themeDiversityStrength", value)}
        />
        <StrengthField
          label="Inventory health strength"
          description="How much healthy stock should gently help a book, without overpowering a much better match."
          value={form.inventoryHealthStrength}
          onChange={(value) => updateField("inventoryHealthStrength", value)}
        />
        <StrengthField
          label="Reading progression strength"
          description="How much to favor books slightly above prior reading level without skipping age tiers."
          value={form.readingProgressionStrength}
          onChange={(value) => updateField("readingProgressionStrength", value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ToggleField
          label="Allow previously sent in suggestions"
          description="Suggestion lists may show already-sent titles with warnings. Bundle creation still has its own duplicate guard."
          checked={form.allowPreviouslySentInSuggestions}
          onChange={(value) => updateField("allowPreviouslySentInSuggestions", value)}
        />
        <ToggleField
          label="Exclude previously sent from bundle creation"
          description="Prevents assigning titles already seen in member history or prior shipments."
          checked={form.excludePreviouslySentFromBundleCreation}
          onChange={(value) => updateField("excludePreviouslySentFromBundleCreation", value)}
        />
        <ToggleField
          label="Seasonal filtering"
          description="Blocks holiday/seasonal books outside their picking windows."
          checked={form.seasonalFiltering}
          onChange={(value) => updateField("seasonalFiltering", value)}
        />
        <ToggleField
          label="Theme variety"
          description="Enables author/theme/series diversity passes after base scoring."
          checked={form.themeVariety}
          onChange={(value) => updateField("themeVariety", value)}
        />
      </div>
    </div>
  );
}
