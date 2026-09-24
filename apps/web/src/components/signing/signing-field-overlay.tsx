"use client";

import { useRef } from "react";

import { clampPlacement } from "@/lib/field-placement";
import type { SigningField } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

type SigningFieldOverlayProps = {
  appearance?: { text?: string; image?: string } | null;
  busy?: boolean;
  className?: string;
  movable?: boolean;
  field: SigningField;
  onActivate?: () => void;
  onPlacementChange: (placement: { page: number; x: number; y: number; width: number; height: number }) => void;
  onPlacementCommit?: () => void;
  selected?: boolean;
  readOnly?: boolean;
};

export function SigningFieldOverlay({
  appearance,
  busy,
  className,
  movable = false,
  field,
  onActivate,
  onPlacementChange,
  onPlacementCommit,
  selected = false,
  readOnly = false,
}: SigningFieldOverlayProps) {
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; rect: DOMRect; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const resizeRef = useRef<{ startX: number; startY: number; originWidth: number; originHeight: number; rect: DOMRect } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!movable || busy) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const overlay = event.currentTarget.closest("[data-signing-overlay]") as HTMLElement | null;
    if (!overlay) {
      return;
    }
    movedRef.current = false;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: field.x,
      originY: field.y,
      rect: overlay.getBoundingClientRect(),
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const dx = ((event.clientX - drag.startX) / drag.rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / drag.rect.height) * 100;
    if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
      drag.moved = true;
      movedRef.current = true;
    }
    const next = clampPlacement(drag.originX + dx, drag.originY + dy, field.width, field.height);
    onPlacementChange({ page: field.page, ...next });
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const moved = drag.moved;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (moved) {
      event.preventDefault();
      onPlacementCommit?.();
    }
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!movable || busy) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const overlay = event.currentTarget.closest("[data-signing-overlay]") as HTMLElement | null;
    if (!overlay) {
      return;
    }
    movedRef.current = true;
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originWidth: field.width,
      originHeight: field.height,
      rect: overlay.getBoundingClientRect(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize) {
      return;
    }
    const dw = ((event.clientX - resize.startX) / resize.rect.width) * 100;
    const dh = ((event.clientY - resize.startY) / resize.rect.height) * 100;
    const next = clampPlacement(field.x, field.y, resize.originWidth + dw, resize.originHeight + dh);
    onPlacementChange({ page: field.page, ...next });
  };

  const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeRef.current) {
      return;
    }
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onPlacementCommit?.();
  };

  const display = appearance ?? (field.value as { text?: string; image?: string } | undefined);

  return (
    <div
      style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height}%` }}
      className={cn(
        "absolute z-20 flex items-center justify-center overflow-hidden rounded-[2px] bg-white/95 px-1.5 text-zinc-800 shadow-sm ring-2 [container-type:size]",
        field.completed ? "ring-emerald-500" : selected ? "ring-primary shadow-md" : readOnly ? "ring-zinc-300" : "ring-yellow-400 hover:ring-orange-400",
        movable ? "cursor-grab active:cursor-grabbing" : "",
        selected && movable ? "z-30" : "",
        className,
      )}
      onPointerDown={movable ? startDrag : undefined}
      onPointerMove={movable ? moveDrag : undefined}
      onPointerUp={movable ? endDrag : undefined}
      onPointerCancel={movable ? endDrag : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (movedRef.current) {
          movedRef.current = false;
          return;
        }
        onActivate?.();
      }}
    >
      {display?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={display.image} className="pointer-events-none h-full w-full object-contain" />
      ) : (
        <span className="pointer-events-none block w-full truncate text-center text-[clamp(10px,18cqw,14px)] font-medium leading-tight">
          {display?.text || field.label || field.type}
        </span>
      )}
      {movable && selected ? (
        <>
          <span className="pointer-events-none absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-white bg-primary shadow" />
          <button
            type="button"
            aria-label="Resize field"
            draggable={false}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="absolute -bottom-2 -right-2 z-40 size-5 cursor-se-resize rounded-full border-2 border-white bg-primary shadow-md"
          />
        </>
      ) : null}
    </div>
  );
}

export function SigningOverlaySurface({
  children,
  className,
  onBackgroundClick,
}: {
  children: React.ReactNode;
  className?: string;
  onBackgroundClick?: () => void;
}) {
  return (
    <div data-signing-overlay className={cn("absolute inset-0", className)} onClick={() => onBackgroundClick?.()}>
      {children}
    </div>
  );
}
