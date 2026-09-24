"use client";

import { motion, type Variants } from "framer-motion";
import { CheckCircle2, ImageUp, Plus, type LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import {
  dropzoneCardCenterVariants,
  dropzoneCardLeftVariants,
  dropzoneCardRightVariants,
  dropzoneContainerVariants,
  dropzoneReadyCardVariants,
  dropzoneReadyContainerVariants,
} from "@/lib/document-dropzone-variants";
import { cn } from "@/lib/utils";

const idleFloatVariants: Variants = {
  initial: { y: 0 },
  animate: {
    y: [0, -10, 0],
    transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
  },
  hover: { y: -28, transition: { type: "spring", stiffness: 300, damping: 22 } },
};

type AnimatedUploadZoneProps = {
  accept?: string;
  centerIcon?: LucideIcon;
  className?: string;
  description?: string;
  disabled?: boolean;
  readyDescription?: string;
  readyLabel?: string | null;
  label?: string;
  onFile: (file: File) => void;
};

export function AnimatedUploadZone({
  accept,
  centerIcon: CenterIcon = Plus,
  className,
  description,
  disabled = false,
  readyDescription,
  readyLabel,
  label = "Add a file",
  onFile,
}: AnimatedUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const ready = Boolean(readyLabel);

  const pick = (file: File | undefined) => {
    if (!file || disabled) {
      return;
    }
    onFile(file);
  };

  return (
    <motion.button
      type="button"
      disabled={disabled}
      variants={ready ? dropzoneReadyContainerVariants : dropzoneContainerVariants}
      initial="initial"
      animate="animate"
      whileHover={disabled ? undefined : "hover"}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        pick(event.dataTransfer.files[0]);
      }}
      className={cn(
        "group flex w-full cursor-pointer flex-col items-center rounded-3xl border bg-background/80 px-6 py-10 text-center shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        dragging ? "border-primary bg-primary/5 ring-4 ring-primary/10" : ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-border hover:border-primary/40",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div className="flex items-end justify-center">
        <motion.div
          variants={dropzoneCardLeftVariants}
          className={cn(
            "z-10 flex aspect-[3/4] w-20 origin-top-right flex-col gap-1 rounded-lg border bg-background/90 px-2 py-3 shadow-sm backdrop-blur-sm sm:w-24",
            ready ? "border-emerald-500/30" : "border-muted-foreground/20 group-hover:border-primary/50",
          )}
        >
          <CardLines ready={ready} />
        </motion.div>

        <motion.div
          variants={ready ? dropzoneReadyCardVariants : idleFloatVariants}
          className={cn(
            "z-20 flex aspect-[3/4] w-20 flex-col items-center justify-center rounded-lg border bg-background/95 px-2 py-3 shadow-md backdrop-blur-sm sm:w-24",
            ready ? "border-emerald-500/50" : "border-muted-foreground/20 group-hover:border-primary/50",
          )}
        >
          {ready ? (
            <CheckCircle2 className="size-10 text-emerald-600 sm:size-12" strokeWidth={1.8} />
          ) : (
            <CenterIcon className="size-10 text-muted-foreground/35 group-hover:text-primary sm:size-12" strokeWidth={1.8} />
          )}
        </motion.div>

        <motion.div
          variants={dropzoneCardRightVariants}
          className={cn(
            "z-10 flex aspect-[3/4] w-20 origin-top-left flex-col gap-1 rounded-lg border bg-background/90 px-2 py-3 shadow-sm backdrop-blur-sm sm:w-24",
            ready ? "border-emerald-500/30" : "border-muted-foreground/20 group-hover:border-primary/50",
          )}
        >
          <CardLines ready={ready} />
        </motion.div>
      </div>

      <p className="mt-6 text-base font-semibold text-foreground">{ready ? readyLabel : label}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {ready ? readyDescription ?? "Ready to continue." : description}
      </p>
    </motion.button>
  );
}

function CardLines({ ready }: { ready: boolean }) {
  return (
    <>
      <div className={cn("h-1.5 w-full rounded-[2px]", ready ? "bg-emerald-500/30" : "bg-muted-foreground/20 group-hover:bg-primary/40")} />
      <div className={cn("h-1.5 w-5/6 rounded-[2px]", ready ? "bg-emerald-500/30" : "bg-muted-foreground/20 group-hover:bg-primary/40")} />
      <div className={cn("h-1.5 w-full rounded-[2px]", ready ? "bg-emerald-500/30" : "bg-muted-foreground/20 group-hover:bg-primary/40")} />
    </>
  );
}

export function DocumentDropzone({
  accept = "application/pdf,.pdf",
  className,
  description = "Drag & drop your PDF here, or click to browse.",
  disabled = false,
  fileName,
  label = "Add a document",
  onFile,
}: {
  accept?: string;
  className?: string;
  description?: string;
  disabled?: boolean;
  fileName?: string | null;
  label?: string;
  onFile: (file: File) => void;
}) {
  return (
    <AnimatedUploadZone
      accept={accept}
      centerIcon={Plus}
      className={className}
      description={description}
      disabled={disabled}
      label={label}
      onFile={onFile}
      readyLabel={fileName}
      readyDescription="PDF ready — continue below to sign."
    />
  );
}

export function ImageUploadDropzone({
  accept = "image/png,image/jpeg",
  className,
  description = "Drag & drop your image here, or click to browse.",
  disabled = false,
  label = "Upload image",
  onFile,
}: {
  accept?: string;
  className?: string;
  description?: string;
  disabled?: boolean;
  label?: string;
  onFile: (file: File) => void;
}) {
  return (
    <AnimatedUploadZone
      accept={accept}
      centerIcon={ImageUp}
      className={className}
      description={description}
      disabled={disabled}
      label={label}
      onFile={onFile}
    />
  );
}

export function PreparingSignOverlay({ open, step }: { open: boolean; step: string }) {
  if (!open) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        className="w-full max-w-md rounded-3xl border bg-background p-8 text-center shadow-xl"
      >
        <FloatingSignCards />
        <p className="mt-6 text-lg font-semibold">Preparing your document</p>
        <motion.p
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-sm text-muted-foreground"
        >
          {step}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

function FloatingSignCards() {
  return (
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      className="mx-auto flex items-end justify-center gap-2"
    >
      <motion.div
        animate={{ rotate: [-18, -22, -18] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="h-24 w-16 rounded-lg border bg-muted/40"
      />
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="relative flex h-28 w-20 items-center justify-center rounded-lg border border-primary/30 bg-primary/5"
      >
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3], scaleX: [0.6, 1, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute bottom-5 left-3 h-0.5 w-10 rounded-full bg-primary"
        />
        <motion.svg
          viewBox="0 0 24 24"
          className="size-8 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <motion.path
            d="M12 20h9"
            animate={{ pathLength: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.path
            d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
            animate={{ pathLength: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.svg>
      </motion.div>
      <motion.div
        animate={{ rotate: [18, 22, 18] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="h-24 w-16 rounded-lg border bg-muted/40"
      />
    </motion.div>
  );
}
