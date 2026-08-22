import type { Metadata } from "next";
import { StylesDashboard } from "../../../components/styles-dashboard";

export const metadata: Metadata = { title: "Styles" };
export default function Page() {
  return <StylesDashboard />;
}
