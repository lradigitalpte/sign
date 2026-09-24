"use client";

import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState, type ReactNode } from "react";

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

type PdfPageProps = {
  src: string;
  page: number;
  width?: number;
  className?: string;
  onDocumentLoad?: (info: { pageCount: number }) => void;
  children?: ReactNode;
};

export function PdfPage({ src, page, width = 720, className, onDocumentLoad, children }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onLoadRef = useRef(onDocumentLoad);
  onLoadRef.current = onDocumentLoad;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState({ width, height: Math.round(width * 1.294) });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    const loadingTask = getDocument({ url: src, withCredentials: true });
    loadingTask.promise
      .then((loaded) => {
        if (cancelled) {
          void loaded.cleanup();
          return;
        }
        setPdf(loaded);
        onLoadRef.current?.({ pageCount: loaded.numPages });
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load PDF");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [src]);

  useEffect(() => {
    return () => {
      void pdf?.cleanup();
    };
  }, [pdf]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas) {
      return;
    }
    let cancelled = false;
    const pageNumber = Math.min(Math.max(1, page), pdf.numPages);
    void pdf
      .getPage(pageNumber)
      .then(async (pdfPage) => {
        if (cancelled) {
          return;
        }
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = width / base.width;
        const outputScale = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale: scale * outputScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${base.width * scale}px`;
        canvas.style.height = `${base.height * scale}px`;
        setSize({ width: base.width * scale, height: base.height * scale });
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas is unavailable");
        }
        await pdfPage.render({ canvasContext: context, canvas, viewport }).promise;
        if (!cancelled) {
          setLoading(false);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to render PDF");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, pdf, width]);

  return (
    <div className={className} style={{ width: size.width }}>
      <div className="relative overflow-hidden rounded-lg border bg-white shadow-xl" style={{ width: size.width, height: size.height }}>
        {loading ? <div className="absolute inset-0 animate-pulse bg-slate-100" /> : null}
        {error ? <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-destructive">{error}</div> : null}
        <canvas ref={canvasRef} className="block" />
        <div className="absolute inset-0">{children}</div>
      </div>
    </div>
  );
}

export function PdfPager({
  page,
  pageCount,
  onChange,
  className,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const total = Math.max(1, pageCount);
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border bg-background/95 px-2 py-1 text-xs shadow-xs backdrop-blur ${className ?? ""}`}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))} className="grid size-6 place-items-center rounded-full hover:bg-muted disabled:opacity-40">
        ‹
      </button>
      <span className="min-w-20 text-center font-medium tabular-nums">
        {page} / {total}
      </span>
      <button type="button" disabled={page >= total} onClick={() => onChange(Math.min(total, page + 1))} className="grid size-6 place-items-center rounded-full hover:bg-muted disabled:opacity-40">
        ›
      </button>
    </div>
  );
}
