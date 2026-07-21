"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Company, CompanyAssets, Style } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError } from "./dashboard-state";
import { Button, FormField, Input, Status } from "./primitives";
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
          onClose={() => setSelected(undefined)}
        />
      </div>
    );
  }

  return (
    <div className="styles-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Styles</p>
          <h1>Structured brand systems.</h1>
          <p>
            Build an intentional visual language. Every save remains an
            immutable version for reliable document rendering.
          </p>
        </div>
      </section>
      {activeCompany ? (
        <>
          <section className="panel dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">New style</p>
                <h2>Create for {activeCompany.name}</h2>
              </div>
            </div>
            <StyleCreate company={activeCompany} onCreated={setSelected} />
          </section>
          <section
            className="panel dashboard-panel"
            aria-labelledby="style-library-title"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Library</p>
                <h2 id="style-library-title">Your style systems</h2>
              </div>
            </div>
            {error && <Status kind="error">{error}</Status>}
            {styles &&
              (styles.length ? (
                <div className="style-card-grid">
                  {styles.map((style) => (
                    <article className="style-card" key={style.id}>
                      <div className="style-card__head">
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
                      <h3>{style.name}</h3>
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
                      <Button tone="quiet" onClick={() => setSelected(style)}>
                        Edit versions
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
  onCreated,
}: {
  company: Company;
  onCreated: (style: Style) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
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
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={(event) => void submit(event)}>
      <FormField label="New style name">
        <Input
          value={name}
          required
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
      </FormField>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create style"}
      </Button>
      {error && <Status kind="error">{error}</Status>}
    </form>
  );
}
