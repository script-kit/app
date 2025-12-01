/**
 * Measurement Overlay Renderer
 * Handles the UI and interaction for the measurement tool
 */

const { ipcRenderer } = require('electron');

// Configuration from main process
let config = {
  options: {},
  displays: [],
  primaryDisplay: null,
  cursorPoint: null,
  cursorDisplay: null
};

// Debug logging helper
function debugLog(message, data = {}) {
  console.log(`[Measurement] ${message}`, JSON.stringify(data, null, 2));
}

// Selection state
let isSelecting = false;
let isDragging = false;
let startPoint = null;
let currentPoint = null;
let currentRect = null;

// UI Elements
const elements = {
  overlay: null,
  canvas: null,
  selection: null,
  dimensionLabel: null,
  coordinates: null,
  hint: null,
  crosshairH: null,
  crosshairV: null
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  debugLog('DOM loaded, initializing measurement overlay');
  initializeElements();
  setupEventListeners();
  setupIpcListeners();

  // Add platform class for platform-specific styles
  document.body.classList.add(`platform-${process.platform}`);
  debugLog('Initialization complete, waiting for config from main process');
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
  elements.overlay = document.getElementById('overlay');
  elements.canvas = document.getElementById('canvas');
  elements.selection = document.getElementById('selection');
  elements.dimensionLabel = document.getElementById('dimension-label');
  elements.coordinates = document.getElementById('coordinates');
  elements.hint = document.getElementById('hint');
  elements.crosshairH = document.getElementById('crosshair-h');
  elements.crosshairV = document.getElementById('crosshair-v');

  // Set canvas size to window size
  resizeCanvas();
}

/**
 * Resize canvas to match window dimensions
 */
function resizeCanvas() {
  elements.canvas.width = window.innerWidth;
  elements.canvas.height = window.innerHeight;
}

/**
 * Setup mouse and keyboard event listeners
 */
function setupEventListeners() {
  // Mouse events
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // Keyboard events
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  // Window resize
  window.addEventListener('resize', resizeCanvas);

  // Prevent context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Handle window blur - don't cancel, but log for debugging
  window.addEventListener('blur', () => {
    debugLog('Window lost focus');
  });

  // Handle window focus
  window.addEventListener('focus', () => {
    debugLog('Window gained focus');
  });
}

/**
 * Setup IPC listeners for communication with main process
 */
function setupIpcListeners() {
  debugLog('Setting up IPC listeners');

  // Receive initial configuration
  ipcRenderer.on('measure-init', (event, data) => {
    debugLog('Received measure-init from main process', {
      hasOptions: !!data.options,
      displayCount: data.displays?.length,
      cursorPoint: data.cursorPoint,
      cursorDisplayId: data.cursorDisplay?.id
    });

    config = {
      ...config,
      ...data
    };

    applyConfiguration();

    // Position crosshairs at cursor position if available
    if (config.cursorPoint && config.options.showCrosshair !== false) {
      positionCrosshairsAtCursor();
    }
  });
}

/**
 * Position crosshairs at the initial cursor position
 */
function positionCrosshairsAtCursor() {
  if (!config.cursorPoint) return;

  const clientX = config.cursorPoint.x - (window.screenX || window.screenLeft || 0);
  const clientY = config.cursorPoint.y - (window.screenY || window.screenTop || 0);

  debugLog('Positioning crosshairs at cursor', {
    cursorScreen: config.cursorPoint,
    clientPos: { x: clientX, y: clientY },
    windowScreen: { x: window.screenX, y: window.screenY }
  });

  elements.crosshairH.style.top = `${clientY}px`;
  elements.crosshairV.style.left = `${clientX}px`;
  elements.crosshairH.style.display = 'block';
  elements.crosshairV.style.display = 'block';

  // Also show coordinates at cursor
  updateCoordinatesDisplay(config.cursorPoint.x, config.cursorPoint.y);
}

/**
 * Apply configuration options to the UI
 */
function applyConfiguration() {
  const { options } = config;

  // Set colors
  if (options.color) {
    elements.selection.style.borderColor = options.color;
    elements.dimensionLabel.style.color = options.color;

    // Update crosshair colors
    const crosshairOpacity = 0.3;
    const rgb = hexToRgb(options.color);
    if (rgb) {
      const rgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${crosshairOpacity})`;
      elements.crosshairH.style.background = rgbaColor;
      elements.crosshairV.style.background = rgbaColor;
    }
  }

  // Set stroke width
  if (options.strokeWidth) {
    elements.selection.style.borderWidth = `${options.strokeWidth}px`;
  }

  // Set fill opacity
  if (options.fillOpacity) {
    const rgb = hexToRgb(options.color || '#00ff00');
    if (rgb) {
      elements.selection.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${options.fillOpacity})`;
    }
  }

  // Set font size
  if (options.fontSize) {
    elements.dimensionLabel.style.fontSize = `${options.fontSize}px`;
  }

  // Show hint if provided
  if (options.hint) {
    elements.hint.textContent = options.hint;
    elements.hint.style.display = 'block';

    // Hide hint after 3 seconds
    setTimeout(() => {
      elements.hint.style.display = 'none';
    }, 3000);
  }

  // Show crosshairs if enabled
  if (options.showCrosshair) {
    elements.crosshairH.style.display = 'block';
    elements.crosshairV.style.display = 'block';
  }
}

/**
 * Handle mouse down event - start selection
 */
function handleMouseDown(e) {
  if (e.button !== 0) return; // Only left click

  debugLog('Mouse down - starting selection', {
    screenX: e.screenX,
    screenY: e.screenY,
    clientX: e.clientX,
    clientY: e.clientY
  });

  // Enable mouse capture
  ipcRenderer.send('set-ignore-mouse-events', false);

  isSelecting = true;
  isDragging = true;

  startPoint = {
    x: e.screenX,
    y: e.screenY
  };

  currentPoint = { ...startPoint };

  // Hide crosshairs during selection
  if (config.options.showCrosshair) {
    elements.crosshairH.style.display = 'none';
    elements.crosshairV.style.display = 'none';
  }

  // Show selection rectangle
  updateSelection();
}

/**
 * Handle mouse move event
 */
function handleMouseMove(e) {
  // Update crosshair position
  if (config.options.showCrosshair && !isDragging) {
    elements.crosshairH.style.top = `${e.clientY}px`;
    elements.crosshairV.style.left = `${e.clientX}px`;
  }

  // Update coordinates display
  if (!isDragging) {
    updateCoordinatesDisplay(e.screenX, e.screenY);
  }

  // Update selection if dragging
  if (isDragging && startPoint) {
    currentPoint = {
      x: e.screenX,
      y: e.screenY
    };

    // Apply grid snapping if enabled
    if (config.options.gridSnap && config.options.gridSnap > 1) {
      currentPoint.x = Math.round(currentPoint.x / config.options.gridSnap) * config.options.gridSnap;
      currentPoint.y = Math.round(currentPoint.y / config.options.gridSnap) * config.options.gridSnap;
    }

    updateSelection();
  }
}

/**
 * Handle mouse up event - complete selection
 */
function handleMouseUp(e) {
  if (!isDragging) return;

  isDragging = false;

  // Calculate final rectangle
  const rect = calculateRectangle(startPoint, currentPoint);

  debugLog('Mouse up - selection complete', {
    rect,
    allowKeyboardAdjust: config.options.allowKeyboardAdjust
  });

  // Check if rectangle has meaningful size (minimum 1x1)
  if (rect.width >= 1 && rect.height >= 1) {
    currentRect = rect;

    // Allow keyboard adjustments if enabled
    if (config.options.allowKeyboardAdjust) {
      isSelecting = true;
      // Keep selection visible for adjustments
      elements.selection.style.display = 'block';
      debugLog('Waiting for Enter key to confirm or arrow keys to adjust');

      // Show a hint that Enter is needed to confirm
      if (elements.hint) {
        elements.hint.textContent = 'Press Enter to confirm, Arrow keys to adjust, Escape to cancel';
        elements.hint.style.display = 'block';
      }
    } else {
      // Complete immediately if keyboard adjust is disabled
      completeSelection();
    }
  } else {
    // Too small, cancel
    debugLog('Selection too small, cancelling', { rect });
    cancelSelection();
  }
}

/**
 * Handle keyboard events
 */
function handleKeyDown(e) {
  debugLog('KeyDown event received', {
    key: e.key,
    code: e.code,
    currentRect: !!currentRect,
    isSelecting: isSelecting
  });

  // Escape - cancel selection
  if (e.key === 'Escape') {
    debugLog('Escape pressed - cancelling');
    e.preventDefault();
    cancelSelection();
    return;
  }

  // Enter - confirm selection
  if (e.key === 'Enter' && currentRect) {
    debugLog('Enter pressed - completing selection');
    e.preventDefault();
    completeSelection();
    return;
  }

  // Arrow keys - adjust selection
  if (isSelecting && currentRect && config.options.allowKeyboardAdjust) {
    const step = e.shiftKey ? 10 : 1;
    let updated = false;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (e.altKey) {
          currentRect.width = Math.max(1, currentRect.width - step);
        } else {
          currentRect.x -= step;
        }
        updated = true;
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (e.altKey) {
          currentRect.width += step;
        } else {
          currentRect.x += step;
        }
        updated = true;
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (e.altKey) {
          currentRect.height = Math.max(1, currentRect.height - step);
        } else {
          currentRect.y -= step;
        }
        updated = true;
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (e.altKey) {
          currentRect.height += step;
        } else {
          currentRect.y += step;
        }
        updated = true;
        break;
    }

    if (updated) {
      updateSelectionFromRect(currentRect);
    }
  }

  // Copy dimensions to clipboard
  if (e.key === 'c' && (e.metaKey || e.ctrlKey) && currentRect) {
    e.preventDefault();
    copyToClipboard();
  }
}

function handleKeyUp(e) {
  // Placeholder for key up handling if needed
}

/**
 * Update selection rectangle display
 */
function updateSelection() {
  if (!startPoint || !currentPoint) return;

  const rect = calculateRectangle(startPoint, currentPoint);
  currentRect = rect;

  updateSelectionFromRect(rect);
}

/**
 * Update selection display from rectangle data
 */
function updateSelectionFromRect(rect) {
  // Convert screen coordinates to client coordinates
  const clientRect = screenToClient(rect);

  // Update selection rectangle
  elements.selection.style.left = `${clientRect.x}px`;
  elements.selection.style.top = `${clientRect.y}px`;
  elements.selection.style.width = `${clientRect.width}px`;
  elements.selection.style.height = `${clientRect.height}px`;
  elements.selection.style.display = 'block';

  // Update dimension label
  if (config.options.showDimensions) {
    elements.dimensionLabel.textContent = `${rect.width} × ${rect.height}`;

    // Position label - try to keep it visible
    const labelX = Math.min(clientRect.x + clientRect.width - 100, window.innerWidth - 120);
    const labelY = Math.max(clientRect.y - 30, 10);

    elements.dimensionLabel.style.left = `${labelX}px`;
    elements.dimensionLabel.style.top = `${labelY}px`;
    elements.dimensionLabel.style.display = 'block';
  }
}

/**
 * Calculate rectangle from two points
 */
function calculateRectangle(p1, p2) {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);

  return { x, y, width, height };
}

/**
 * Convert screen coordinates to client coordinates
 */
function screenToClient(rect) {
  // Get the screen position offset
  const screenX = window.screenX || window.screenLeft || 0;
  const screenY = window.screenY || window.screenTop || 0;

  return {
    x: rect.x - screenX,
    y: rect.y - screenY,
    width: rect.width,
    height: rect.height
  };
}

/**
 * Update coordinates display
 */
function updateCoordinatesDisplay(x, y) {
  if (!config.options.showCrosshair) return;

  elements.coordinates.textContent = `${x}, ${y}`;
  elements.coordinates.style.left = `${x - window.screenX + 10}px`;
  elements.coordinates.style.top = `${y - window.screenY + 10}px`;
  elements.coordinates.style.display = 'block';
}

/**
 * Complete the selection and send result
 */
function completeSelection() {
  if (!currentRect) {
    debugLog('completeSelection called but no currentRect');
    return;
  }

  const result = {
    x: currentRect.x,
    y: currentRect.y,
    width: currentRect.width,
    height: currentRect.height,
    right: currentRect.x + currentRect.width,
    bottom: currentRect.y + currentRect.height,
    centerX: currentRect.x + Math.floor(currentRect.width / 2),
    centerY: currentRect.y + Math.floor(currentRect.height / 2),
    area: currentRect.width * currentRect.height,
    displayId: getDisplayForPoint(currentRect.x, currentRect.y),
    scaleFactor: getScaleFactorForPoint(currentRect.x, currentRect.y),
    cancelled: false
  };

  debugLog('Completing selection, sending MEASURE_COMPLETE', result);
  console.log('[Measurement Renderer] Sending MEASURE_COMPLETE:', JSON.stringify(result));

  // Send result to main process using the channel string directly
  // The main process listens on Channel.MEASURE_COMPLETE which equals 'MEASURE_COMPLETE'
  ipcRenderer.send('MEASURE_COMPLETE', result);

  // Don't cleanup immediately - let the main process close the window
  // This prevents race conditions where the window closes before the IPC is processed
  debugLog('MEASURE_COMPLETE sent, waiting for main process to close window');
}

/**
 * Cancel the selection
 */
function cancelSelection() {
  debugLog('Cancelling selection, sending MEASURE_CANCELLED');
  console.log('[Measurement Renderer] Sending MEASURE_CANCELLED');
  ipcRenderer.send('MEASURE_CANCELLED');
  // Don't cleanup immediately - let the main process close the window
  debugLog('MEASURE_CANCELLED sent, waiting for main process to close window');
}

/**
 * Copy dimensions to clipboard
 */
function copyToClipboard() {
  if (!currentRect) return;

  let text = '';

  switch (config.options.clipboardFormat) {
    case 'css':
      text = `left: ${currentRect.x}px; top: ${currentRect.y}px; width: ${currentRect.width}px; height: ${currentRect.height}px;`;
      break;

    case 'json':
      text = JSON.stringify(currentRect, null, 2);
      break;

    case 'dimensions':
    default:
      text = `${currentRect.width} × ${currentRect.height}`;
      break;
  }

  navigator.clipboard.writeText(text).then(() => {
    // Show brief feedback
    const originalText = elements.dimensionLabel.textContent;
    elements.dimensionLabel.textContent = 'Copied!';
    setTimeout(() => {
      elements.dimensionLabel.textContent = originalText;
    }, 500);
  });
}

/**
 * Get display ID for a point
 */
function getDisplayForPoint(x, y) {
  for (const display of config.displays) {
    const { bounds } = display;
    if (x >= bounds.x && x < bounds.x + bounds.width &&
        y >= bounds.y && y < bounds.y + bounds.height) {
      return display.id;
    }
  }
  return config.primaryDisplay?.id;
}

/**
 * Get scale factor for a point
 */
function getScaleFactorForPoint(x, y) {
  for (const display of config.displays) {
    const { bounds } = display;
    if (x >= bounds.x && x < bounds.x + bounds.width &&
        y >= bounds.y && y < bounds.y + bounds.height) {
      return display.scaleFactor;
    }
  }
  return config.primaryDisplay?.scaleFactor || 1;
}

/**
 * Clean up and reset state
 */
function cleanup() {
  isSelecting = false;
  isDragging = false;
  startPoint = null;
  currentPoint = null;
  currentRect = null;

  // Hide UI elements
  elements.selection.style.display = 'none';
  elements.dimensionLabel.style.display = 'none';
  elements.coordinates.style.display = 'none';
  elements.hint.style.display = 'none';
  elements.crosshairH.style.display = 'none';
  elements.crosshairV.style.display = 'none';

  // Re-enable click-through
  ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}