import { windowLog as log } from '../logs';

import { BrowserWindow } from 'electron';

export class WindowMonitor {
  private previousWindowIds: Set<number> = new Set();
  private pollingInterval = 1000; // Poll every 1 second

  constructor() {
    this.startPolling();
  }

  private startPolling(): void {
    setInterval(() => {
      const currentWindows = BrowserWindow.getAllWindows();
      const currentIds = new Set(currentWindows.map((win) => win.id));

      // Detect new windows
      const newWindows = currentWindows.filter((win) => !this.previousWindowIds.has(win.id));

      // Detect closed windows
      const closedWindowIds = [...this.previousWindowIds].filter((id) => !currentIds.has(id));

      // Log new windows
      if (newWindows.length > 0) {
        for (const win of newWindows) {
          log.info(`🪟➕ Window added: ID=${win.id}`);
          // Additional logic for new windows can be added here
        }
      }

      // Log closed windows
      if (closedWindowIds.length > 0) {
        for (const id of closedWindowIds) {
          log.info(`🪟➖Window destroyed: ID=${id}`);
          // Additional logic for closed windows can be added here
        }
      }

      // Update the stored window IDs
      if (newWindows.length > 0 || closedWindowIds.length > 0) {
        this.previousWindowIds = currentIds;
      }
    }, this.pollingInterval);
  }
}
