"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PenLine } from "lucide-react";
import type { ReactNode } from "react";

import { signatureFontById } from "@/lib/signature-fonts";
import { CHECKERBOARD_CLASS } from "@/lib/signature-maker";
import { cn } from "@/lib/utils";

const letterVariants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: index * 0.035, duration: 0.28, ease: "easeOut" as const },
  }),
};

type TypedSignaturePreviewProps = {
  className?: string;
  fontId: string;
  ink: string;
  placeholder: string;
  size?: "signature" | "initials";
  text: string;
};

export function TypedSignaturePreview({ className, fontId, ink, placeholder, size = "signature", text }: TypedSignaturePreviewProps) {
  const display = text.trim() || placeholder;
  const chars = [...display];
  const fontClass = signatureFontById(fontId).font.className;

  return (
    <motion.div
      layout
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-2xl border-2 p-6",
        size === "signature" ? "min-h-48" : "min-h-40",
        CHECKERBOARD_CLASS,
        className,
      )}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{
        opacity: 1,
        scale: 1,
        borderColor: "rgba(59, 130, 246, 0.2)",
      }}
      whileHover={{ borderColor: "rgba(59, 130, 246, 0.45)", scale: 1.005 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.03] to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      />
      <motion.p
        key={`${fontId}-${display}`}
        className={cn("relative text-center leading-tight", size === "signature" ? "text-5xl" : "text-6xl", fontClass)}
        animate={{ color: ink }}
        transition={{ duration: 0.25 }}
      >
        {chars.map((char, index) => (
          <motion.span
            key={`${fontId}-${index}-${char}`}
            custom={index}
            variants={letterVariants}
            initial="hidden"
            animate="visible"
            className="inline-block"
          >
            {char === " " ? "\u00A0" : char}
          </motion.span>
        ))}
      </motion.p>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute bottom-8 left-1/2 h-0.5 w-0 rounded-full bg-primary/40"
        initial={{ width: 0, x: "-50%", opacity: 0 }}
        animate={{ width: Math.min(display.length * (size === "signature" ? 18 : 22), 280), x: "-50%", opacity: 0.55 }}
        transition={{ delay: chars.length * 0.035 + 0.1, duration: 0.45, ease: "easeOut" }}
      />
    </motion.div>
  );
}

type DrawSignatureCanvasProps = {
  children: ReactNode;
  className?: string;
  empty: boolean;
  hint?: string;
  showBaseline?: boolean;
  tall?: boolean;
};

export function DrawSignatureCanvas({
  children,
  className,
  empty,
  hint = "Draw your signature here",
  showBaseline = true,
  tall = true,
}: DrawSignatureCanvasProps) {
  return (
    <motion.div
      layout
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 shadow-inner",
        tall ? "min-h-64" : "min-h-40",
        CHECKERBOARD_CLASS,
        className,
      )}
      animate={{
        borderColor: empty ? "rgba(59, 130, 246, 0.25)" : "rgba(59, 130, 246, 0.55)",
        boxShadow: empty ? "inset 0 0 0 0 rgba(59, 130, 246, 0)" : "inset 0 0 32px rgba(59, 130, 246, 0.06)",
      }}
      transition={{ duration: 0.3 }}
    >
      {showBaseline ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 bottom-14 origin-left border-b border-dashed border-slate-400/70"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 0.75 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}

      <AnimatePresence>
        {empty ? (
          <motion.div
            key="draw-hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                animate={{ rotate: [-8, 8, -8] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="rounded-2xl border border-primary/20 bg-background/80 p-4 shadow-sm backdrop-blur-sm"
              >
                <PenLine className="size-9 text-primary/45" strokeWidth={1.6} />
              </motion.div>
              <motion.p
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="mt-3 text-sm font-medium text-muted-foreground"
              >
                {hint}
              </motion.p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {children}
    </motion.div>
  );
}

export function AnimatedInkSwatch({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative size-8 rounded-full border-2"
      style={{ background: color }}
      animate={{
        borderColor: active ? "rgb(59, 130, 246)" : "transparent",
        scale: active ? 1.08 : 1,
      }}
      whileHover={{ scale: active ? 1.1 : 1.06 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
    >
      {active ? (
        <motion.span
          layoutId="ink-ring"
          className="absolute -inset-1 rounded-full ring-2 ring-primary/30"
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
        />
      ) : null}
    </motion.button>
  );
}
