import { useState } from "react";
import type {
  CompanyAssets,
  StyleDefinition,
  TextStyleRole,
  TextStyles,
} from "@hypergendoc/contracts";
import {
  fonts,
  resolveTextStyles,
  textStyleRoles,
} from "./style-studio-definition";
import { FontPicker } from "./font-picker";
import { FormField, Input, Select, Status } from "./primitives";
import { dashboardApi } from "../lib/dashboard-api";
import { safeError } from "./dashboard-state";
import { ColorControl } from "./style-studio-color-controls";
import { Range } from "./style-studio-number-controls";

type SetDefinition = React.Dispatch<React.SetStateAction<StyleDefinition>>;

export function TypographyControls({
  definition,
  setDefinition,
  assets,
  companyId,
  onAssetsChanged,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
  assets?: CompanyAssets | undefined;
  companyId: string;
  onAssetsChanged: () => Promise<unknown>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const catalogFonts = assets?.fonts ?? [];
  const fontOptions = [
    ...fonts.map(
      (id) =>
        catalogFonts.find((font) => font.id === id) ?? {
          id,
          source: "built_in" as const,
          familyName: id,
          subfamilyName: null,
          displayName: id,
          owned: false,
          contentUrl: null,
        },
    ),
    ...catalogFonts.filter((font) => font.source === "uploaded"),
  ];
  const uploadFont = async (file?: File) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(undefined);
    try {
      await dashboardApi.uploadFont(companyId, file);
      await onAssetsChanged();
    } catch (reason) {
      setUploadError(safeError(reason));
    } finally {
      setUploading(false);
    }
  };
  const [role, setRole] = useState<TextStyleRole>("body");
  const textStyles = resolveTextStyles(definition);
  const style = textStyles[role];
  const roleLabel =
    textStyleRoles.find((item) => item.value === role)?.label ?? "Text";
  const updateRole = (
    change: Partial<NonNullable<TextStyles[TextStyleRole]>>,
  ) =>
    setDefinition((draft) => {
      const styles = resolveTextStyles(draft);
      const next = { ...styles[role], ...change };
      return {
        ...draft,
        textStyles: { ...styles, [role]: next },
        ...(role === "body"
          ? {
              bodyFont: next.fontFamily,
              bodySizePt: next.fontSizePt,
              colors: { ...draft.colors, text: next.color },
            }
          : {}),
      };
    });

  return (
    <section
      className="control-section style-studio__section !rounded-lg !border-border !bg-card !p-4 !shadow-sm"
      aria-labelledby="typography-title"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3
            id="typography-title"
            className="!mb-1 !font-sans !text-base !font-semibold !normal-case !tracking-normal text-foreground"
          >
            Typography
          </h3>
          <p className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
            Set the type scale and voice for every document role.
          </p>
        </div>
        <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
          Type
        </span>
      </div>
      <div className="typography-stack">
        <div className="typography-upload">
          <div className="typography-upload__heading">
            <span>Company fonts</span>
            <small>TTF, OTF or WOFF2</small>
          </div>
          <FormField label="Upload company font">
            <Input
              type="file"
              accept=".ttf,.otf,.woff2,font/ttf,font/otf,font/woff2"
              disabled={uploading}
              onChange={(event) => void uploadFont(event.target.files?.[0])}
            />
          </FormField>
          {uploadError && <Status kind="error">{uploadError}</Status>}
        </div>
        <div className="role-editor" aria-labelledby="text-role-title">
          <div className="role-editor__heading">
            <h4 id="text-role-title">Text roles</h4>
            <p>Editing {roleLabel}</p>
          </div>
          <div className="role-tabs" role="group" aria-label="Text role">
            {textStyleRoles.map((item, index) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={role === item.value}
                tabIndex={role === item.value ? 0 : -1}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? textStyleRoles.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            textStyleRoles.length) %
                          textStyleRoles.length;
                  const next = textStyleRoles[nextIndex];
                  if (!next) return;
                  setRole(next.value);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>("[aria-pressed]")
                    [nextIndex]?.focus();
                }}
                onClick={() => setRole(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="typography-fields">
            <FormField label="Font family">
              <FontPicker
                value={style.fontFamily}
                onValueChange={(fontFamily) => updateRole({ fontFamily })}
                options={fontOptions.map((font) => ({
                  value: font.id,
                  label: font.displayName,
                }))}
              />
            </FormField>
            <Range
              label="Font size"
              value={style.fontSizePt}
              min={role === "body" ? 8 : 6}
              max={role === "body" ? 16 : 72}
              step={role === "body" ? 0.5 : 1}
              unit="pt"
              onChange={(fontSizePt) =>
                updateRole({ fontSizePt: Number(fontSizePt) })
              }
            />
            <FormField label="Weight">
              <Select
                value={String(style.fontWeight)}
                onValueChange={(fontWeight) =>
                  updateRole({
                    fontWeight: Number(fontWeight) as 400 | 500 | 600 | 700,
                  })
                }
                options={[400, 500, 600, 700].map((weight) => ({
                  value: String(weight),
                  label: String(weight),
                }))}
                placeholder="Choose a weight"
                aria-label="Weight"
              />
            </FormField>
            <Range
              label="Line height"
              value={style.lineHeight}
              min={1}
              max={2}
              step={0.05}
              unit=""
              onChange={(lineHeight) =>
                updateRole({ lineHeight: Number(lineHeight) })
              }
            />
            <ColorControl
              name={`${roleLabel} color`}
              value={style.color}
              onChange={(color) => updateRole({ color })}
            />
          </div>
        </div>
        <div
          className="segmented-control segmented-control--titled typography-italic"
          role="radiogroup"
          aria-label="Italic style"
        >
          <span className="segmented-control__title">Italic style</span>
          {(["italic", "oblique"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="italicStyle"
                checked={definition.italicStyle === value}
                onChange={() =>
                  setDefinition((draft) => ({ ...draft, italicStyle: value }))
                }
              />
              {value}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BrandControls({
  definition,
  setDefinition,
  assets,
  companyId,
  onAssetsChanged,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
  assets?: CompanyAssets | undefined;
  companyId: string;
  onAssetsChanged: () => Promise<unknown>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const uploadLogo = async (file?: File) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(undefined);
    try {
      await dashboardApi.uploadLogo(companyId, file);
      await onAssetsChanged();
    } catch (reason) {
      setUploadError(safeError(reason));
    } finally {
      setUploading(false);
    }
  };
  return (
    <>
      <section
        className="control-section style-studio__section !rounded-lg !border-border !bg-card !p-4 !shadow-sm"
        aria-labelledby="brand-assets-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3
              id="brand-assets-title"
              className="!mb-1 !font-sans !text-base !font-semibold !normal-case !tracking-normal text-foreground"
            >
              Brand assets
            </h3>
            <p className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
              Use an uploaded logo in generated documents.
            </p>
          </div>
          <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
            Assets
          </span>
        </div>
        <div
          className="logo-selector"
          role="radiogroup"
          aria-label="Company logo"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!definition.logoObjectId}
            className={
              !definition.logoObjectId
                ? "logo-option logo-option--selected"
                : "logo-option"
            }
            onClick={() =>
              setDefinition((draft) => ({ ...draft, logoObjectId: null }))
            }
          >
            None
          </button>
          {assets?.logos.map((logo) => (
            <button
              type="button"
              role="radio"
              aria-checked={definition.logoObjectId === logo.id}
              className={
                definition.logoObjectId === logo.id
                  ? "logo-option logo-option--selected"
                  : "logo-option"
              }
              key={logo.id}
              onClick={() =>
                setDefinition((draft) => ({ ...draft, logoObjectId: logo.id }))
              }
            >
              <img
                src={logo.contentUrl}
                alt={logo.displayName ?? "Company logo"}
              />
            </button>
          ))}
        </div>
        <FormField label="Upload company logo">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={(event) => void uploadLogo(event.target.files?.[0])}
          />
        </FormField>
        {uploadError && <Status kind="error">{uploadError}</Status>}
      </section>
      <HeaderFooterControls
        label="Header"
        value={definition.header}
        onChange={(header) => setDefinition((draft) => ({ ...draft, header }))}
      />
    </>
  );
}

export function HeaderFooterControls({
  label,
  value,
  onChange,
}: {
  label: "Header" | "Footer";
  value: StyleDefinition["header"];
  onChange: (value: StyleDefinition["header"]) => void;
}) {
  return (
    <section
      className="control-section style-studio__section !rounded-lg !border-border !bg-card !p-4 !shadow-sm"
      aria-labelledby={`${label.toLowerCase()}-controls-title`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3
          id={`${label.toLowerCase()}-controls-title`}
          className="!mb-0 !font-sans !text-base !font-semibold !normal-case !tracking-normal text-foreground"
        >
          {label}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Running content
        </span>
      </div>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) =>
            onChange({ ...value, enabled: event.target.checked })
          }
        />
        Enable {label.toLowerCase()}
      </label>
      {(["leftText", "centerText", "rightText"] as const).map((key) => (
        <FormField
          key={key}
          label={`${label} ${key.replace("Text", " text").replace(/^./, (letter) => letter.toUpperCase())}`}
        >
          <Input
            value={value[key]}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.value })
            }
          />
        </FormField>
      ))}
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={value.showPageNumber}
          onChange={(event) =>
            onChange({ ...value, showPageNumber: event.target.checked })
          }
        />
        Show page number
      </label>
    </section>
  );
}
