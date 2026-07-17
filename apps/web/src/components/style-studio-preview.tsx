import type { CSSProperties } from "react";
import type { StyleDefinition } from "@hypergendoc/contracts";

export function StyleStudioPreview({
  definition,
}: {
  definition: StyleDefinition;
}) {
  const { colors, page, header, footer } = definition;
  const pageStyle = {
    fontFamily: definition.bodyFont,
    fontSize: `${definition.bodySizePt}pt`,
    color: colors.text,
    "--font-family": definition.bodyFont,
    "--heading-font-family": definition.headingFont,
    "--font-size": `${definition.bodySizePt}pt`,
    "--page-text": colors.text,
    "--heading-color": colors.heading,
    "--primary-color": colors.primary,
    "--accent-color": colors.accent,
    "--muted-color": colors.muted,
    "--border-color": `${colors.muted}66`,
    "--table-header-color": `${colors.primary}18`,
    "--callout-background": `${colors.accent}12`,
    "--preview-heading": colors.heading,
    "--preview-primary": colors.primary,
    "--preview-accent": colors.accent,
    "--preview-muted": colors.muted,
    "--preview-italic": definition.italicStyle,
    "--page-margin-top": `${page.marginTopMm * 1.6}px`,
    "--page-margin-right": `${page.marginRightMm * 1.6}px`,
    "--page-margin-bottom": `${page.marginBottomMm * 1.6}px`,
    "--page-margin-left": `${page.marginLeftMm * 1.6}px`,
    padding: `${page.marginTopMm * 1.6}px ${page.marginRightMm * 1.6}px ${page.marginBottomMm * 1.6}px ${page.marginLeftMm * 1.6}px`,
    aspectRatio: page.size === "A4" ? "0.707" : "0.773",
  } as CSSProperties;

  const running = (content: StyleDefinition["header"]) => (
    <>
      <span>{content.leftText}</span>
      <span>{content.centerText}</span>
      <span>
        {content.rightText}
        {content.showPageNumber && `${content.rightText ? " · " : ""}1`}
      </span>
    </>
  );

  return (
    <aside className="style-preview-pane">
      <div className="style-preview-pane__heading">
        <div>
          <p className="eyebrow">Instant canvas</p>
          <h3>Sample document</h3>
        </div>
        <small>
          Approximate browser preview — use PDF preview for the exact server
          render.
        </small>
      </div>
      <div className="style-preview-frame">
        <article
          className="style-preview-page"
          data-page-size={page.size.toLowerCase()}
          style={pageStyle}
        >
          {header.enabled && (
            <header className="style-preview-page__running">
              {running(header)}
            </header>
          )}
          <main>
            {definition.logoObjectId && (
              <div className="style-preview-page__logo">Logo</div>
            )}
            <p className="style-preview-page__eyebrow">Brand briefing · 2025</p>
            <h1
              style={{
                fontFamily: definition.headingFont,
                fontSize: `${definition.bodySizePt * definition.headingScale * 2}pt`,
              }}
            >
              A clearer way to make progress
            </h1>
            <p className="style-preview-page__meta">
              A representative document system
            </p>
            <p>
              Good design gives important information room to breathe. This
              sample makes the selected type, scale, and colors immediately
              visible.
            </p>
            <aside className="style-preview-page__callout">
              A focused callout gives your key idea a confident accent.
            </aside>
            <table>
              <tbody>
                <tr>
                  <th>Priority</th>
                  <th>Owner</th>
                  <th>Status</th>
                </tr>
                <tr>
                  <td>Launch</td>
                  <td>Studio</td>
                  <td>Ready</td>
                </tr>
              </tbody>
            </table>
          </main>
          {footer.enabled && (
            <footer className="style-preview-page__running">
              {running(footer)}
            </footer>
          )}
        </article>
      </div>
    </aside>
  );
}
