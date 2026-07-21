import { useEffect, useState } from "react";
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
import { Button, Status } from "./primitives";

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

  useEffect(() => {
    const latest = detail.value?.versions.at(-1);
    if (latest) setDefinition(latest.definition);
  }, [detail.value]);

  const updateNumber = (key: "bodySizePt" | "headingScale", value: string) =>
    setDefinition((draft) => ({ ...draft, [key]: Number(value) }));

  async function save(activate: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.createStyleVersion(
        style.id,
        { ...definition, assetVersion: 1 },
        activate,
      );
      detail.reload();
      setMessage({
        text: activate
          ? "New version saved and activated."
          : "New inactive version saved.",
        error: false,
      });
    } catch (reason) {
      setMessage({ text: safeError(reason), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (busy) return;
    const previewWindow = window.open("", "_blank");
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await dashboardApi.previewStyle(style.id, {
        ...definition,
        assetVersion: 1,
      });
      if (result.url && previewWindow) {
        const response = await fetch(result.url);
        const pdfUrl = URL.createObjectURL(
          new Blob([await response.arrayBuffer()], {
            type: "application/pdf",
          }),
        );
        previewWindow.opener = null;
        previewWindow.location.replace(pdfUrl);
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
        <Button tone="quiet" onClick={onClose}>
          Back to style library
        </Button>
      </header>
      <LoadState {...detail} />
      {detail.value && (
        <div className="style-studio__layout">
          <div className="style-controls">
            <TypographyControls
              definition={definition}
              setDefinition={setDefinition}
              updateNumber={updateNumber}
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
            <div className="studio-actions">
              <Button disabled={busy} onClick={() => void save(true)}>
                Save & activate version
              </Button>
              <Button
                tone="quiet"
                disabled={busy}
                onClick={() => void save(false)}
              >
                Save inactive version
              </Button>
              <Button
                tone="quiet"
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
