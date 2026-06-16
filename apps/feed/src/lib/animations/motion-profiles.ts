import { Variants, Transition } from "framer-motion"

export const springTransition: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 25,
  mass: 0.8
}

export const fadeUpVariant: Variants = {
  hidden: { 
    opacity: 0, 
    y: 15 
  },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...springTransition,
      delay
    }
  })
}

export const dropdownVariant: Variants = {
  hidden: { 
    opacity: 0, 
    scale: 0.95,
    y: -5
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    y: 0,
    transition: springTransition
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -5,
    transition: {
      duration: 0.15
    }
  }
}

export const bentoHoverVariant = {
  initial: { scale: 1 },
  hover: { 
    scale: 1.015,
    transition: springTransition
  }
}
