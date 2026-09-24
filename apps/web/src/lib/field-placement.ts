import type { EnvelopeField } from "@/lib/platform-api";

export function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

export function clampPlacement(x: number, y: number, width: number, height: number) {
  const nextWidth = Math.min(100, Math.max(1, roundCoord(width)));
  const nextHeight = Math.min(100, Math.max(1, roundCoord(height)));
  return {
    x: Math.max(0, Math.min(roundCoord(100 - nextWidth), roundCoord(x))),
    y: Math.max(0, Math.min(roundCoord(100 - nextHeight), roundCoord(y))),
    width: nextWidth,
    height: nextHeight,
  };
}

export type FieldPlacement = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type FieldType = EnvelopeField["type"];

export const SIGNING_FIELD_SIZES: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 32, height: 6 },
  initials: { width: 15, height: 5.2 },
  name: { width: 26.5, height: 5.2 },
  date: { width: 20.5, height: 5.2 },
  text: { width: 26.5, height: 5.2 },
  checkbox: { width: 7, height: 5.2 },
  attachment: { width: 28, height: 6 },
  dropdown: { width: 26.5, height: 5.2 },
  radio: { width: 32, height: 5.2 },
};

export const SIGNING_FIELD_LABELS: Record<FieldType, string> = {
  signature: "Signature",
  initials: "Initials",
  name: "Name",
  date: "Date signed",
  text: "Text",
  checkbox: "Checkbox",
  attachment: "File upload",
  dropdown: "Dropdown",
  radio: "Multiple choice",
};
