import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom } from 'jotai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { screenAreaAtom, screenSourceIdAtom, submitValueAtom } from './jotai';

interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function ScreenAreaSelector() {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<SelectionArea | null>(null);
  const [, setScreenArea] = useAtom(screenAreaAtom);
  const [sourceId] = useAtom(screenSourceIdAtom);
  const [, submit] = useAtom(submitValueAtom);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  // Handle mouse down to start selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    startPoint.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setIsSelecting(true);
    setSelection({
      startX: startPoint.current.x,
      startY: startPoint.current.y,
      endX: startPoint.current.x,
      endY: startPoint.current.y,
    });
  }, []);

  // Handle mouse move during selection
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !startPoint.current) return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setSelection({
      startX: startPoint.current.x,
      startY: startPoint.current.y,
      endX: currentX,
      endY: currentY,
    });
  }, [isSelecting]);

  // Handle mouse up to complete selection
  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !selection) return;

    setIsSelecting(false);

    // Calculate the normalized rectangle
    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);

    // Minimum area size check (at least 50x50 pixels)
    if (width < 50 || height < 50) {
      setSelection(null);
      return;
    }

    // Get screen dimensions
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;

    // Convert to screen coordinates
    const screenArea = {
      x: Math.round((x / window.innerWidth) * screenWidth),
      y: Math.round((y / window.innerHeight) * screenHeight),
      width: Math.round((width / window.innerWidth) * screenWidth),
      height: Math.round((height / window.innerHeight) * screenHeight),
    };

    // Store the selected area
    setScreenArea(screenArea);

    // Send the area selection to the main process
    window.electron.ipcRenderer.send(Channel.SCREEN_AREA_SELECTED, {
      area: screenArea,
      sourceId,
    });

    // Submit the area for recording
    submit(screenArea);
  }, [isSelecting, selection, setScreenArea, sourceId, submit]);

  // Handle escape key to cancel selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSelecting(false);
        setSelection(null);
        startPoint.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Calculate selection box dimensions
  const getSelectionStyle = () => {
    if (!selection) return {};

    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);

    return {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  };

  return (
    <div
      id={UI.screenRecorder}
      ref={overlayRef}
      className="fixed inset-0 cursor-crosshair"
      style={{
        background: 'rgba(0, 0, 0, 0.3)',
        zIndex: 9999,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Instructions */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg">
        <p className="text-sm">Click and drag to select an area to record</p>
        <p className="text-xs text-gray-400 mt-1">Press ESC to cancel</p>
      </div>

      {/* Selection box */}
      {selection && (
        <div
          className="absolute border-2 border-red-500 bg-transparent"
          style={{
            ...getSelectionStyle(),
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
          }}
        >
          {/* Show dimensions */}
          {!isSelecting && (
            <div className="absolute -top-8 left-0 bg-red-500 text-white px-2 py-1 rounded text-xs">
              {Math.abs(selection.endX - selection.startX)} × {Math.abs(selection.endY - selection.startY)}
            </div>
          )}

          {/* Corner handles for visual feedback */}
          <div className="absolute -top-1 -left-1 w-3 h-3 border-2 border-white bg-red-500" />
          <div className="absolute -top-1 -right-1 w-3 h-3 border-2 border-white bg-red-500" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-2 border-white bg-red-500" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-2 border-white bg-red-500" />
        </div>
      )}

      {/* Crosshair cursor indicator */}
      {isSelecting && (
        <div
          className="absolute w-px h-full bg-white/50 pointer-events-none"
          style={{ left: selection?.endX }}
        />
      )}
      {isSelecting && (
        <div
          className="absolute w-full h-px bg-white/50 pointer-events-none"
          style={{ top: selection?.endY }}
        />
      )}
    </div>
  );
}