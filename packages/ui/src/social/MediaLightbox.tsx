"use client"

import React, { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronLeft, ChevronRight, Download, Info } from "lucide-react"

export interface MediaLightboxImage {
  url: string
  alt?: string | null
}

export interface MediaLightboxProps {
  isOpen: boolean
  images: MediaLightboxImage[]
  initialIndex?: number
  onClose: () => void
}

export function MediaLightbox({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
}: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [showAlt, setShowAlt] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex)
      setShowAlt(false)
    }
  }, [isOpen, initialIndex])

  const handleNext = useCallback(() => {
    if (images.length <= 1) return
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }, [images.length])

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowRight") {
        handleNext()
      } else if (e.key === "ArrowLeft") {
        handlePrev()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleNext, handlePrev, onClose])

  if (!isOpen || images.length === 0) return null

  const currentImage = images[currentIndex] || images[0]

  const handleDownload = () => {
    if (!currentImage?.url) return
    const link = document.createElement("a")
    link.href = currentImage.url
    link.download = `qoe-media-${currentIndex + 1}.jpg`
    link.target = "_blank"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl font-sans select-none"
        onClick={onClose}
      >
        {/* Top Controls Bar */}
        <div
          className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-white/80 text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md">
            {currentIndex + 1} / {images.length}
          </div>

          <div className="flex items-center gap-2">
            {currentImage?.alt && (
              <button
                type="button"
                onClick={() => setShowAlt((prev) => !prev)}
                className={`p-2.5 rounded-full transition-all cursor-pointer ${
                  showAlt ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20 text-white"
                }`}
                title="Afficher la description (Alt-Text)"
              >
                <Info className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Télécharger l'image"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Fermer (Échap)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Previous Arrow */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePrev()
            }}
            className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all transform hover:scale-105 cursor-pointer backdrop-blur-md"
            title="Image précédente (Flèche gauche)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Main Image View */}
        <div
          className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <motion.img
            key={currentImage.url}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            src={currentImage.url}
            alt={currentImage.alt || "Aperçu média qoe.fi"}
            className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
          />

          {/* Alt-Text Overlay */}
          {showAlt && currentImage.alt && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-4 left-4 right-4 p-4 rounded-xl bg-black/85 text-white/90 text-xs leading-relaxed border border-white/10 backdrop-blur-md max-h-32 overflow-y-auto"
            >
              <span className="font-bold text-primary mr-1">ALT :</span>
              {currentImage.alt}
            </motion.div>
          )}
        </div>

        {/* Next Arrow */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleNext()
            }}
            className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all transform hover:scale-105 cursor-pointer backdrop-blur-md"
            title="Image suivante (Flèche droite)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Thumbnail Dots Bar */}
        {images.length > 1 && (
          <div
            className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2 p-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentIndex ? "w-6 bg-primary" : "w-2 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
