import type { Metadata } from "next";
import { InviteAcceptForm } from "../../../components/invite-accept";

export const metadata: Metadata = { title: "Join workspace" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Workspace invitation
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          You have been invited to collaborate.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Accept this single-use invitation to create your account and join the
          workspace.
        </p>
      </header>
      <InviteAcceptForm token={token} />
    </>
  );
}
