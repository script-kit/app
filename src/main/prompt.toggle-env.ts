import type { IPromptContext } from './prompt.types';

export function togglePromptEnvFlow(prompt: IPromptContext, envName: string) {
  prompt.logInfo(`Toggle prompt env: ${envName} to ${(require('./state').kitState as any).kenvEnv?.[envName]}`);
  const { kitState } = require('./state');
  if (process.env[envName]) {
    delete process.env[envName];
    delete kitState.kenvEnv?.[envName];
    prompt.window?.webContents.executeJavaScript(`
      if(!process) process = {};
      if(!process.env) process.env = {};
      if(process.env?.["${envName}"]) delete process.env["${envName}"]
    `);
  } else if (kitState.kenvEnv?.[envName]) {
    process.env[envName] = kitState.kenvEnv?.[envName] as any;
    prompt.window?.webContents.executeJavaScript(`
      if(!process) process = {};
      if(!process.env) process.env = {};
      process.env["${envName}"] = "${kitState.kenvEnv?.[envName]}"
    `);
  }
}
