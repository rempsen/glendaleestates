import { useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download, Move, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UnitInfo } from '@/lib/unitData';

interface FloorPlanViewerProps {
  unitInfo: UnitInfo;
}

export function FloorPlanViewer({ unitInfo }: FloorPlanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

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
              }
              img {
                max-width: 100%;
                max-height: calc(100vh - 120px);
                object-fit: contain;
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
              }
            </style>
          </head>
          <body>
            <h1>Unit ${unitInfo.unitNumber} - ${unitInfo.unitType}</h1>
            <p class="hint">Keep this window open for reference while making your selections</p>
            <img src="${unitInfo.floorPlanUrl}" alt="Floor Plan for Unit ${unitInfo.unitNumber}" />
          </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Open in New Window Call-to-Action */}
      <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-t-xl">
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

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm">
            <Move className="w-4 h-4 mr-1" />
            Pan
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

      {/* Floor Plan Container */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-background rounded-b-xl cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
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
      </div>
    </div>
  );
}
