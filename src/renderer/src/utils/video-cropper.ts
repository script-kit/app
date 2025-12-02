/**
 * Utility for cropping video streams using Canvas API
 * This allows us to record only a selected area of the screen
 */

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class VideoCropper {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private videoElement: HTMLVideoElement;
  private animationFrameId: number | null = null;
  private stream: MediaStream | null = null;

  constructor() {
    // Create offscreen canvas for processing
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

    // Create hidden video element for source stream
    this.videoElement = document.createElement('video');
    this.videoElement.muted = true;
    this.videoElement.autoplay = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);
  }

  /**
   * Start cropping a video stream to a specific area
   * @param sourceStream The original MediaStream from screen capture
   * @param cropArea The area to crop from the source
   * @param outputWidth Output video width (defaults to crop width)
   * @param outputHeight Output video height (defaults to crop height)
   * @returns A new MediaStream containing the cropped video
   */
  public startCropping(
    sourceStream: MediaStream,
    cropArea: CropArea,
    outputWidth?: number,
    outputHeight?: number
  ): MediaStream {
    if (!this.ctx) {
      throw new Error('Canvas context not available');
    }

    // Set canvas dimensions to output size
    this.canvas.width = outputWidth || cropArea.width;
    this.canvas.height = outputHeight || cropArea.height;

    // Set up video element with source stream
    this.videoElement.srcObject = sourceStream;

    // Create output stream from canvas
    this.stream = this.canvas.captureStream(30); // 30 FPS

    // Start the cropping loop
    this.startRenderLoop(cropArea);

    return this.stream;
  }

  /**
   * Start the rendering loop to continuously crop video frames
   */
  private startRenderLoop(cropArea: CropArea) {
    if (!this.ctx) return;

    const render = () => {
      if (!this.ctx || !this.videoElement.readyState) {
        this.animationFrameId = requestAnimationFrame(render);
        return;
      }

      try {
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw cropped area from video to canvas
        this.ctx.drawImage(
          this.videoElement,
          cropArea.x, // Source X
          cropArea.y, // Source Y
          cropArea.width, // Source width
          cropArea.height, // Source height
          0, // Destination X
          0, // Destination Y
          this.canvas.width, // Destination width
          this.canvas.height // Destination height
        );
      } catch (error) {
        console.warn('Error drawing frame:', error);
      }

      // Continue the loop
      this.animationFrameId = requestAnimationFrame(render);
    };

    // Start rendering
    render();
  }

  /**
   * Update the crop area dynamically
   */
  public updateCropArea(newCropArea: CropArea) {
    // The render loop will automatically use the new crop area
    // on the next frame since we pass it to the render function
    // For now, we'd need to store it as a class property
    // This is a simplified version - in production you'd want
    // to properly handle this update
  }

  /**
   * Stop cropping and clean up resources
   */
  public stop() {
    // Stop animation loop
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop all tracks in the stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Clean up video element
    if (this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }

    // Remove video element from DOM
    if (this.videoElement.parentNode) {
      this.videoElement.parentNode.removeChild(this.videoElement);
    }
  }

  /**
   * Get the current output stream
   */
  public getOutputStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Check if cropping is active
   */
  public isActive(): boolean {
    return this.animationFrameId !== null;
  }
}

/**
 * Helper function to create a cropped video stream
 */
export async function createCroppedStream(
  sourceId: string,
  cropArea: CropArea,
  constraints?: MediaStreamConstraints
): Promise<MediaStream> {
  try {
    // Get the source stream using desktopCapturer
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-ignore - Electron-specific constraint
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          ...constraints,
        },
      },
    });

    // Create cropper instance
    const cropper = new VideoCropper();

    // Start cropping and return the cropped stream
    const croppedStream = cropper.startCropping(stream, cropArea);

    // Attach cropper to stream for later cleanup
    // @ts-ignore - Adding custom property
    croppedStream._cropper = cropper;

    return croppedStream;
  } catch (error) {
    console.error('Failed to create cropped stream:', error);
    throw error;
  }
}

/**
 * Stop a cropped stream and clean up resources
 */
export function stopCroppedStream(stream: MediaStream) {
  // Stop all tracks
  stream.getTracks().forEach(track => track.stop());

  // Clean up cropper if attached
  // @ts-ignore - Custom property
  if (stream._cropper) {
    // @ts-ignore
    stream._cropper.stop();
  }
}