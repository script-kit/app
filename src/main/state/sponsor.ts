import { debounce } from 'lodash-es';
import type { kitStateType } from '../state';
import type Store from 'electron-store';
import type { AxiosInstance } from 'axios';
import type { EventEmitter } from 'events';
import type { KitEvent } from '../../shared/events';
import type { Trigger } from '../../shared/enums';
import os from 'node:os';

type OnlineDeps = {
  internetAvailable: () => Promise<boolean>;
  log: { info: (...a: any[]) => void };
};

export const makeOnline = ({ internetAvailable, log }: OnlineDeps) => {
  return async () => {
    log.info('Checking online status...');
    try {
      const result = await internetAvailable();
      log.info(`🗼 Status: ${result ? 'Online' : 'Offline'}`);
      return result;
    } catch (_e) {
      return false;
    }
  };
};

type SponsorDeps = {
  axios: AxiosInstance;
  kitState: kitStateType;
  kitStore: Store<any>;
  log: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
  emitter: EventEmitter;
  events: { KitEvent: typeof KitEvent };
  kitPath: (...parts: string[]) => string;
  Trigger: typeof Trigger;
  online: () => Promise<boolean>;
};

export const makeSponsorCheck = ({
  axios,
  kitState,
  kitStore,
  log,
  emitter,
  events,
  kitPath,
  Trigger,
  online,
}: SponsorDeps) =>
  debounce(
    async (feature: string, block = true) => {
      log.info(
        `Checking sponsor status... login: ${kitState?.user?.login} (current=${kitState.isSponsor ? '✅' : '❌'})`,
      );
      const isOnline = await online();
      // Local dev override
      if (process.env.KIT_SPONSOR === 'development' && os.userInfo().username === 'johnlindquist') {
        kitState.isSponsor = true;
        kitStore.set('sponsor', true);
        return true;
      }

      // If offline, fall back to last-known good; never auto‑elevate on failure
      if (!isOnline) {
        const cached = kitStore.get('sponsor');
        kitState.isSponsor = Boolean(cached);
        return kitState.isSponsor;
      }

      try {
        const response = await axios.post(
          `${kitState.url}/api/check-sponsor`,
          { ...kitState.user, feature },
          { timeout: 5000 },
        );

        const ok =
          response?.status === 200 &&
          response?.data &&
          kitState.user?.node_id &&
          response.data.id === kitState.user.node_id;

        kitState.isSponsor = Boolean(ok);
        kitStore.set('sponsor', kitState.isSponsor);

        if (kitState.isSponsor) return true;
      } catch (error) {
        log.warn('Sponsor check failed; falling back to cached status.', error);
        const cached = kitStore.get('sponsor');
        kitState.isSponsor = Boolean(cached);
        if (kitState.isSponsor) return true;
      }

      // Not a sponsor (by online check or cache). If blocking, show upsell.
      if (block) {
        log.error(`
-----------------------------------------------------------
🚨 User attempted to use: ${feature}, but is not a sponsor.
-----------------------------------------------------------
      `);
        emitter.emit(events.KitEvent.RunPromptProcess, {
          scriptPath: kitPath('pro', 'sponsor.js'),
          args: [feature],
          options: { force: true, trigger: Trigger.App, sponsorCheck: false },
        });
      }
      return false;
    },
    2500,
    { leading: true, trailing: false },
  );