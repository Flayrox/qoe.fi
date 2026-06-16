"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@qoe/utils"
import { fadeUpVariant, springTransition } from "@/lib/animations/motion-profiles"

interface AnimatedBentoCardProps {
  children: React.ReactNode
  className?: string
  delay?: number
  hoverEffect?: boolean
}

export function AnimatedBentoCard({
  children,
  className,
  delay = 0,
  hoverEffect = true,
}: AnimatedBentoCardProps) {
  return (
    <motion.div
      variants={fadeUpVariant}
      initial="hidden"
      animate="visible"
      custom={delay}
      whileHover={hoverEffect ? { scale: 1.015, transition: springTransition } : undefined}
      className={cn(
        "bg-white rounded-[32px] p-5 shadow-xs border border-neutral-100 overflow-hidden",
        className
      )}
    >
      {children}
    </motion.div>
  )
}
