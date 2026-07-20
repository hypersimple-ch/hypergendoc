"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
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
  const fieldId = useId();
  const generatedControlId = `field-${fieldId}`;
  const hintId = `field-${fieldId}-hint`;
  const errorId = `field-${fieldId}-error`;
  const child = isValidElement(children)
    ? (children as ReactElement<{
        id?: string | undefined;
        "aria-describedby"?: string | undefined;
        "aria-invalid"?: boolean | "true" | "false" | undefined;
      }>)
    : null;
  const controlId = child?.props.id ?? generatedControlId;
  const describedBy = [
    child?.props["aria-describedby"],
    hint ? hintId : undefined,
    error ? errorId : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const control = child
    ? cloneElement(child, {
        id: controlId,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error
          ? { "aria-invalid": true }
          : child.props["aria-invalid"] !== undefined
            ? { "aria-invalid": child.props["aria-invalid"] }
            : {}),
      })
    : children;

  return (
    <div className="field">
      <label htmlFor={child ? controlId : undefined}>{label}</label>
      {control}
      {hint ? <small id={hintId}>{hint}</small> : null}
      {error ? (
        <small id={errorId} className="field-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  required = false,
  name,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      required={required}
      {...(name ? { name } : {})}
    >
      <SelectPrimitive.Trigger
        id={id}
        className="select-trigger"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required || undefined}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon
          className="select-trigger__icon"
          aria-hidden="true"
        >
          ▾
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="select-content" position="popper">
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                {...(option.disabled ? { disabled: true } : {})}
                className="select-item"
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator
                  className="select-item__indicator"
                  aria-hidden="true"
                >
                  ✓
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
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
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButton.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus.current?.focus();
    };
  }, [open]);

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
      >
        <div className="dialog__head">
          <h2 id={titleId}>{title}</h2>
          <Button
            ref={closeButton}
            tone="quiet"
            aria-label="Close dialog"
            onClick={onClose}
          >
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
