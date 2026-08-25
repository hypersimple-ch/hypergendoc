"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  TemplateFieldDefinition,
  TemplateValue,
} from "@hypergendoc/contracts";
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  Status,
  Table,
} from "./primitives";

export type Fields = Readonly<Record<string, TemplateFieldDefinition>>;

const FIELD_TYPES = [
  "text",
  "richText",
  "number",
  "boolean",
  "date",
  "money",
  "image",
  "object",
  "list",
] as const;

const TYPE_LABELS: Record<(typeof FIELD_TYPES)[number], string> = {
  text: "Text",
  richText: "Rich text",
  number: "Number",
  boolean: "Boolean",
  date: "Date",
  money: "Money",
  image: "Image",
  object: "Object",
  list: "List",
};

/** Mirrors the server contract identifier rule for field names. */
export function fieldNameError(
  name: string,
  existing: Fields = {},
): string | undefined {
  const value = name.trim();
  if (!value) return "Name is required.";
  if (value.length > 64) return "Use at most 64 characters.";
  if (!/^[a-zA-Z]/.test(value))
    return "Start the name with an ASCII letter.";
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value))
    return "Use only letters, digits, underscores, and hyphens after the first letter.";
  if (value in existing) return `A field named ${value} already exists.`;
  return undefined;
}

export function TemplateFieldsEditor({
  fields,
  disabled = false,
  disabledReason,
  onChange,
}: {
  fields: Fields;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (fields: Fields) => void;
}) {
  const [selectedName, setSelectedName] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] =
    useState<TemplateFieldDefinition["type"]>("text");
  const [newLabel, setNewLabel] = useState("");
  const [removingName, setRemovingName] = useState<string>();

  const entries = Object.entries(fields);
  // Selection survives only while the named field still exists in the
  // definition (it may disappear through a JSON edit).
  const selected = selectedName ? fields[selectedName] : undefined;

  function update(name: string, next: TemplateFieldDefinition) {
    onChange({ ...fields, [name]: next });
  }

  function addField() {
    const name = newName.trim();
    if (fieldNameError(name, fields) || !newLabel.trim()) return;
    const label = newLabel.trim();
    onChange({
      ...fields,
      [name]: { type: newType, label },
    });
    setAdding(false);
    setNewName("");
    setNewLabel("");
    setNewType("text");
    setSelectedName(name);
  }

  return (
    <section
      className="rounded-md border border-border bg-background p-4"
      aria-labelledby="template-fields-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="template-fields-heading" className="font-semibold">
            Fields
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit the typed fields of the definition here. Changes update the
            JSON below; the full contract is validated on save.
          </p>
        </div>
        <Button
          tone="quiet"
          disabled={disabled}
          onClick={() => setAdding((current) => !current)}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add field
        </Button>
      </div>
      {disabled && disabledReason ? (
        <div className="mt-3">
          <Status kind="warning">{disabledReason}</Status>
        </div>
      ) : null}
      {!disabled && adding ? (
        <form
          className="mt-4 grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            addField();
          }}
        >
          <FormField label="Name">
            <Input
              value={newName}
              placeholder="e.g. customerName"
              maxLength={64}
              aria-label="New field name"
              onChange={(event) => setNewName(event.target.value)}
            />
          </FormField>
          <FormField label="Type">
            <Select
              value={newType}
              onValueChange={(value) =>
                setNewType(value as TemplateFieldDefinition["type"])
              }
              options={FIELD_TYPES.map((type) => ({
                value: type,
                label: TYPE_LABELS[type],
              }))}
              placeholder="Select a type"
              aria-label="New field type"
            />
          </FormField>
          <FormField label="Label">
            <Input
              value={newLabel}
              placeholder="e.g. Customer name"
              aria-label="New field label"
              onChange={(event) => setNewLabel(event.target.value)}
            />
          </FormField>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            {fieldNameError(newName.trim(), fields) ? (
              <Status kind="error">{fieldNameError(newName.trim(), fields)}</Status>
            ) : null}
            <Button type="submit" disabled={!newLabel.trim()}>
              Add field
            </Button>
            <Button tone="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {entries.length ? (
        <div className="mt-4">
          <Table caption="Template fields" columns={["Name", "Type", "Label", "Flags", "Actions"]}>
            {entries.map(([name, field]) => (
              <tr key={name}>
                <td>
                  <strong>{name}</strong>
                </td>
                <td>
                  <span className="badge">{TYPE_LABELS[field.type]}</span>
                </td>
                <td>{field.label}</td>
                <td>
                  <span className="block text-xs text-muted-foreground">
                    {[field.required ? "Required" : null, field.default !== undefined ? "Has default" : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <Button
                      tone="quiet"
                      disabled={disabled || selectedName === name}
                      aria-label={`Edit field ${name}`}
                      onClick={() => setSelectedName(name)}
                    >
                      Edit
                    </Button>
                    <Button
                      tone="quiet"
                      disabled={disabled}
                      aria-label={`Remove field ${name}`}
                      onClick={() => setRemovingName(name)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      ) : (
        !disabled && (
          <p className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No fields yet. Use Add field to define document data.
          </p>
        )
      )}
      {selected && selectedName ? (
        <SelectedFieldEditor
          key={selectedName}
          name={selectedName}
          field={selected}
          onEdit={(next) => update(selectedName, next)}
          onSelectAnother={setSelectedName}
          onRequestRemove={() => setRemovingName(selectedName)}
        />
      ) : null}
      <ConfirmDialog
        open={removingName !== undefined}
        title={`Remove field ${removingName ?? ""}?`}
        description={`This removes ${removingName ?? "the field"} from definition.fields when the change is applied locally. References in page masters or document nodes are not checked here; they are validated on save.`}
        confirmLabel="Remove field"
        onClose={() => setRemovingName(undefined)}
        onConfirm={() => {
          if (!removingName) return;
          const next = { ...fields };
          delete next[removingName];
          onChange(next);
          if (selectedName === removingName) setSelectedName(undefined);
          setRemovingName(undefined);
        }}
      />
    </section>
  );
}

function SelectedFieldEditor({
  name,
  field,
  onEdit,
  onRequestRemove,
}: {
  name: string;
  field: TemplateFieldDefinition;
  onEdit: (field: TemplateFieldDefinition) => void;
  onSelectAnother: (name: string) => void;
  onRequestRemove: () => void;
}) {
  const [optionsText, setOptionsText] = useState(
    () => (field.options ?? []).join("\n"),
  );

  const nested = field.type === "object" || field.type === "list";

  function patch(changes: Partial<TemplateFieldDefinition>) {
    onEdit({ ...field, ...changes });
  }

  function changeType(type: TemplateFieldDefinition["type"]) {
    onEdit({
      type,
      label: field.label,
      ...(field.description !== undefined
        ? { description: field.description }
        : {}),
      ...(field.required !== undefined ? { required: field.required } : {}),
    });
  }

  function commitOptions(text: string) {
    setOptionsText(text);
    const options = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    patch(options.length ? { options } : { options: undefined });
  }

  function commitDefault(value: TemplateValue | undefined) {
    patch({ default: value });
  }

  const numericDefault = field.type === "number" || field.type === "money";

  return (
    <div
      className="mt-4 grid gap-4 rounded-md border border-border bg-card p-4"
      aria-label={`Edit field ${name}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">
          Field {name} <span className="badge ml-2">{TYPE_LABELS[field.type]}</span>
        </h4>
        <Button tone="quiet" onClick={onRequestRemove}>
          <Trash2 className="size-4" aria-hidden="true" /> Remove field
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Label">
          <Input
            value={field.label}
            aria-label={`Label for ${name}`}
            onChange={(event) => patch({ label: event.target.value })}
          />
        </FormField>
        <FormField label="Type">
          <Select
            value={field.type}
            onValueChange={(value) =>
              changeType(value as TemplateFieldDefinition["type"])
            }
            options={FIELD_TYPES.map((type) => ({
              value: type,
              label: TYPE_LABELS[type],
            }))}
            placeholder="Select a type"
            aria-label={`Type for ${name}`}
          />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          checked={field.required === true}
          aria-label={`Required for ${name}`}
          onChange={(event) => patch({ required: event.target.checked || undefined })}
        />
        Required
      </label>
      <FormField label="Description">
        <Input
          value={field.description ?? ""}
          aria-label={`Description for ${name}`}
          onChange={(event) =>
            patch({
              description: event.target.value.trim() ? event.target.value : undefined,
            })
          }
        />
      </FormField>
      {nested ? (
        <Status kind="neutral">
          Object and list fields keep their structure in JSON. Edit this field
          in JSON.
        </Status>
      ) : (
        <FormField
          label="Default value"
          {...(numericDefault ? { hint: "Empty leaves no default." } : {})}
        >
          {field.type === "boolean" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border accent-primary"
                checked={field.default === true}
                aria-label={`Default value for ${name}`}
                onChange={(event) =>
                  commitDefault(event.target.checked ? true : false)
                }
              />
              Default to checked
            </label>
          ) : (
            <Input
              type={
                numericDefault
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : "text"
              }
              step={numericDefault ? "any" : undefined}
              value={
                numericDefault
                  ? typeof field.default === "number" && Number.isFinite(field.default)
                    ? field.default
                    : ""
                  : typeof field.default === "string"
                    ? field.default
                    : ""
              }
              aria-label={`Default value for ${name}`}
              {...(field.type === "image"
                ? { placeholder: "Image asset UUID" }
                : {})}
              onChange={(event) => {
                const raw = event.target.value;
                if (!raw) return commitDefault(undefined);
                if (numericDefault) {
                  const parsed = event.target.valueAsNumber;
                  if (Number.isFinite(parsed)) commitDefault(parsed);
                  return;
                }
                commitDefault(raw);
              }}
            />
          )}
        </FormField>
      )}
      {field.type === "money" ? (
        <FormField label="Currency" hint="ISO 4217 code such as CHF or USD.">
          <Input
            value={field.currency ?? ""}
            maxLength={8}
            aria-label={`Currency for ${name}`}
            onChange={(event) =>
              patch({
                currency: event.target.value.trim() || undefined,
              })
            }
          />
        </FormField>
      ) : null}
      {field.type === "text" ? (
        <FormField
          label="Options"
          hint="One option per line. Restricts values to this list."
        >
          <textarea
            className="input min-h-24 resize-y"
            value={optionsText}
            aria-label={`Options for ${name}`}
            onChange={(event) => commitOptions(event.target.value)}
          />
        </FormField>
      ) : null}
    </div>
  );
}
