"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "primary" | "quiet" | "danger";
  }
>(function Button(
  { className = "", tone = "primary", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`button button--${tone} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
});

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : null}
    </label>
  );
}

export function Table({
  caption,
  columns,
  children,
}: {
  caption: string;
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog__head">
          <h2 id="dialog-title">{title}</h2>
          <Button tone="quiet" aria-label="Close dialog" onClick={onClose}>
            ×
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Status({
  children,
  kind = "neutral",
}: {
  children: ReactNode;
  kind?: "neutral" | "success" | "warning" | "error";
}) {
  return (
    <p
      className={`status status--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
