import type { Metadata } from "next";

import { HomePage } from "@/components/marketing/home-page";

export const metadata: Metadata = {
  title: { absolute: "Signet · Electronic signatures for teams" },
  description: "Prepare, send, and track agreements in one workspace. Recipients sign for free, without an account.",
};

export default function Home() {
  return <HomePage />;
}
