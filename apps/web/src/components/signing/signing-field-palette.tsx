"use client";

import { Calendar, CheckSquare, FileSignature, Paperclip, PenTool, Type, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clampPlacement, SIGNING_FIELD_LABELS, SIGNING_FIELD_SIZES, type FieldPlacement } from "@/lib/field-placement";
import type { EnvelopeField } from "@/lib/platform-api";

type FieldType = EnvelopeField["type"];

const FIELD_TYPES: Array<{ type: FieldType; icon: typeof FileSignature }> = [
  { type: "signature", icon: FileSignature },
  { type: "initials", icon: PenTool },
  { type: "name", icon: User },
  { type: "date", icon: Calendar },
  { type: "text", icon: Type },
  { type: "checkbox", icon: CheckSquare },
  { type: "attachment", icon: Paperclip },
];

export function SigningFieldPalette({
  busy,
  onAdd,
}: {
  busy?: boolean;
  onAdd: (type: FieldType, placement: Omit<FieldPlacement, "page">) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add fields</p>
      <p className="mt-1 text-xs text-muted-foreground">Tap a field type to place it on the current page.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {FIELD_TYPES.map(({ type, icon: Icon }) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            disabled={busy}
            className="h-auto flex-col gap-1.5 py-3 text-xs"
            onClick={() => {
              const size = SIGNING_FIELD_SIZES[type];
              onAdd(type, clampPlacement(34, 38, size.width, size.height));
            }}
          >
            <Icon className="size-4" />
            {SIGNING_FIELD_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  );
}
