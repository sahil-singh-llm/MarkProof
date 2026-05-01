import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';

import type { IpcChannelContract } from '@shared/ipc/contracts';

import { isAllowedRendererUrl } from '../windows';

type ContractReturn<TChannel extends keyof IpcChannelContract> = Awaited<
  ReturnType<IpcChannelContract[TChannel]>
>;

type SafeHandler<TChannel extends keyof IpcChannelContract> = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => ContractReturn<TChannel> | Promise<ContractReturn<TChannel>>;

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const senderFrameUrl = event.senderFrame?.url;

  if (senderFrameUrl && isAllowedRendererUrl(senderFrameUrl)) {
    return true;
  }

  const senderUrl = event.sender.getURL();

  return senderUrl.length > 0 && isAllowedRendererUrl(senderUrl);
}

export function registerSafeHandle<TChannel extends keyof IpcChannelContract>(
  channel: TChannel,
  handler: SafeHandler<TChannel>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!isTrustedSender(event)) {
        throw new Error('Forbidden IPC sender.');
      }

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
