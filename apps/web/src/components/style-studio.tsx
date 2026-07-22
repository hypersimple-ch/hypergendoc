import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CompanyAssets,
  Style,
  StyleDefinition,
  StyleVersion,
} from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import {
  BrandControls,
  HeaderFooterControls,
  PageControls,
  TypographyControls,
} from "./style-studio-controls";
import { ColorControls } from "./style-studio-color-controls";
import { initialStyleDefinition } from "./style-studio-definition";
import { StyleStudioPreview } from "./style-studio-preview";
import { LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, ConfirmDialog, Status } from "./primitives";

export function StyleStudio({
  style,
  assets,
  refreshAssets,
  onClose,
}: {
  style: Style;
  assets?: CompanyAssets | undefined;
  refreshAssets: () => Promise<unknown>;
  onClose: () => void;
}) {
  const detail = useLoaded(() => dashboardApi.style(style.id), [style.id]);
  const [definition, setDefinition] = useState<StyleDefinition>(
    initialStyleDefinition,
  );
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [savedDefinition, setSavedDefinition] = useState<StyleDefinition>();
  const [confirmation, setConfirmation] = useState<"activate" | "discard">();
  const actionPending = useRef(false);
  const isDirty = useMemo(
    () =>
      savedDefinition !== undefined &&
      JSON.stringify(definition) !== JSON.stringify(savedDefinition),
    [definition, savedDefinition],
  );

  useEffect(() => {
    if (!detail.value) return;
    const saved =
      detail.value.versions.at(-1)?.definition ?? initialStyleDefinition;
    setDefinition(saved);
    setSavedDefinition(saved);
  }, [detail.value]);

  async function save(activate: boolean) {
    if (actionPending.current) return false;
    actionPending.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.createStyleVersion(
        style.id,
        { ...definition, assetVersion: 1 },
        activate,
      );
      setSavedDefinition(definition);
      detail.reload();
      setMessage({
        text: activate
          ? "New version saved and activated."
          : "New inactive version saved.",
        error: false,
      });
      return true;
    } catch (reason) {
      setMessage({ text: safeError(reason), error: true });
      return false;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  async function preview() {
    if (actionPending.current) return;
    actionPending.current = true;
    const previewWindow = window.open("", "_blank");
    if (previewWindow?.document?.body) {
      previewWindow.document.title = "Preparing PDF preview";
      const pendingMessage = previewWindow.document.createElement("p");
      pendingMessage.textContent = "Preparing your PDF preview…";
      pendingMessage.setAttribute("role", "status");
      previewWindow.document.body.replaceChildren(pendingMessage);
    }
    setBusy(true);
    setMessage({ text: "Preparing PDF preview…", error: false });
    try {
      const result = await dashboardApi.previewStyle(style.id, {
        ...definition,
        assetVersion: 1,
      });
      if (result.url && previewWindow) {
        const response = await fetch(result.url);
        if (!response.ok) throw new Error("Preview download failed");
        const pdfUrl = URL.createObjectURL(
          new Blob([await response.arrayBuffer()], {
            type: "application/pdf",
          }),
        );
        previewWindow.opener = null;
        previewWindow.location.replace(pdfUrl);
        setMessage({ text: "PDF preview opened in a new tab.", error: false });
      } else {
        previewWindow?.close();
        setMessage({
          text: result.url
            ? "Your browser blocked the preview window."
            : "Preview is being prepared. Try again shortly.",
          error: true,
        });
      }
    } catch (reason) {
      previewWindow?.close();
      setMessage({ text: safeError(reason), error: true });
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="style-studio" aria-labelledby="style-studio-title">
      <header className="style-studio__header">
        <div>
          <p className="eyebrow">Visual style studio</p>
          <h2 id="style-studio-title">{style.name}</h2>
        </div>
        <Button
          tone="quiet"
          onClick={() => (isDirty ? setConfirmation("discard") : onClose())}
        >
          Back to style library
        </Button>
      </header>
      <LoadState {...detail} />
      {detail.value && (
        <div className="style-studio__layout">
          <div className="style-controls">
            <nav
              className="style-studio__section-nav"
              aria-label="Studio sections"
            >
              <a href="#typography-title">Typography</a>
              <a href="#color-palette-title">Colors</a>
              <a href="#page-layout-title">Page</a>
              <a href="#brand-assets-title">Brand</a>
              <a href="#header-controls-title">Header</a>
              <a href="#footer-controls-title">Footer</a>
              <a href="#version-history">Versions</a>
            </nav>
            <TypographyControls
              definition={definition}
              setDefinition={setDefinition}
              assets={assets}
              companyId={style.companyId}
              onAssetsChanged={refreshAssets}
            />
            <ColorControls
              definition={definition}
              setDefinition={setDefinition}
              savedColors={assets?.colors ?? []}
            />
            <PageControls
              definition={definition}
              setDefinition={setDefinition}
            />
            <BrandControls
              definition={definition}
              setDefinition={setDefinition}
              assets={assets}
              companyId={style.companyId}
              onAssetsChanged={refreshAssets}
            />
            <HeaderFooterControls
              label="Footer"
              value={definition.footer}
              onChange={(footer) =>
                setDefinition((draft) => ({ ...draft, footer }))
              }
            />
            <div className="studio-actions studio-actions--pinned">
              <Button
                className="studio-actions__activate"
                disabled={busy}
                onClick={() => setConfirmation("activate")}
              >
                Review & activate version
              </Button>
              <Button
                tone="quiet"
                className="studio-actions__save"
                disabled={busy}
                onClick={() => void save(false)}
              >
                Save inactive version
              </Button>
              <Button
                tone="quiet"
                className="studio-actions__preview"
                disabled={busy}
                onClick={() => void preview()}
              >
                Open generated PDF
              </Button>
            </div>
            <div aria-live="polite">
              {message && (
                <Status kind={message.error ? "error" : "success"}>
                  {message.text}
                </Status>
              )}
            </div>
            <VersionList
              versions={detail.value.versions}
              active={detail.value.style.activeVersionId}
            />
          </div>
          <StyleStudioPreview definition={definition} assets={assets} />
        </div>
      )}
      <ConfirmDialog
        open={confirmation === "activate"}
        title="Review and activate version"
        description="This saves a new immutable version and makes it the active style for future documents."
        confirmLabel="Save and activate"
        tone="primary"
        pending={busy}
        onClose={() => setConfirmation(undefined)}
        onConfirm={() => {
          void save(true).then((saved) => {
            if (saved) setConfirmation(undefined);
          });
        }}
      />
      <ConfirmDialog
        open={confirmation === "discard"}
        title="Discard unsaved changes?"
        description="Your edits have not been saved as a version. Leave the studio without saving?"
        confirmLabel="Discard changes"
        pending={busy}
        onClose={() => setConfirmation(undefined)}
        onConfirm={onClose}
      />
    </section>
  );
}

function VersionList({
  versions,
  active,
}: {
  versions: StyleVersion[];
  active: string | null;
}) {
  return (
    <section className="version-list" aria-labelledby="version-history">
      <h3 id="version-history">Version history</h3>
      <ul>
        {versions.map((version) => (
          <li key={version.id}>
            <span>v{version.version}</span>
            <time dateTime={version.createdAt}>
              {new Date(version.createdAt).toLocaleString()}
            </time>
            {version.id === active ? (
              <span className="badge">Active</span>
            ) : (
              <span>Immutable</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
