import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Check, ImageOff } from 'lucide-react';
import { motion } from 'framer-motion';

interface SelectionCardProps {
  id: string;
  name: string;
  description?: string;
  color?: string;
  image?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  variant?: 'color' | 'image' | 'text';
  priority?: boolean; // Preload high-priority images immediately
}

export function SelectionCard({
  id,
  name,
  description,
  color,
  image,
  selected,
  onSelect,
  variant = 'color',
  priority = false,
}: SelectionCardProps) {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLButtonElement>(null);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (priority || !image) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0.01 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority, image]);

  // Preload image when in view
  useEffect(() => {
    if (!isInView || !image || variant !== 'image') return;

    setImageState('loading');
    const img = new Image();
    img.src = image;
    
    img.onload = () => setImageState('loaded');
    img.onerror = () => setImageState('error');

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [isInView, image, variant]);

  return (
    <motion.button
      ref={containerRef}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(id)}
      className={cn(
        "relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200",
        selected 
          ? "border-primary bg-primary/5 shadow-lg" 
          : "border-border bg-card hover:border-primary/50 hover:shadow-md"
      )}
    >
      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center z-10">
          <Check className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      
      {/* Color swatch */}
      {variant === 'color' && color && (
        <div 
          className="w-full aspect-square rounded-lg mb-3 shadow-inner"
          style={{ backgroundColor: color }}
        />
      )}
      
      {/* Image with loading states */}
      {variant === 'image' && image && (
        <div className="w-full aspect-square rounded-lg mb-3 overflow-hidden relative bg-muted">
          {/* Loading skeleton */}
          {imageState === 'loading' && isInView && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          
          {/* Error state */}
          {imageState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 text-muted-foreground">
              <ImageOff className="w-8 h-8 mb-1" />
              <span className="text-xs">Image unavailable</span>
            </div>
          )}
          
          {/* Actual image */}
          {isInView && imageState !== 'error' && (
            <img 
              src={image} 
              alt={name} 
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              className={cn(
                "w-full h-full object-cover transition-opacity duration-300",
                imageState === 'loaded' ? 'opacity-100' : 'opacity-0'
              )}
            />
          )}
        </div>
      )}
      
      {/* Text content */}
      <div className="text-center">
        <p className={cn(
          "font-medium",
          selected ? "text-primary" : "text-foreground"
        )}>
          {name}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {description}
          </p>
        )}
      </div>
    </motion.button>
  );
}
