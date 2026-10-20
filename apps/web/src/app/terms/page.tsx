import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = { title: { absolute: "Terms · Signet" }, description: "A summary of expectations for using the Signet signing workspace." };
export default function Page() { return <LegalPage kind="terms" />; }
