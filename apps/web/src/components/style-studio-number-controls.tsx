import { useEffect, useState } from "react";

function displayNumber(value: number, step: number) {
  const stepDecimals = String(step).split(".")[1]?.length ?? 0;
  return String(Number(value.toFixed(stepDecimals + 2)));
}

export function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => displayNumber(value, step));

  useEffect(() => setDraft(displayNumber(value, step)), [step, value]);

  const update = (next: string) => {
    setDraft(next);
    if (next === "") return;
    const number = Number(next);
    if (Number.isFinite(number) && number >= min && number <= max) {
      onChange(next);
    }
  };

  return (
    <span className="number-field">
      <input
        type="number"
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => update(event.target.value)}
        onBlur={() => setDraft(displayNumber(value, step))}
      />
      {unit && <span aria-hidden="true">{unit}</span>}
    </span>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <NumberField
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          onChange={onChange}
        />
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
