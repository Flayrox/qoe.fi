"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { useThoughtThreadContext } from "./ThoughtThreadContext"

export function ThoughtThreadLightbox() {
  const { lightboxImage, setLightboxImage } = useThoughtThreadContext()

  if (!lightboxImage) return null

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-xl flex items-center justify-center p-4 cursor-zoom-out"
        onClick={() => setLightboxImage(null)}
      >
        <button
          onClick={() => setLightboxImage(null)}
          className="absolute top-4 right-4 p-2 rounded-full bg-card text-foreground border border-border/40 hover:scale-105 transition-transform cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <motion.img
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          src={lightboxImage}
          alt=""
          className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </AnimatePresence>
  )
}
