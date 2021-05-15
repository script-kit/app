import { ChildProcess } from 'child_process';

export interface ChildInfo {
  scriptPath: string;
  child: ChildProcess;
  from: string;
  values: any[];
}

/* eslint-disable import/prefer-default-export */
export const processMap: Map<number, ChildInfo> = new Map();
