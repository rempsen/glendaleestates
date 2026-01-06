import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCcw, Download, Move, MousePointer, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UnitInfo } from '@/lib/unitData';

export interface Annotation {
  id: string;
  x: number; // Percentage position 0-100
  y: number; // Percentage position 0-100
  label: string;
  color: string;
}

interface FloorPlanViewerProps {
  unitInfo: UnitInfo;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
}

const ANNOTATION_COLORS = [
  { id: 'lvp', label: 'LVP Flooring', color: 'hsl(var(--primary))' },
  { id: 'tile', label: 'Bathroom Tile', color: 'hsl(200, 80%, 50%)' },
  { id: 'carpet', label: 'Carpet', color: 'hsl(280, 60%, 50%)' },
  { id: 'backsplash', label: 'Backsplash', color: 'hsl(30, 80%, 50%)' },
];

export function FloorPlanViewer({ unitInfo, annotations, onAnnotationsChange }: FloorPlanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'pan' | 'annotate'>('pan');
  const [selectedAnnotationType, setSelectedAnnotationType] = useState(ANNOTATION_COLORS[0]);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode === 'pan') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [mode, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && mode === 'pan') {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, mode, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (mode === 'annotate' && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      
      const newAnnotation: Annotation = {
        id: `${Date.now()}`,
        x,
        y,
        label: selectedAnnotationType.label,
        color: selectedAnnotationType.color,
      };
      
      onAnnotationsChange([...annotations, newAnnotation]);
    }
  }, [mode, selectedAnnotationType, annotations, onAnnotationsChange]);

  const handleDeleteAnnotation = (id: string) => {
    onAnnotationsChange(annotations.filter(a => a.id !== id));
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode('pan');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-t-xl border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            variant={mode === 'pan' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('pan')}
          >
            <Move className="w-4 h-4 mr-1" />
            Pan
          </Button>
          <Button
            variant={mode === 'annotate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('annotate')}
          >
            <Pencil className="w-4 h-4 mr-1" />
            Annotate
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="outline" size="icon" onClick={handleZoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" asChild>
            <a href={unitInfo.pdfPlanUrl} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Annotation Type Selector - only show in annotate mode */}
      {mode === 'annotate' && (
        <div className="flex items-center gap-2 p-3 bg-muted/30 border-b border-border">
          <span className="text-sm text-muted-foreground">Mark:</span>
          {ANNOTATION_COLORS.map((type) => (
            <Button
              key={type.id}
              variant={selectedAnnotationType.id === type.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedAnnotationType(type)}
              className="gap-2"
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: type.color }}
              />
              {type.label}
            </Button>
          ))}
        </div>
      )}

      {/* Floor Plan Container */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-background rounded-b-xl cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: mode === 'annotate' ? 'crosshair' : isDragging ? 'grabbing' : 'grab' }}
      >
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <img
            ref={imageRef}
            src={unitInfo.floorPlanUrl}
            alt={`Floor plan for Unit ${unitInfo.unitNumber} - ${unitInfo.unitType}`}
            className="max-w-full max-h-full object-contain"
            onLoad={() => setImageLoaded(true)}
            onClick={handleClick}
            draggable={false}
          />
          
          {/* Annotations */}
          {imageLoaded && annotations.map((annotation) => (
            <div
              key={annotation.id}
              className="absolute group"
              style={{
                left: `${annotation.x}%`,
                top: `${annotation.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="relative"
              >
                <div
                  className="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
                  style={{ backgroundColor: annotation.color }}
                >
                  <MousePointer className="w-3 h-3 text-white" />
                </div>
                <div className="absolute left-8 top-1/2 -translate-y-1/2 whitespace-nowrap bg-card border border-border rounded-lg px-2 py-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                  <span className="text-xs font-medium">{annotation.label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAnnotation(annotation.id);
                    }}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            </div>
          ))}
        </div>

        {/* Loading state */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        )}
      </div>

      {/* Annotations List */}
      {annotations.length > 0 && (
        <div className="p-3 bg-muted/30 border-t border-border">
          <div className="flex flex-wrap gap-2">
            {annotations.map((annotation) => (
              <Badge
                key={annotation.id}
                variant="secondary"
                className="gap-2 cursor-pointer hover:bg-destructive/10"
                onClick={() => handleDeleteAnnotation(annotation.id)}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: annotation.color }}
                />
                {annotation.label}
                <Trash2 className="w-3 h-3 opacity-50" />
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
