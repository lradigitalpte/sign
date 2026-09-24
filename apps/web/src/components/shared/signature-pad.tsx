"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

type SignaturePadProps = {
  className?: string;
  color?: string;
  onEmptyChange?: (empty: boolean) => void;
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
};

export type SignaturePadHandle = {
  clear: () => void;
  toDataURL: () => string | null;
  undo: () => void;
  redo: () => void;
};

export function SignaturePad({ className, color = "#111827", onEmptyChange, onHistoryChange, handleRef }: SignaturePadProps & { handleRef: MutableRefObject<SignaturePadHandle | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const empty = useRef(true);
  const colorRef = useRef(color);
  const history = useRef<Array<string | null>>([null]);
  const historyIndex = useRef(0);
  colorRef.current = color;

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const nextWidth = Math.max(1, Math.floor(width * ratio));
    const nextHeight = Math.max(1, Math.floor(height * ratio));
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;
    const previous = document.createElement("canvas");
    previous.width = canvas.width; previous.height = canvas.height;
    if (canvas.width && canvas.height) previous.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth = 2.4;
    if (previous.width && previous.height && !empty.current) ctx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, width, height);
  }, []);

  useEffect(() => {
    resize();
    const observer = new ResizeObserver(resize);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [resize]);

  useEffect(() => {
    const reportHistory = () => onHistoryChange?.({ canUndo: historyIndex.current > 0, canRedo: historyIndex.current < history.current.length - 1 });
    const restore = (value: string | null) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const finish = (isEmpty: boolean) => {
        empty.current = isEmpty;
        onEmptyChange?.(isEmpty);
        const ratio = window.devicePixelRatio || 1;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = colorRef.current; ctx.lineWidth = 2.4;
      };
      if (!value) { finish(true); return; }
      const image = new Image();
      image.onload = () => { ctx.drawImage(image, 0, 0, canvas.width, canvas.height); finish(false); };
      image.src = value;
    };
    handleRef.current = {
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) {
          return;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
		empty.current = true;
		onEmptyChange?.(true);
		const ratio = window.devicePixelRatio || 1;
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.strokeStyle = colorRef.current;
		ctx.lineWidth = 2.4;
        history.current = history.current.slice(0, historyIndex.current + 1);
        history.current.push(null); historyIndex.current += 1; reportHistory();
      },
      toDataURL: () => {
        if (empty.current || !canvasRef.current) {
          return null;
        }
        return canvasRef.current.toDataURL("image/png");
      },
      undo: () => { if (historyIndex.current > 0) { historyIndex.current -= 1; restore(history.current[historyIndex.current]); reportHistory(); } },
      redo: () => { if (historyIndex.current < history.current.length - 1) { historyIndex.current += 1; restore(history.current[historyIndex.current]); reportHistory(); } },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, onEmptyChange, onHistoryChange, resize]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onPointerDown={(event) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx) {
          return;
        }
        canvas?.setPointerCapture(event.pointerId);
        drawing.current = true;
        ctx.strokeStyle = colorRef.current;
        const { x, y } = point(event);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y + 0.01);
        ctx.stroke();
        if (empty.current) { empty.current = false; onEmptyChange?.(false); }
      }}
      onPointerMove={(event) => {
        if (!drawing.current) {
          return;
        }
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) {
          return;
        }
        const { x, y } = point(event);
        const pressure = event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5;
        ctx.strokeStyle = colorRef.current;
        ctx.lineWidth = Math.max(1.5, 1.5 + pressure * 3.5);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (empty.current) {
          empty.current = false;
          onEmptyChange?.(false);
        }
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        const value = empty.current ? null : canvasRef.current?.toDataURL("image/png") ?? null;
        history.current = history.current.slice(0, historyIndex.current + 1);
        history.current.push(value); historyIndex.current += 1;
        onHistoryChange?.({ canUndo: true, canRedo: false });
      }}
      onPointerLeave={() => {
        drawing.current = false;
      }}
      onPointerCancel={() => { drawing.current = false; }}
      style={{ touchAction: "none" }}
    />
  );
}
