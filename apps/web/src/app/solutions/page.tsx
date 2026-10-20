import type { Metadata } from "next";
import { SolutionsPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = { title: { absolute: "Solutions · Signet" }, description: "Electronic signature workflows for sales, people operations, legal, and client teams." };
export default function Page() { return <SolutionsPage />; }
