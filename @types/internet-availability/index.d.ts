declare module 'internet-avaiable' {
  function internetAvailable({
    domainName,
  }: {
    domainName: string;
  }): Promise<boolean>;
  export default internetAvailable;
}
