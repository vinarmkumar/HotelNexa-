import { Minus, Plus } from "lucide-react";

export default function GuestCounter({
  label,
  description,
  value,
  minimum,
  maximum,
  onChange,
  disabled = false,
  className = "property-guest-counter",
}) {
  return (
    <div className={className}>
      <span><strong>{label}</strong><small>{description}</small></span>
      <div>
        <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || value <= minimum} onClick={() => onChange(value - 1)}><Minus size={14} /></button>
        <b aria-live="polite">{value}</b>
        <button type="button" aria-label={`Increase ${label}`} disabled={disabled || value >= maximum} onClick={() => onChange(value + 1)}><Plus size={14} /></button>
      </div>
    </div>
  );
}
