import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export function registerSafeHandle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error.';

      console.error(`[ipc] ${channel} failed:`, error);
      // Intentionally drop the original error: ipcMain.handle would propagate
      // the full stack (including absolute source paths) to the renderer.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(message);
    }
  });
}
