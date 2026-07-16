import { Status } from "./primitives";
export function FeatureState({
  eyebrow,
  title,
  children,
  ownerOnly = false,
}: {
  eyebrow: string;
  title: string;
  children: string;
  ownerOnly?: boolean;
}) {
  return (
    <section className="panel feature-state">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{children}</p>
      {ownerOnly ? (
        <Status kind="warning">
          Owner access is required for changes on this screen.
        </Status>
      ) : (
        <Status>Loading workspace data securely…</Status>
      )}
      <div className="empty-state">
        <strong>Nothing to show yet</strong>
        <p>This dashboard surface is ready for the API-backed workflow.</p>
      </div>
    </section>
  );
}
