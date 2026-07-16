"use client";
import { useEffect, useState } from "react";
import type {
  Company,
  Style,
  StyleDefinition,
  StyleVersion,
} from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";
const initial: StyleDefinition = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Noto Serif",
  bodySizePt: 10,
  headingScale: 1.5,
  italicStyle: "italic",
  colors: {
    text: "#1D2624",
    heading: "#1D403C",
    primary: "#1D403C",
    accent: "#A9442A",
    muted: "#68716B",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: true,
  },
};
export function StylesDashboard() {
  const companies = useLoaded(dashboardApi.companies);
  const [companyId, setCompanyId] = useState("");
  const [styles, setStyles] = useState<Style[]>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<Style>();
  useEffect(() => {
    if (!companyId) {
      setStyles(undefined);
      return;
    }
    dashboardApi
      .styles(companyId)
      .then(setStyles)
      .catch((e) => setError(safeError(e)));
  }, [companyId]);
  async function created(style: Style) {
    setSelected(style);
    setCompanyId(style.companyId);
    setStyles(await dashboardApi.styles(style.companyId));
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Styles</p>
          <h1>Structured brand systems.</h1>
          <p>
            Each save creates an immutable version. Documents remain pinned to
            the version used for their render.
          </p>
        </div>
      </section>
      <section className="panel dashboard-panel">
        <LoadState {...companies} />
        {companies.value && (
          <StyleCreate
            companies={companies.value}
            onCreated={(style) => void created(style)}
          />
        )}
      </section>
      <section className="panel dashboard-panel">
        <FormField label="Filter styles by company">
          <select
            className="input"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Choose a company</option>
            {companies.value
              ?.filter((c) => !c.archivedAt)
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </FormField>
        {error && <Status kind="error">{error}</Status>}
        {styles &&
          (styles.length ? (
            <Table
              caption="Styles"
              columns={["Style", "Active version", "Created", "Open"]}
            >
              {styles.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>{s.activeVersionId ? "Active" : "Inactive"}</td>
                  <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Button tone="quiet" onClick={() => setSelected(s)}>
                      Edit versions
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>
              <strong>No styles for this company</strong>
              <p>Create a style using the structured controls above.</p>
            </Empty>
          ))}
      </section>
      {selected && (
        <StyleEditor style={selected} onClose={() => setSelected(undefined)} />
      )}
    </>
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
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!companyId) throw new Error("Choose a company.");
      onCreated(
        await dashboardApi.createStyle({
          companyId,
          name,
          definition: initial,
        }),
      );
      setName("");
    } catch (e) {
      setError(safeError(e));
    }
  }
  return (
    <form className="inline-form" onSubmit={(event) => void submit(event)}>
      <FormField label="New style name">
        <Input
          value={name}
          required
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField label="Company">
        <select
          className="input"
          required
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">Choose…</option>
          {companies
            .filter((c) => !c.archivedAt)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </FormField>
      <Button>Create style</Button>
      {error && <Status kind="error">{error}</Status>}
    </form>
  );
}
function StyleEditor({
  style,
  onClose,
}: {
  style: Style;
  onClose: () => void;
}) {
  const detail = useLoaded(() => dashboardApi.style(style.id), [style.id]);
  const [definition, setDefinition] = useState<StyleDefinition>(initial);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    const latest = detail.value?.versions.at(-1);
    if (latest) setDefinition(latest.definition);
  }, [detail.value]);
  function set(path: "bodySizePt" | "headingScale", value: string) {
    setDefinition((d) => ({ ...d, [path]: Number(value) }));
  }
  async function save(activate: boolean) {
    try {
      await dashboardApi.createStyleVersion(style.id, definition, activate);
      detail.reload();
      setMessage(
        activate
          ? "New version saved and activated."
          : "New inactive version saved.",
      );
    } catch (e) {
      setMessage(safeError(e));
    }
  }
  async function preview() {
    try {
      const result = await dashboardApi.previewStyle(style.id, definition);
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else setMessage("Preview is being prepared. Try again shortly.");
    } catch (e) {
      setMessage(safeError(e));
    }
  }
  return (
    <section className="panel dashboard-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Style editor</p>
          <h2>{style.name}</h2>
        </div>
        <Button tone="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <LoadState {...detail} />
      {detail.value && (
        <>
          <div className="style-fields">
            <FormField label="Body font">
              <select
                className="input"
                value={definition.bodyFont}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    bodyFont: e.target.value as StyleDefinition["bodyFont"],
                  }))
                }
              >
                {[
                  "Inter",
                  "IBM Plex Sans",
                  "Source Sans 3",
                  "Noto Sans",
                  "Noto Serif",
                  "Libertinus Serif",
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Heading font">
              <Input
                value={definition.headingFont}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    headingFont: e.target
                      .value as StyleDefinition["headingFont"],
                  }))
                }
              />
            </FormField>
            <FormField label="Body size (pt)">
              <Input
                type="number"
                min="8"
                max="16"
                value={definition.bodySizePt}
                onChange={(e) => set("bodySizePt", e.target.value)}
              />
            </FormField>
            <FormField label="Heading scale">
              <Input
                type="number"
                min="1.05"
                max="2.5"
                step=".05"
                value={definition.headingScale}
                onChange={(e) => set("headingScale", e.target.value)}
              />
            </FormField>
            {Object.entries(definition.colors).map(([key, value]) => (
              <FormField key={key} label={`${key} color`}>
                <Input
                  pattern="#[0-9A-Fa-f]{6}"
                  value={value}
                  onChange={(e) =>
                    setDefinition((d) => ({
                      ...d,
                      colors: { ...d.colors, [key]: e.target.value },
                    }))
                  }
                />
              </FormField>
            ))}
            <FormField label="Logo object ID">
              <Input
                value={definition.logoObjectId ?? ""}
                placeholder="Optional uploaded logo ID"
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    logoObjectId: e.target.value || null,
                  }))
                }
              />
            </FormField>
            <FormField label="Italic style">
              <select
                className="input"
                value={definition.italicStyle}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    italicStyle: e.target.value as "italic" | "oblique",
                  }))
                }
              >
                <option>italic</option>
                <option>oblique</option>
              </select>
            </FormField>
            <FormField label="Page size">
              <select
                className="input"
                value={definition.page.size}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    page: {
                      ...d.page,
                      size: e.target.value as "A4" | "LETTER",
                    },
                  }))
                }
              >
                <option>A4</option>
                <option>LETTER</option>
              </select>
            </FormField>
            {(
              [
                "marginTopMm",
                "marginRightMm",
                "marginBottomMm",
                "marginLeftMm",
              ] as const
            ).map((key) => (
              <FormField
                key={key}
                label={`${key.replace("margin", "Margin ").replace("Mm", " (mm)")}`}
              >
                <Input
                  type="number"
                  min="0"
                  max="80"
                  value={definition.page[key]}
                  onChange={(e) =>
                    setDefinition((d) => ({
                      ...d,
                      page: { ...d.page, [key]: Number(e.target.value) },
                    }))
                  }
                />
              </FormField>
            ))}
            <FormField label="Header text">
              <Input
                value={definition.header.leftText}
                maxLength={120}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    header: {
                      ...d.header,
                      leftText: e.target.value,
                      enabled: Boolean(e.target.value),
                    },
                  }))
                }
              />
            </FormField>
            <FormField label="Footer text">
              <Input
                value={definition.footer.leftText}
                maxLength={120}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    footer: {
                      ...d.footer,
                      leftText: e.target.value,
                      enabled: Boolean(e.target.value),
                    },
                  }))
                }
              />
            </FormField>
          </div>
          <div className="row-actions">
            <Button onClick={() => void save(true)}>
              Save & activate version
            </Button>
            <Button tone="quiet" onClick={() => void save(false)}>
              Save inactive version
            </Button>
            <Button tone="quiet" onClick={() => void preview()}>
              Constrained PDF preview
            </Button>
          </div>
          {message && (
            <Status kind={message.includes("saved") ? "success" : "error"}>
              {message}
            </Status>
          )}
          <h3>Version history</h3>
          <VersionList
            versions={detail.value.versions}
            active={style.activeVersionId}
          />
        </>
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
    <Table
      caption="Style version history"
      columns={["Version", "Created", "State"]}
    >
      {versions.map((v) => (
        <tr key={v.id}>
          <td>v{v.version}</td>
          <td>{new Date(v.createdAt).toLocaleString()}</td>
          <td>
            {v.id === active ? (
              <span className="badge">Active</span>
            ) : (
              "Immutable"
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}
