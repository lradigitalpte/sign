import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = { title: { absolute: "Privacy · Signet" }, description: "An overview of how information is used in the Signet signing workspace." };
export default function Page() { return <LegalPage kind="privacy" />; }
