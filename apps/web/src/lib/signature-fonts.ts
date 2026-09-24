import { Allura, Caveat, Dancing_Script, Great_Vibes, Pacifico, Satisfy } from "next/font/google";

const dancingScript = Dancing_Script({ subsets: ["latin"], weight: ["400", "700"] });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400" });
const allura = Allura({ subsets: ["latin"], weight: "400" });
const satisfy = Satisfy({ subsets: ["latin"], weight: "400" });
const pacifico = Pacifico({ subsets: ["latin"], weight: "400" });
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "600"] });

export const SIGNATURE_FONTS = [
  { id: "dancing", label: "Classic", font: dancingScript },
  { id: "vibes", label: "Elegant", font: greatVibes },
  { id: "allura", label: "Formal", font: allura },
  { id: "satisfy", label: "Casual", font: satisfy },
  { id: "pacifico", label: "Bold", font: pacifico },
  { id: "caveat", label: "Hand", font: caveat },
] as const;

export type SignatureFontId = (typeof SIGNATURE_FONTS)[number]["id"];

export function signatureFontById(id?: string) {
  return SIGNATURE_FONTS.find((item) => item.id === id) ?? SIGNATURE_FONTS[0];
}

export const SIGNATURE_FONT_CLASSNAMES = SIGNATURE_FONTS.map((item) => item.font.className).join(" ");
