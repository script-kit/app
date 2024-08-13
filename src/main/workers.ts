import { Worker } from "node:worker_threads";
import { workers } from "./state";

import { KIT_WORKER } from '@johnlindquist/kit/workers';

export const getKitWorker = () => {
  if (!workers.kit) {
    workers.kit = new Worker(KIT_WORKER);
  }
  return workers.kit;
};
