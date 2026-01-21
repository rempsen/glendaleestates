import { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download, Move, ExternalLink, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UnitInfo } from '@/lib/unitData';
import { useIsMobile } from '@/hooks/use-mobile';

interface FloorPlanViewerProps {
  unitInfo: UnitInfo;
}

export function FloorPlanViewer({ unitInfo }: FloorPlanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isMobile = useIsMobile();
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Touch gesture state
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [lastTouchCenter, setLastTouchCenter] = useState<{ x: number; y: number } | null>(null);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleOpenInNewWindow = () => {
    const newWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Floor Plan - Unit ${unitInfo.unitNumber} (${unitInfo.unitType})</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes">
            <style>
              body {
                margin: 0;
                padding: 20px;
                background: #1a1a2e;
                display: flex;
                flex-direction: column;
                align-items: center;
                min-height: 100vh;
                font-family: system-ui, -apple-system, sans-serif;
              }
              h1 {
                color: #fff;
                margin-bottom: 16px;
                font-size: 1.5rem;
              }
              .hint {
                color: #888;
                font-size: 0.875rem;
                margin-bottom: 20px;
                text-align: center;
              }
              img {
                max-width: 100%;
                max-height: calc(100vh - 120px);
                object-fit: contain;
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                touch-action: pinch-zoom;
              }
            </style>
          </head>
          <body>
            <h1>Unit ${unitInfo.unitNumber} - ${unitInfo.unitType}</h1>
            <p class="hint">Pinch to zoom • Keep this window open for reference</p>
            <img src="${unitInfo.floorPlanUrl}" alt="Floor Plan for Unit ${unitInfo.unitNumber}" />
          </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  // Toggle fullscreen mode on mobile
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      handleReset(); // Reset zoom when entering fullscreen
    }
  };

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position, isMobile]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMobile || !isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  }, [isDragging, dragStart, isMobile]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);

  // Touch handlers for pinch-to-zoom
  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches: React.TouchList): { x: number; y: number } => {
    if (touches.length < 2) {
      return { x: touches[0].clientX, y: touches[0].clientY };
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      setLastTouchDistance(getTouchDistance(e.touches));
      setLastTouchCenter(getTouchCenter(e.touches));
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ 
        x: e.touches[0].clientX - position.x, 
        y: e.touches[0].clientY - position.y 
      });
    }
  }, [position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance !== null) {
      e.preventDefault();
      const newDistance = getTouchDistance(e.touches);
      const newCenter = getTouchCenter(e.touches);
      
      // Calculate scale change
      const scaleChange = newDistance / lastTouchDistance;
      setScale(prev => Math.max(0.5, Math.min(3, prev * scaleChange)));
      
      // Update position for panning while pinching
      if (lastTouchCenter) {
        const dx = newCenter.x - lastTouchCenter.x;
        const dy = newCenter.y - lastTouchCenter.y;
        setPosition(prev => ({
          x: prev.x + dx,
          y: prev.y + dy,
        }));
      }
      
      setLastTouchDistance(newDistance);
      setLastTouchCenter(newCenter);
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // Only allow panning when zoomed in
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    }
  }, [lastTouchDistance, lastTouchCenter, isDragging, dragStart, scale]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    setLastTouchDistance(null);
    setLastTouchCenter(null);
  }, []);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  const viewerContent = (
    <>
      {/* Toolbar */}
      <div className={`flex items-center justify-between gap-2 p-3 md:p-4 bg-muted/50 border-b border-border ${isFullscreen ? 'absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm' : ''}`}>
        <div className="flex items-center gap-2">
          {isMobile ? (
            <Button variant="outline" size="sm" onClick={toggleFullscreen}>
              <Maximize2 className="w-4 h-4 mr-1" />
              {isFullscreen ? 'Exit' : 'Fullscreen'}
            </Button>
          ) : (
            <Button variant="default" size="sm">
              <Move className="w-4 h-4 mr-1" />
              Pan
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-1 md:gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomOut} className="h-8 w-8 md:h-9 md:w-9">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs md:text-sm font-medium min-w-[45px] md:min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="outline" size="icon" onClick={handleZoomIn} className="h-8 w-8 md:h-9 md:w-9">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleReset} className="h-8 w-8 md:h-9 md:w-9">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" asChild className="h-8 w-8 md:h-9 md:w-9 hidden sm:flex">
            <a href={unitInfo.pdfPlanUrl} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Floor Plan Container */}
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-hidden bg-background ${isFullscreen ? 'pt-14' : 'rounded-b-xl'} ${!isMobile ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          cursor: !isMobile ? (isDragging ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none', // Prevent browser handling of touch gestures
        }}
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
            draggable={false}
          />
        </div>

        {/* Loading state */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        )}

        {/* Mobile zoom hint */}
        {isMobile && !isFullscreen && imageLoaded && (
          <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <span className="inline-block px-3 py-1.5 text-xs bg-background/80 backdrop-blur-sm text-muted-foreground rounded-full border border-border">
              Pinch to zoom • Tap fullscreen for better view
            </span>
          </div>
        )}
      </div>
    </>
  );

  // Fullscreen overlay for mobile
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {viewerContent}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Open in New Window Call-to-Action - Hidden on mobile */}
      <div className="hidden md:flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-t-xl">
        <ExternalLink className="w-5 h-5 text-primary flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Want to reference your floor plan while making selections?
          </p>
          <p className="text-xs text-muted-foreground">
            Open in a separate window to keep it visible as you proceed
          </p>
        </div>
        <Button 
          variant="default" 
          size="sm" 
          onClick={handleOpenInNewWindow}
          className="flex-shrink-0"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open in New Window
        </Button>
      </div>

      {/* Mobile CTA */}
      <div className="flex md:hidden items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-t-xl">
        <Maximize2 className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-xs text-foreground flex-1">
          Tap <strong>Fullscreen</strong> for the best viewing experience
        </p>
      </div>

      {viewerContent}
    </div>
  );
}
