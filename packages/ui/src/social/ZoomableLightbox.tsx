'use client';

// =====================================================================
// 🖼️ ZoomableLightbox — Visionneuse d'Images Apple-Grade (@qoe/ui)
// =====================================================================
// Fonctionnalités d'élite :
// 1. Double-tap / double-clic pour basculer le zoom (1x <-> 2.5x)
// 2. Zoom continu à la molette (1x à 4x) avec limitation de cadrage
// 3. Glisser-déplacer (Pan) fluide lorsque l'image est zoomée
// 4. Swipe-down physique pour fermer quand le zoom est à 1x
// 5. Alt-Text accessible, téléchargement HD, copie dans le presse-papier
// 6. Navigation au clavier (Échap, Flèches, +, -)
// =====================================================================

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';
import { t } from '@lingui/core/macro';
import { SafeImage } from '../SafeImage';

export interface LightboxImageItem {
  url: string;
  alt?: string | null;
  width?: number;
  height?: number;
}

export interface ZoomableLightboxProps {
  isOpen: boolean;
  images: LightboxImageItem[];
  initialIndex?: number;
  onClose: () => void;
}

export function ZoomableLightbox({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
}: ZoomableLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [showAlt, setShowAlt] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Swipe-to-dismiss motion values (actif uniquement à scale = 1)
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [-200, 0, 200], [0.4, 1, 0.4]);

  // Synchronisation de l'index à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setShowAlt(false);
      setIsCopied(false);
      dragY.set(0);
    }
  }, [isOpen, initialIndex, dragY]);

  // Réinitialiser le zoom au changement d'image
  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    dragY.set(0);
  }, [dragY]);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    resetZoom();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length, resetZoom]);

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    resetZoom();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length, resetZoom]);

  // Zoom Helpers
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(4, Number((prev + 0.5).toFixed(1))));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(1, Number((prev - 0.5).toFixed(1)));
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const toggleZoom = useCallback(() => {
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2.5);
    }
  }, [scale, resetZoom]);

  // Contrôles Clavier
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, zoomIn, zoomOut, resetZoom, onClose]);

  // Molette de souris pour zoomer
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))));
    } else {
      setScale((prev) => {
        const next = Math.max(1, Number((prev - 0.25).toFixed(2)));
        if (next === 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    }
  }, []);

  // Pan (glisser quand zoomé)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || scale <= 1) return;
    const maxPan = (scale - 1) * 350;
    const newX = Math.max(-maxPan, Math.min(maxPan, e.clientX - dragStart.current.x));
    const newY = Math.max(-maxPan, Math.min(maxPan, e.clientY - dragStart.current.y));
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0]!;

  const handleDownload = () => {
    if (!currentImage?.url) return;
    const link = document.createElement('a');
    link.href = currentImage.url;
    link.download = `qoe-image-${currentIndex + 1}.webp`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = async () => {
    if (!currentImage?.url) return;
    try {
      await navigator.clipboard.writeText(currentImage.url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignorer si permissions clipboard indisponibles
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ opacity: backdropOpacity }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-2xl font-sans select-none overflow-hidden"
        onClick={scale === 1 ? onClose : undefined}
      >
        {/* Barre de Contrôles Supérieure */}
        <div
          className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/85 via-black/40 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <span className="text-white/90 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
              {currentIndex + 1} / {images.length}
            </span>
            {scale > 1 && (
              <span className="text-white/70 text-xs font-mono px-2 py-1 rounded-md bg-white/5 backdrop-blur-md">
                {Math.round(scale * 100)}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Boutons de Zoom */}
            <div className="hidden sm:flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/10">
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= 1}
                className="p-1.5 rounded-full text-white hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                title={t`Dézoomer (-)`}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="px-2 py-1 text-xs font-medium text-white/80 hover:text-white transition-colors cursor-pointer"
                title={t`Taille normale (0)`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 4}
                className="p-1.5 rounded-full text-white hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                title={t`Zoomer (+)`}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Alt-Text */}
            {currentImage?.alt && (
              <button
                type="button"
                onClick={() => setShowAlt((prev) => !prev)}
                className={`p-2.5 rounded-full transition-all cursor-pointer border border-white/10 ${
                  showAlt
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title="Afficher la description de l'image"
              >
                <Info className="w-4 h-4" />
              </button>
            )}

            {/* Copier URL */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors cursor-pointer"
              title={t`Copier le lien de l'image`}
            >
              {isCopied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Télécharger HD */}
            <button
              type="button"
              onClick={handleDownload}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors cursor-pointer"
              title={t`Télécharger l'image HD`}
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fermer */}
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/10 transition-colors cursor-pointer ml-1"
              title={t`Fermer (Échap)`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Flèche Gauche */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-4 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all transform hover:scale-105 cursor-pointer backdrop-blur-md"
            title={t`Image précédente (Flèche gauche)`}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Conteneur d'Affichage & d'Interaction */}
        <div
          className="relative w-full h-full flex items-center justify-center p-4 cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={toggleZoom}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            style={{
              x: position.x,
              y: scale === 1 ? dragY : position.y,
              scale,
            }}
            drag={scale === 1 ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.8}
            onDragEnd={(_, info) => {
              if (
                scale === 1 &&
                (Math.abs(info.offset.y) > 120 || Math.abs(info.velocity.y) > 400)
              ) {
                onClose();
              }
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative max-w-[92vw] max-h-[85vh] flex items-center justify-center"
          >
            <SafeImage
              src={currentImage.url}
              alt={currentImage.alt || t`Aperçu média qoe.fi`}
              width={currentImage.width || 1920}
              height={currentImage.height || 1080}
              unoptimized
              className="max-w-full max-h-[82vh] w-auto h-auto object-contain rounded-xl shadow-2xl pointer-events-none"
            />
          </motion.div>

          {/* Panneau Alt-Text Déroulant */}
          <AnimatePresence>
            {showAlt && currentImage.alt && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-16 left-6 right-6 sm:left-auto sm:right-6 sm:max-w-md p-4 rounded-2xl bg-black/85 text-white/90 text-sm leading-relaxed border border-white/15 backdrop-blur-xl max-h-48 overflow-y-auto shadow-2xl z-20"
              >
                <div className="font-semibold text-primary mb-1 flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> {t`Description de l’image`}
                </div>
                <p className="text-white/80">{currentImage.alt}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Flèche Droite */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-4 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all transform hover:scale-105 cursor-pointer backdrop-blur-md"
            title={t`Image suivante (Flèche droite)`}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Barre de Vignettes / Indicateurs Inférieurs */}
        {images.length > 1 && (
          <div
            className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2 p-2 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  resetZoom();
                  setCurrentIndex(idx);
                }}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentIndex ? 'w-7 bg-primary' : 'w-2 bg-white/30 hover:bg-white/60'
                }`}
                title={`Aller à l'image ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// =====================================================================
// 🌐 Contexte Global de Lightbox pour utilisation en 1 ligne dans toute l'app
// =====================================================================

interface LightboxContextValue {
  openLightbox: (images: (string | LightboxImageItem)[], initialIndex?: number) => void;
  closeLightbox: () => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<LightboxImageItem[]>([]);
  const [initialIndex, setInitialIndex] = useState(0);

  const openLightbox = useCallback((inputImages: (string | LightboxImageItem)[], index = 0) => {
    const normalized = inputImages.map((item) => (typeof item === 'string' ? { url: item } : item));
    setImages(normalized);
    setInitialIndex(index);
    setIsOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <LightboxContext.Provider value={{ openLightbox, closeLightbox }}>
      {children}
      <ZoomableLightbox
        isOpen={isOpen}
        images={images}
        initialIndex={initialIndex}
        onClose={closeLightbox}
      />
    </LightboxContext.Provider>
  );
}

export function useZoomableLightbox() {
  const ctx = useContext(LightboxContext);
  if (!ctx) {
    throw new Error('useZoomableLightbox must be used within a LightboxProvider');
  }
  return ctx;
}
