import type { Metadata } from "next";
import { MembersDashboard } from "../../../components/members-dashboard";

export const metadata: Metadata = { title: "Members" };
export default function Page() {
  return <MembersDashboard />;
}
