import https from 'node:https';

interface DownloadOptions {
  /** Whether to reject unauthorized SSL certificates. Defaults to true. */
  rejectUnauthorized?: boolean;
}

/**
 * Downloads a file from a given URI and returns its contents as a Buffer.
 *
 * @param uri - The URI of the file to download.
 * @param opts - Optional configuration for the download.
 * @returns A Promise that resolves with the file contents as a Buffer.
 * @throws Will throw an error if the download fails or if the server responds with a non-200 status code.
 *
 * @example
 * ```typescript
 * const fileBuffer = await download('https://example.com/file.pdf');
 * console.log(`Downloaded file size: ${fileBuffer.length} bytes`);
 * ```
 */
const download = (uri: string, opts: DownloadOptions = {}): Promise<Buffer> => {
  const options: https.RequestOptions = {
    ...opts,
    headers: {
      'User-Agent': 'Node.js',
    },
  };

  return new Promise((resolve, reject) => {
    https
      .get(uri, options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP error! status: ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
};

export default download;
