import { platform } from 'node:os';

export const importNodeMacPermissionsOrShim = async (): Promise<
  // @ts-ignore Only importable on Mac
  typeof import('node-mac-permissions')
> => {
  if (platform() !== 'darwin') {
    const err = () => {
      throw new Error('This module is only available on macOS');
    };

    return {
      askForAccessibilityAccess: err,
      askForCalendarAccess: err,
      askForCameraAccess: err,
      askForContactsAccess: err,
      askForFoldersAccess: err,
      askForFullDiskAccess: err,
      askForInputMonitoringAccess: err,
      askForMicrophoneAccess: err,
      askForPhotosAccess: err,
      askForRemindersAccess: err,
      askForSpeechRecognitionAccess: err,
      askForScreenCaptureAccess: err,
      getAuthStatus: err,
    };
  }

  // @ts-ignore Only importable on Mac
  return (await import('node-mac-permissions')).default;
};
