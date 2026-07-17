"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, Style } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { initialStyleDefinition } from "./style-studio-definition";
import { StyleStudio } from "./style-studio";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status } from "./primitives";

export function StylesDashboard() {
  const companies = useLoaded(dashboardApi.companies);
  const [companyId, setCompanyId] = useState("");
  const [styles, setStyles] = useState<Style[]>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<Style>();
  const stylesRequest = useRef(0);

  useEffect(() => {
    const request = ++stylesRequest.current;
    setError(undefined);
    setStyles(undefined);
    if (!companyId) return;
    dashboardApi
      .styles(companyId)
      .then((result) => {
        if (stylesRequest.current === request) setStyles(result);
      })
      .catch((reason) => {
        if (stylesRequest.current === request) setError(safeError(reason));
      });
    return () => {
      if (stylesRequest.current === request) stylesRequest.current++;
    };
  }, [companyId]);

  function created(style: Style) {
    setSelected(style);
    setCompanyId(style.companyId);
  }

  return (
    <main className="styles-page">
      <section className="styles-hero">
        <div>
          <p className="eyebrow">Styles</p>
          <h1>Structured brand systems.</h1>
          <p>
            Build an intentional visual language. Every save remains an
            immutable version for reliable document rendering.
          </p>
        </div>
      </section>
      <section className="style-create-card">
        <LoadState {...companies} />
        {companies.value && (
          <StyleCreate companies={companies.value} onCreated={created} />
        )}
      </section>
      <section className="style-library" aria-labelledby="style-library-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2 id="style-library-title">Your style systems</h2>
          </div>
          <FormField label="Filter styles by company">
            <select
              className="input"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">Choose a company</option>
              {companies.value
                ?.filter((company) => !company.archivedAt)
                .map((company) => (
                  <option value={company.id} key={company.id}>
                    {company.name}
                  </option>
                ))}
            </select>
          </FormField>
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
                      Created {new Date(style.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <h3>{style.name}</h3>
                  <div
                    className="style-card__swatches"
                    aria-label="Example color palette"
                  >
                    <span
                      style={{
                        backgroundColor: initialStyleDefinition.colors.primary,
                      }}
                    />
                    <span
                      style={{
                        backgroundColor: initialStyleDefinition.colors.accent,
                      }}
                    />
                    <span
                      style={{
                        backgroundColor: initialStyleDefinition.colors.muted,
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
              <strong>No styles for this company</strong>
              <p>Create a style using the structured controls above.</p>
            </Empty>
          ))}
      </section>
      {selected && (
        <StyleStudio style={selected} onClose={() => setSelected(undefined)} />
      )}
    </main>
  );
}

function StyleCreate({
  companies,
  onCreated,
}: {
  companies: Company[];
  onCreated: (style: Style) => void;
}) {
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!companyId) {
      setError("Choose a company.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      onCreated(
        await dashboardApi.createStyle({
          companyId,
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
      <FormField label="Company">
        <select
          className="input"
          required
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          disabled={busy}
        >
          <option value="">Choose…</option>
          {companies
            .filter((company) => !company.archivedAt)
            .map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
        </select>
      </FormField>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create style"}
      </Button>
      {error && <Status kind="error">{error}</Status>}
    </form>
  );
}
