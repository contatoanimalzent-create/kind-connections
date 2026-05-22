import { Palette } from "lucide-react";

export function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-slate-400">{label}</span>
      <div className="flex h-9 items-center rounded-md border border-slate-800 bg-slate-900 px-2 text-slate-300">
        {value}
      </div>
    </label>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onBlur: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-slate-400">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={onBlur}
      />
    </label>
  );
}

export function ColorInput({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-slate-400">
        <Palette className="h-3 w-3" /> {label}
      </span>
      <input
        className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 p-1"
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
