import { FeatureState } from "../../../components/feature-state";
export default function Page() {
  return (
    <FeatureState
      eyebrow="Audit log"
      title="A clear trail, without the secrets."
      children="Security events and workspace changes are available only to workspace owners."
      ownerOnly
    />
  );
}
