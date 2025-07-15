#!/usr/bin/env node
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

const MAX_RETRIES = 3;
const RETRY_DELAY = 60000; // 60 seconds

async function runBuild(attempt = 1): Promise<void> {
  console.log(`\n🔄 Build attempt ${attempt} of ${MAX_RETRIES}`);
  
  return new Promise((resolve, reject) => {
    // Set environment variables to help with download issues
    const env = {
      ...process.env,
      // Increase timeout for Electron downloads
      ELECTRON_GET_USE_PROXY: process.env.ELECTRON_GET_USE_PROXY || 'true',
      GLOBAL_AGENT_HTTPS_PROXY: process.env.HTTPS_PROXY || '',
      ELECTRON_DOWNLOAD_TIMEOUT: '180000', // 3 minutes
      // Use a different mirror if needed
      ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download/',
      // Disable certificate checking as a last resort (not recommended for production)
      // NODE_TLS_REJECT_UNAUTHORIZED: '0'
    };

    const buildProcess = spawn('pnpm', ['exec', 'kit', './build.ts', ...process.argv.slice(2)], {
      stdio: 'inherit',
      shell: true,
      env,
      cwd: process.cwd()
    });

    buildProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build process exited with code ${code}`));
      }
    });

    buildProcess.on('error', (err) => {
      reject(err);
    });
  });
}

async function buildWithRetry() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runBuild(attempt);
      console.log('✅ Build completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error(`❌ Build attempt ${attempt} failed:`, error);
      
      // Check if it's a 403 error
      const errorMessage = error.toString();
      const is403Error = errorMessage.includes('status code 403') || 
                         errorMessage.includes('cannot resolve') ||
                         errorMessage.includes('electron-v');
      
      if (is403Error && attempt < MAX_RETRIES) {
        console.log(`⏱️  Waiting ${RETRY_DELAY / 1000} seconds before retrying...`);
        await setTimeout(RETRY_DELAY);
      } else if (attempt === MAX_RETRIES) {
        console.error('❌ All build attempts failed. Exiting.');
        process.exit(1);
      } else {
        // If it's not a 403 error, don't retry
        console.error('❌ Build failed with non-retryable error. Exiting.');
        process.exit(1);
      }
    }
  }
}

// Run the build with retry logic
buildWithRetry().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});