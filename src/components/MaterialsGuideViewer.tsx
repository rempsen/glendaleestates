import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen, Maximize2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Import all guide pages
import page1 from '@/assets/guide/page_1.jpg';
import page2 from '@/assets/guide/page_2.jpg';
import page3 from '@/assets/guide/page_3.jpg';
import page4 from '@/assets/guide/page_4.jpg';
import page5 from '@/assets/guide/page_5.jpg';
import page6 from '@/assets/guide/page_6.jpg';
import page7 from '@/assets/guide/page_7.jpg';
import page8 from '@/assets/guide/page_8.jpg';
import page9 from '@/assets/guide/page_9.jpg';
import page10 from '@/assets/guide/page_10.jpg';
import page11 from '@/assets/guide/page_11.jpg';
import page12 from '@/assets/guide/page_12.jpg';
import page13 from '@/assets/guide/page_13.jpg';
import page14 from '@/assets/guide/page_14.jpg';
import page15 from '@/assets/guide/page_15.jpg';
import page16 from '@/assets/guide/page_16.jpg';

const slides = [
  { src: page1, title: 'Cover' },
  { src: page2, title: 'Project Overview' },
  { src: page3, title: 'Flooring Overview' },
  { src: page4, title: 'XL Flooring Specs' },
  { src: page5, title: 'XL Flooring Features' },
  { src: page6, title: 'Ceratec Dante Specs' },
  { src: page7, title: 'Ceratec Dante Features' },
  { src: page8, title: 'Carpet Specifications' },
  { src: page9, title: 'Carpet Features' },
  { src: page10, title: 'Window Treatments' },
  { src: page11, title: 'UltraLite System' },
  { src: page12, title: 'Upgrades' },
  { src: page13, title: 'Material Comparison' },
  { src: page14, title: 'Value Proposition' },
  { src: page15, title: 'Selection Process' },
  { src: page16, title: 'Contact Info' },
];

// Lazy loading image component for thumbnails
function LazyThumbnail({ 
  src, 
  alt, 
  isActive, 
  onClick 
}: { 
  src: string; 
  alt: string; 
  isActive: boolean; 
  onClick: () => void;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px', threshold: 0.01 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={imgRef}
      onClick={onClick}
      className={cn(
        'flex-shrink-0 w-20 h-12 rounded-md overflow-hidden border-2 transition-all relative',
        isActive 
          ? 'border-primary ring-2 ring-primary/20' 
          : 'border-transparent opacity-60 hover:opacity-100'
      )}
      aria-label={`Go to slide: ${alt}`}
    >
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-200',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}
    </button>
  );
}

export default function MaterialsGuideViewer() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState(0);

  const goToPrevious = useCallback(() => {
    setDirection(-1);
    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setDirection(1);
    setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  }, []);

  const goToSlide = useCallback((index: number) => {
    setDirection(index > currentSlide ? 1 : -1);
    setCurrentSlide(index);
  }, [currentSlide]);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const SlideContent = ({ fullscreen = false }: { fullscreen?: boolean }) => (
    <div className={`relative ${fullscreen ? 'h-full' : 'aspect-[16/9]'} w-full overflow-hidden rounded-lg bg-muted`}>
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.img
          key={currentSlide}
          src={slides[currentSlide].src}
          alt={`Slide ${currentSlide + 1}: ${slides[currentSlide].title}`}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'tween', duration: 0.3 }}
          className={`absolute inset-0 w-full h-full ${fullscreen ? 'object-contain' : 'object-cover'}`}
          draggable={false}
        />
      </AnimatePresence>

      {/* Navigation Arrows */}
      <button
        onClick={goToPrevious}
        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-5 h-5 text-foreground" />
      </button>

      <button
        onClick={goToNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
        aria-label="Next slide"
      >
        <ChevronRight className="w-5 h-5 text-foreground" />
      </button>

      {/* Slide Counter */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-background/80 text-sm font-medium text-foreground shadow-lg">
        {currentSlide + 1} / {slides.length}
      </div>

      {/* Fullscreen Toggle */}
      {!fullscreen && (
        <button
          onClick={() => setIsFullscreen(true)}
          className="absolute top-3 right-3 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="View fullscreen"
        >
          <Maximize2 className="w-4 h-4 text-foreground" />
        </button>
      )}
    </div>
  );

  return (
    <section className="py-12 md:py-14">
      <div className="container max-w-5xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <h2 className="font-serif text-2xl md:text-4xl font-semibold text-foreground">
              Materials Guide
            </h2>
          </div>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Browse our comprehensive guide to understand the premium materials included in your home
          </p>
        </motion.div>

        {/* Carousel Viewer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="relative rounded-2xl border border-border bg-card shadow-lg overflow-hidden"
        >
          <SlideContent />
        </motion.div>

        {/* Thumbnail Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-thin"
        >
          {slides.map((slide, index) => (
            <LazyThumbnail
              key={index}
              src={slide.src}
              alt={slide.title}
              isActive={index === currentSlide}
              onClick={() => goToSlide(index)}
            />
          ))}
        </motion.div>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-4 bg-background/95 backdrop-blur-sm">
          <DialogClose className="absolute top-4 right-4 z-50 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-all hover:scale-110">
            <X className="w-5 h-5 text-foreground" />
          </DialogClose>
          <div className="w-full h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <SlideContent fullscreen />
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2 justify-center">
              {slides.map((slide, index) => (
                <LazyThumbnail
                  key={index}
                  src={slide.src}
                  alt={slide.title}
                  isActive={index === currentSlide}
                  onClick={() => goToSlide(index)}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
