/**
 * Utility to handle large image responses in MCP by chunking them
 * to avoid stack overflow issues in JSON.stringify
 */

export interface ChunkedImageContent {
  type: 'image';
  data?: string;
  mimeType?: string;
  // For chunked images
  isChunked?: boolean;
  chunkIndex?: number;
  totalChunks?: number;
  chunkData?: string;
  originalLength?: number;
}

const CHUNK_SIZE = 500 * 1024; // 500KB chunks to be safe

/**
 * Check if content needs chunking
 */
export function needsChunking(content: any[]): boolean {
  if (!Array.isArray(content)) return false;

  for (const item of content) {
    if (item.type === 'image' && item.data && typeof item.data === 'string') {
      if (item.data.length > CHUNK_SIZE) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Process content to chunk large images
 */
export function chunkLargeImages(content: any[]): any[] {
  const result: any[] = [];

  for (const item of content) {
    if (item.type === 'image' && item.data && typeof item.data === 'string' && item.data.length > CHUNK_SIZE) {
      // Split large image into chunks
      const data = item.data;
      const totalChunks = Math.ceil(data.length / CHUNK_SIZE);

      // Add a marker for the chunked image
      result.push({
        type: 'image',
        isChunked: true,
        totalChunks,
        originalLength: data.length,
        mimeType: item.mimeType || 'image/png',
      });

      // Add individual chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);

        result.push({
          type: 'image-chunk',
          chunkIndex: i,
          totalChunks,
          chunkData: data.slice(start, end),
        });
      }
    } else {
      // Keep non-image or small image items as-is
      result.push(item);
    }
  }

  return result;
}

/**
 * Reconstruct chunked images on the client side
 */
export function reconstructChunkedImages(content: any[]): any[] {
  const result: any[] = [];
  const chunks = new Map<number, string[]>();
  let currentChunkedImage: any = null;

  for (const item of content) {
    if (item.type === 'image' && item.isChunked) {
      currentChunkedImage = item;
      chunks.set(item.totalChunks, []);
    } else if (item.type === 'image-chunk' && currentChunkedImage) {
      const chunkArray = chunks.get(item.totalChunks);
      if (chunkArray) {
        chunkArray[item.chunkIndex] = item.chunkData;

        // Check if we have all chunks
        if (chunkArray.filter(Boolean).length === item.totalChunks) {
          // Reconstruct the image
          result.push({
            type: 'image',
            data: chunkArray.join(''),
            mimeType: currentChunkedImage.mimeType,
          });

          // Reset
          chunks.delete(item.totalChunks);
          currentChunkedImage = null;
        }
      }
    } else {
      result.push(item);
    }
  }

  return result;
}
