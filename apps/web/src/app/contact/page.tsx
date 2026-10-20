import type { Metadata } from "next";
import { ContactPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = { title: { absolute: "Contact · Signet" }, description: "Contact the Signet team about product questions, plans, and enterprise workspaces." };
export default function Page() { return <ContactPage />; }
