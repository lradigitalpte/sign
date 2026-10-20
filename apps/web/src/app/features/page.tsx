import type { Metadata } from "next";
import { FeaturesPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = { title: { absolute: "Features · Signet" }, description: "Prepare, send, sign, and track business documents with Signet." };
export default function Page() { return <FeaturesPage />; }
