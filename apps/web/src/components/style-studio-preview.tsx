import type { CSSProperties } from "react";
import type {
  CompanyAssets,
  StyleDefinition,
  TextStyleRole,
} from "@hypergendoc/contracts";
import { legacyTextStyles } from "./style-studio-definition";

export function StyleStudioPreview({
  definition,
  assets,
}: {
  definition: StyleDefinition;
  assets?: CompanyAssets | undefined;
}) {
  const { colors, page, header, footer } = definition;
  const uploadedFonts =
    assets?.fonts.filter((font) => font.source === "uploaded") ?? [];
  const selectedLogo = assets?.logos.find(
    (logo) => logo.id === definition.logoObjectId,
  );
  const previewFont = (font: string) =>
    uploadedFonts.some((asset) => asset.id === font)
      ? `company-font-${font}`
      : font;
  const fontFaces = uploadedFonts
    .map(
      (font) =>
        `@font-face{font-family:"company-font-${font.id}";src:url(${JSON.stringify(font.contentUrl)});font-display:swap;}`,
    )
    .join("");
  const textStyles = definition.textStyles ?? legacyTextStyles(definition);
  const pageStyle = {
    fontFamily: previewFont(definition.bodyFont),
    fontSize: `${definition.bodySizePt}pt`,
    color: colors.text,
    "--font-family": previewFont(definition.bodyFont),
    "--heading-font-family": previewFont(definition.headingFont),
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
    padding: `${page.marginTopMm * 1.6}px ${page.marginRightMm * 1.6}px ${page.marginBottomMm * 1.6}px ${page.marginLeftMm * 1.6}px`,
    aspectRatio: page.size === "A4" ? "0.707" : "0.773",
  } as CSSProperties;
  const textStyle = (role: TextStyleRole): CSSProperties => ({
    fontFamily: previewFont(textStyles[role].fontFamily),
    fontSize: `${textStyles[role].fontSizePt}pt`,
    fontWeight: textStyles[role].fontWeight,
    lineHeight: textStyles[role].lineHeight,
    color: textStyles[role].color,
  });
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
      {fontFaces && <style>{fontFaces}</style>}
      <div className="style-preview-pane__heading">
        <div>
          <p className="eyebrow">Instant canvas</p>
          <h3>Sample document</h3>
        </div>
        <small>
          Approximate browser preview — open the generated PDF for the exact
          server render.
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
            {selectedLogo && (
              <img
                className="style-preview-page__logo"
                src={selectedLogo.contentUrl}
                alt={selectedLogo.displayName ?? "Company logo"}
              />
            )}
            <p className="style-preview-page__eyebrow">Brand briefing · 2025</p>
            <h1 style={textStyle("h1")}>A clearer way to make progress</h1>
            <p
              className="style-preview-page__meta"
              style={textStyle("caption")}
            >
              A representative document system
            </p>
            <p>
              Good design gives important information room to breathe. This
              sample makes the selected type, scale, and colors immediately
              visible.
            </p>
            <div className="style-preview-page__hierarchy">
              <h2 style={textStyle("h2")}>Strategy and direction</h2>
              <h3 style={textStyle("h3")}>A focused structure</h3>
              <h4 style={textStyle("h4")}>Team alignment</h4>
              <h5 style={textStyle("h5")}>Delivery detail</h5>
              <h6 style={textStyle("h6")}>Supporting note</h6>
            </div>
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
