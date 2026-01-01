import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
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
}: SelectionCardProps) {
  return (
    <motion.button
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
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
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
      
      {/* Image */}
      {variant === 'image' && image && (
        <div className="w-full aspect-square rounded-lg mb-3 overflow-hidden">
          <img src={image} alt={name} className="w-full h-full object-cover" />
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
