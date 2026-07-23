"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Palette, Plus } from "lucide-react";
import type { Company, CompanyAssets, Style } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError } from "./dashboard-state";
import { Button, FormField, Input, PageHeader, Status } from "./primitives";
import { initialStyleDefinition } from "./style-studio-definition";
import { StyleStudio } from "./style-studio";

export function StylesDashboard() {
  const {
    activeCompany,
    loading,
    error: companyError,
    reload,
    noActiveCompany,
  } = useActiveCompany();
  const [styles, setStyles] = useState<Style[]>();
  const [assets, setAssets] = useState<CompanyAssets>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<Style>();
  const stylesRequest = useRef(0);

  useEffect(() => {
    const request = ++stylesRequest.current;
    setError(undefined);
    setStyles(undefined);
    setAssets(undefined);
    setSelected(undefined);
    if (!activeCompany) return;
    Promise.all([
      dashboardApi.styles(activeCompany.id),
      dashboardApi.assets(activeCompany.id),
    ])
      .then(([nextStyles, nextAssets]) => {
        if (stylesRequest.current !== request) return;
        setStyles(nextStyles);
        setAssets(nextAssets);
      })
      .catch((reason) => {
        if (stylesRequest.current === request) setError(safeError(reason));
      });
    return () => {
      if (stylesRequest.current === request) stylesRequest.current++;
    };
  }, [activeCompany?.id]);

  if (selected) {
    return (
      <div className="styles-page">
        <StyleStudio
          style={selected}
          assets={assets}
          refreshAssets={async () => {
            const request = stylesRequest.current;
            const next = await dashboardApi.assets(selected.companyId);
            if (stylesRequest.current === request) setAssets(next);
            return next;
          }}
          onClose={() => {
            setStyles((current) =>
              current
                ? [
                    ...current.filter(
                      (currentStyle) => currentStyle.id !== selected.id,
                    ),
                    selected,
                  ]
                : [selected],
            );
            setSelected(undefined);
          }}
        />
      </div>
    );
  }

  return (
    <div className="styles-page">
      <PageHeader
        eyebrow="Style library"
        title="Structured brand systems."
        description="Build an intentional visual language. Every save remains an immutable version for reliable document rendering."
        aside={
          <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex">
            <Palette className="size-4 text-primary" aria-hidden="true" />
            Versioned document styling
          </div>
        }
      />
      {activeCompany ? (
        <>
          <section className="panel dashboard-panel !rounded-lg !border-border !bg-card !p-5 !shadow-sm">
            <div className="panel-heading !mb-4 !items-center">
              <div>
                <p className="eyebrow !font-mono !text-primary">New style</p>
                <h2 className="!mt-1 !text-lg !font-semibold text-foreground">
                  Create for {activeCompany.name}
                </h2>
              </div>
              <span className="hidden rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground sm:inline-flex">
                <Plus className="mr-1 size-3.5" aria-hidden="true" /> New system
              </span>
            </div>
            <StyleCreate
              company={activeCompany}
              existingNames={styles?.map((style) => style.name) ?? []}
              onCreated={(created) => {
                setStyles((current) =>
                  current
                    ? [
                        ...current.filter((style) => style.id !== created.id),
                        created,
                      ]
                    : [created],
                );
                setSelected(created);
              }}
            />
          </section>
          <section
            className="panel dashboard-panel !rounded-lg !border-border !bg-card !p-5 !shadow-sm"
            aria-labelledby="style-library-title"
          >
            <div className="panel-heading !mb-4 !items-center">
              <div>
                <p className="eyebrow !font-mono !text-primary">Library</p>
                <h2
                  id="style-library-title"
                  className="!mt-1 !text-lg !font-semibold text-foreground"
                >
                  Your style systems
                </h2>
              </div>
              {styles && (
                <span className="font-mono text-xs text-muted-foreground">
                  {styles.length} total
                </span>
              )}
            </div>
            {error && <Status kind="error">{error}</Status>}
            {styles &&
              (styles.length ? (
                <div className="style-card-grid">
                  {styles.map((style) => (
                    <article
                      className="style-card !gap-4 !rounded-lg !border-border !bg-card !p-4 !shadow-none hover:!border-primary hover:!shadow-sm"
                      key={style.id}
                    >
                      <div className="style-card__head !text-xs !text-muted-foreground">
                        <span
                          className={`badge ${style.activeVersionId ? "" : "badge--quiet"}`}
                        >
                          {style.activeVersionId ? "Active" : "Inactive"}
                        </span>
                        <time dateTime={style.createdAt}>
                          Created{" "}
                          {new Date(style.createdAt).toLocaleDateString()}
                        </time>
                      </div>
                      <h3 className="!font-sans !text-base !font-semibold !tracking-tight text-foreground">
                        {style.name}
                      </h3>
                      <div
                        className="style-card__swatches"
                        aria-label="Example color palette"
                      >
                        <span
                          style={{
                            backgroundColor:
                              initialStyleDefinition.colors.primary,
                          }}
                        />
                        <span
                          style={{
                            backgroundColor:
                              initialStyleDefinition.colors.accent,
                          }}
                        />
                        <span
                          style={{
                            backgroundColor:
                              initialStyleDefinition.colors.muted,
                          }}
                        />
                      </div>
                      <Button
                        className="!justify-between"
                        tone="quiet"
                        onClick={() => setSelected(style)}
                      >
                        Edit versions{" "}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty>
                  <strong>No styles for {activeCompany.name}</strong>
                  <p>Create a style using the structured controls above.</p>
                </Empty>
              ))}
          </section>
        </>
      ) : (
        <section className="panel dashboard-panel">
          <LoadState loading={loading} error={companyError} reload={reload} />
          {noActiveCompany && (
            <Empty>
              <strong>Choose a company to manage styles</strong>
              <p>
                Create or select a company from{" "}
                <Link href="/workspace/companies">Companies</Link> before
                creating a style system.
              </p>
            </Empty>
          )}
        </section>
      )}
    </div>
  );
}

function StyleCreate({
  company,
  existingNames,
  onCreated,
}: {
  company: Company;
  existingNames: string[];
  onCreated: (style: Style) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    if (
      existingNames.some(
        (existing) =>
          existing.trim().toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      setError("A style with this name already exists for this company.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      onCreated(
        await dashboardApi.createStyle({
          companyId: company.id,
          name,
          definition: initialStyleDefinition,
        }),
      );
      setName("");
    } catch (reason) {
      setError(safeError(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      className="inline-form !gap-3"
      onSubmit={(event) => void submit(event)}
    >
      <FormField label="New style name">
        <Input
          value={name}
          required
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
      </FormField>
      <Button className="sm:!min-w-36" type="submit" disabled={busy}>
        <Plus className="size-4" aria-hidden="true" />
        {busy ? "Creating…" : "Create style"}
      </Button>
      {error && <Status kind="error">{error}</Status>}
    </form>
  );
}
