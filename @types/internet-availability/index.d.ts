declare module 'internet-avaiable' {
  function internetAvailable({
    domainName,
  }: {
    domainName: string;
  }): Promise<boolean>;
  export default internetAvailable;
}

declare module 'windows-active-process' {
  function getActiveProcessName(): string;
}

declare module 'electron-active-window' {}
