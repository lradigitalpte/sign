import type { Variants } from "framer-motion";

export const dropzoneContainerVariants: Variants = {
  initial: { scale: 1 },
  animate: { scale: 1 },
  hover: { transition: { staggerChildren: 0.05 } },
};

export const dropzoneCardLeftVariants: Variants = {
  initial: { x: 40, y: -10, rotate: -14 },
  animate: { x: 40, y: -10, rotate: -14 },
  hover: { x: -32, y: -32, rotate: -24, transition: { type: "spring", stiffness: 280, damping: 20 } },
};

export const dropzoneCardRightVariants: Variants = {
  initial: { x: -40, y: -10, rotate: 14 },
  animate: { x: -40, y: -10, rotate: 14 },
  hover: { x: 32, y: -32, rotate: 24, transition: { type: "spring", stiffness: 280, damping: 20 } },
};

export const dropzoneCardCenterVariants: Variants = {
  initial: { x: 0, y: 0 },
  animate: { x: 0, y: 0 },
  hover: { x: 0, y: -25 },
};

export const dropzoneReadyContainerVariants: Variants = {
  initial: { scale: 1 },
  animate: { scale: 1, transition: { staggerChildren: 0.08 } },
};

export const dropzoneReadyCardVariants: Variants = {
  initial: { y: 12, opacity: 0.6 },
  animate: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 22 } },
};
