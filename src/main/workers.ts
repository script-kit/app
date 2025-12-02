import { Worker } from 'node:worker_threads';
import { KIT_WORKER } from '@johnlindquist/kit/workers';
import { workers } from './state';

export const getKitWorker = () => {
  if (!workers.kit) {
    workers.kit = new Worker(KIT_WORKER);
  }
  return workers.kit;
};
