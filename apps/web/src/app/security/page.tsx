import type { Metadata } from "next";
import { SecurityPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = { title: { absolute: "Security · Signet" }, description: "Explore Signet document access controls, audit records, and workspace security features." };
export default function Page() { return <SecurityPage />; }
