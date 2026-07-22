import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, History, LayoutPanelTop, Save } from "lucide-react";
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
  TypographyControls,
} from "./style-studio-controls";
import { PageControls } from "./style-studio-page-controls";
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
  const [workspaceMode, setWorkspaceMode] = useState<
    "split" | "editor" | "preview"
  >("split");
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
      <header className="style-studio__header !items-start !border-border !pb-5">
        <div>
          <p className="eyebrow !font-mono !text-primary">Style studio</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="style-studio-title"
              className="!mt-1 !font-sans !text-2xl !font-semibold !tracking-tight text-foreground sm:!text-3xl"
            >
              {style.name}
            </h2>
            <span
              className={`rounded-md px-2 py-1 font-mono text-[11px] ${isDirty ? "bg-warning-soft text-warning" : "bg-accent text-accent-foreground"}`}
            >
              {isDirty ? "Unsaved changes" : "All changes saved"}
            </span>
          </div>
          <p className="!mt-2 !text-sm !text-muted-foreground">
            Configure the document system, then save an immutable version.
          </p>
        </div>
        <Button
          className="shrink-0"
          tone="quiet"
          onClick={() => (isDirty ? setConfirmation("discard") : onClose())}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to style library
        </Button>
      </header>
      <LoadState {...detail} />
      {detail.value && (
        <>
          <div className="style-studio__workspace-toolbar">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Workspace view
            </span>
            <div
              className="style-studio__view-switcher"
              role="group"
              aria-label="Workspace view"
            >
              {(
                [
                  ["split", "Split", LayoutPanelTop],
                  ["editor", "Editor", Save],
                  ["preview", "Preview", Eye],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={workspaceMode === mode}
                  className={workspaceMode === mode ? "is-active" : undefined}
                  onClick={() => setWorkspaceMode(mode)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`style-studio__layout style-studio__layout--${workspaceMode}`}
          >
            <div
              className="style-controls"
              hidden={workspaceMode === "preview"}
            >
              <div className="min-w-0 rounded-lg border border-border bg-card p-2 shadow-sm">
                <p className="px-1 pb-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Editor sections
                </p>
                <nav
                  className="style-studio__section-nav !static !border-border !bg-muted !shadow-none"
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
              </div>
              <div className="studio-actions studio-actions--pinned !sticky !top-3 !z-10 !rounded-lg !border-border !bg-card !p-3 !shadow-sm">
                <Button
                  className="studio-actions__activate"
                  disabled={busy}
                  onClick={() => setConfirmation("activate")}
                >
                  <Save className="size-4" aria-hidden="true" />
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
                  <Eye className="size-4" aria-hidden="true" />
                  Open generated PDF
                </Button>
              </div>
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
            <div
              className="style-studio__preview"
              hidden={workspaceMode === "editor"}
            >
              <StyleStudioPreview definition={definition} assets={assets} />
            </div>
          </div>
        </>
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
      <h3
        id="version-history"
        className="flex items-center gap-2 !font-sans !text-base !font-semibold text-foreground"
      >
        <History className="size-4 text-primary" aria-hidden="true" />
        Version history
      </h3>
      <ul>
        {versions.map((version) => (
          <li className="!rounded-md !border-border !bg-card" key={version.id}>
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
