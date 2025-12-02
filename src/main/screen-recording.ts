import { desktopCapturer, dialog, ipcMain, screen, type BrowserWindow } from 'electron';
import { Channel } from '@johnlindquist/kit/core/enum';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpDownloadsDir } from '@johnlindquist/kit/core/utils';
import { ipcLog as log } from './logs';
import type { KitPrompt } from './prompt';
import { prompts } from './prompts';

interface ScreenArea {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId: number;
}

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  displayId: string;
}

/**
 * Get available screen sources for recording
 */
export const getScreenSources = async (): Promise<ScreenSource[]> => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 300, height: 200 },
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      displayId: source.display_id || '',
    }));
  } catch (error) {
    log.error('Failed to get screen sources:', error);
    return [];
  }
};

/**
 * Handle area selection for screen recording
 */
export const handleAreaSelection = async (prompt: KitPrompt, displayId: number): Promise<ScreenArea | null> => {
  try {
    // For now, we'll return the full screen bounds
    // Later we'll implement a proper area selection UI
    const display = screen.getAllDisplays().find((d) => d.id === displayId);

    if (!display) {
      log.error(`Display not found: ${displayId}`);
      return null;
    }

    const { x, y, width, height } = display.bounds;

    return {
      x,
      y,
      width,
      height,
      displayId,
    };
  } catch (error) {
    log.error('Failed to handle area selection:', error);
    return null;
  }
};

/**
 * Save screen recording to file
 */
export const saveScreenRecording = async (buffer: Buffer, filePath?: string): Promise<string> => {
  try {
    const defaultPath = path.join(tmpDownloadsDir, `screen-recording-${Date.now()}.webm`);
    const savePath = filePath || defaultPath;

    await writeFile(savePath, buffer);
    log.info(`Screen recording saved to: ${savePath}`);

    return savePath;
  } catch (error) {
    log.error('Failed to save screen recording:', error);
    throw error;
  }
};

/**
 * Check screen recording permissions (macOS specific)
 */
export const checkScreenRecordingPermission = async (): Promise<boolean> => {
  if (process.platform !== 'darwin') {
    return true;
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });

    return sources.length > 0;
  } catch (error) {
    log.error('Failed to check screen recording permission:', error);
    return false;
  }
};

// Store handler references for cleanup
const ipcHandlers: Map<string, any> = new Map();

/**
 * Unregister all screen recording IPC handlers
 */
export const unregisterScreenRecordingHandlers = () => {
  // Remove all handle() registrations
  for (const [channel, handler] of ipcHandlers) {
    ipcMain.removeHandler(channel);
  }
  ipcHandlers.clear();

  // Remove the on() listener
  ipcMain.removeAllListeners(Channel.SCREEN_RECORDING_STREAM);
  ipcMain.removeAllListeners(Channel.SCREEN_AREA_SELECTED);

  log.info('Screen recording IPC handlers unregistered');
};

/**
 * Register IPC handlers for screen recording
 */
export const registerScreenRecordingHandlers = () => {
  // Clean up any existing handlers first
  unregisterScreenRecordingHandlers();

  // Get available screen sources
  const getScreenSourcesHandler = async () => {
    log.info('Getting screen sources for recording');
    const sources = await getScreenSources();
    return sources;
  };
  ipcMain.handle(Channel.GET_SCREEN_SOURCES, getScreenSourcesHandler);
  ipcHandlers.set(Channel.GET_SCREEN_SOURCES, getScreenSourcesHandler);

  // Handle screen area selection
  ipcMain.handle(Channel.SCREEN_AREA_SELECTED, async (_event, { displayId, area }: { displayId: number; area?: ScreenArea }) => {
    log.info('Screen area selected:', { displayId, area });

    // If area is provided, use it directly
    if (area) {
      return area;
    }

    // Otherwise, get the full display bounds
    const display = screen.getAllDisplays().find((d) => d.id === displayId);
    if (!display) {
      throw new Error(`Display not found: ${displayId}`);
    }

    return {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      displayId,
    };
  });

  // Start screen recording
  ipcMain.handle(Channel.START_SCREEN_RECORDING, async (_event, { sourceId, area }: { sourceId: string; area: ScreenArea }) => {
    log.info('Starting screen recording:', { sourceId, area });

    // Check permissions first
    const hasPermission = await checkScreenRecordingPermission();
    if (!hasPermission) {
      throw new Error('Screen recording permission denied. Please grant permission in System Settings > Privacy & Security > Screen Recording.');
    }

    // Return the source ID and area for the renderer to use
    return {
      sourceId,
      area,
      success: true,
    };
  });

  // Stop screen recording and save the file
  ipcMain.handle(Channel.STOP_SCREEN_RECORDING, async (_event, { buffer, filePath }: { buffer: ArrayBuffer; filePath?: string }) => {
    log.info('Stopping screen recording');

    try {
      const videoBuffer = Buffer.from(buffer);
      const savedPath = await saveScreenRecording(videoBuffer, filePath);

      return {
        success: true,
        filePath: savedPath,
      };
    } catch (error) {
      log.error('Failed to stop screen recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save recording',
      };
    }
  });

  // Handle screen recording stream data (for progressive saving)
  ipcMain.on(Channel.SCREEN_RECORDING_STREAM, async (_event, { buffer, pid }: { buffer: ArrayBuffer; pid: number }) => {
    try {
      const prompt = prompts.get(pid);
      if (!prompt) {
        log.warn(`No prompt found for screen recording stream: ${pid}`);
        return;
      }

      // Convert ArrayBuffer to Buffer
      const videoBuffer = Buffer.from(buffer);

      // Send to child process if needed
      if (prompt.child?.connected) {
        prompt.child.send({
          channel: Channel.SCREEN_RECORDING_STREAM,
          pid,
          state: { buffer: videoBuffer },
        });
      }
    } catch (error) {
      log.error('Failed to handle screen recording stream:', error);
    }
  });

  // Handle pause recording
  ipcMain.handle(Channel.PAUSE_SCREEN_RECORDING, async (event) => {
    try {
      log.info('Pausing screen recording');
      return { success: true };
    } catch (error) {
      log.error('Failed to pause recording:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle resume recording
  ipcMain.handle(Channel.RESUME_SCREEN_RECORDING, async (event) => {
    try {
      log.info('Resuming screen recording');
      return { success: true };
    } catch (error) {
      log.error('Failed to resume recording:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle recording status request
  ipcMain.handle(Channel.SCREEN_RECORDING_STATUS, async (event) => {
    try {
      // Return current recording status
      return {
        success: true,
        status: 'idle', // or 'recording', 'paused', etc.
      };
    } catch (error) {
      log.error('Failed to get recording status:', error);
      return { success: false, error: error.message };
    }
  });

  // Also add a regular listener for SCREEN_AREA_SELECTED to broadcast to renderer
  ipcMain.on(Channel.SCREEN_AREA_SELECTED, (event, data) => {
    log.info('Broadcasting screen area selected:', data);
    // Broadcast to all windows if needed
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach(window => {
      if (window.webContents !== event.sender) {
        window.webContents.send(Channel.SCREEN_AREA_SELECTED, data);
      }
    });
  });

  log.info('Screen recording IPC handlers registered');
};