import type { KitStatus, Status } from '@johnlindquist/kit/types/kitapp';
import { kitState } from '../../state';

class NotificationService {
  set(status: Status, message: string = ''): void {
    kitState.status = { status, message } as KitStatus;
  }

  setDefault(): void {
    this.set('default', '');
  }

  setBusy(message: string): void {
    this.set('busy', message);
  }

  setUpdate(message: string): void {
    this.set('update', message);
  }

  setSuccess(message: string): void {
    this.set('success', message);
  }

  setWarn(message: string): void {
    this.set('warn', message);
  }
}

export const notification = new NotificationService();
