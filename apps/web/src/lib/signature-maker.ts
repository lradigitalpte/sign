import { signatureFontById, type SignatureFontId } from "@/lib/signature-fonts";

export const SIGNATURE_INK_COLORS = [
  { id: "black", label: "Black", value: "#111827" },
  { id: "blue", label: "Blue", value: "#1d4ed8" },
] as const;

export type SignatureInkId = (typeof SIGNATURE_INK_COLORS)[number]["id"];

export function signatureInkById(id?: string) {
  return SIGNATURE_INK_COLORS.find((item) => item.id === id) ?? SIGNATURE_INK_COLORS[0];
}

export const CHECKERBOARD_CLASS =
  "bg-[image:repeating-conic-gradient(#e4e4e7_0%_25%,#ffffff_0%_50%)] bg-[size:16px_16px] dark:bg-[image:repeating-conic-gradient(#3f3f46_0%_25%,#18181b_0%_50%)]";

export function trimTransparentCanvas(source: HTMLCanvasElement) {
  const context = source.getContext("2d");
  if (!context) {
    return source;
  }
  const { width, height } = source;
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) {
    return source;
  }
  const pad = 12;
  const next = document.createElement("canvas");
  next.width = maxX - minX + 1 + pad * 2;
  next.height = maxY - minY + 1 + pad * 2;
  next.getContext("2d")?.drawImage(source, minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1);
  return next;
}

export async function renderTypedSignaturePng(input: {
  text: string;
  fontId?: string;
  color?: string;
  fontSize?: number;
}) {
  const text = input.text.trim();
  if (!text) {
    throw new Error("Enter a name first.");
  }
  const font = signatureFontById(input.fontId);
  const family = font.font.style.fontFamily;
  const color = input.color ?? "#111827";
  const fontSize = input.fontSize ?? 72;
  const fontSpec = `${fontSize}px ${family}`;
  await document.fonts.load(fontSpec);
  await document.fonts.ready;

  const probe = document.createElement("canvas");
  const probeContext = probe.getContext("2d");
  if (!probeContext) {
    throw new Error("Canvas is unavailable");
  }
  probeContext.font = fontSpec;
  const width = Math.ceil(probeContext.measureText(text).width) + fontSize;
  const height = Math.ceil(fontSize * 1.8);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(width, 8);
  canvas.height = Math.max(height, 8);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable");
  }
  context.font = fontSpec;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText(text, fontSize / 3, canvas.height / 2);
  return trimTransparentCanvas(canvas).toDataURL("image/png");
}

export function downloadPng(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename.toLowerCase().endsWith(".png") ? filename : `${filename}.png`;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

export function fileSafeName(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "signature";
}

export async function appearanceToPng(appearance: { text: string; image?: string; font?: string; color?: string }) {
  if (appearance.image) {
    return cropAppearanceImage(appearance.image);
  }
  return renderTypedSignaturePng({
    text: appearance.text,
    fontId: appearance.font as SignatureFontId | undefined,
    color: appearance.color,
  });
}

function cropAppearanceImage(source: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("Canvas is unavailable")); return; }
      context.drawImage(image, 0, 0);
      resolve(trimTransparentCanvas(canvas).toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Unable to prepare signature image"));
    image.src = source;
  });
}
