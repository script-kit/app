import { platform } from 'node:os';

export type AuthType =
  | 'accessibility'
  | 'bluetooth'
  | 'calendar'
  | 'camera'
  | 'contacts'
  | 'full-disk-access'
  | 'input-monitoring'
  | 'location'
  | 'microphone'
  | 'music-library'
  | 'photos-add-only'
  | 'photos-read-write'
  | 'reminders'
  | 'speech-recognition'
  | 'screen'

export type PermissionType =  'authorized' | 'denied' | 'restricted'

export type NodeMacPermissionsModuleShim = {
  askForAccessibilityAccess(): undefined
  askForCalendarAccess(accessType?: 'write-only' | 'full'): Promise<Omit<PermissionType, 'restricted'>>
  askForCameraAccess(): Promise<PermissionType>
  askForContactsAccess(): Promise<Omit<PermissionType, 'restricted'>>
  askForFoldersAccess(): Promise<Omit<PermissionType, 'restricted'>>
  askForFullDiskAccess(): undefined
  askForInputMonitoringAccess(accessType?: 'listen' | 'post'): Promise<Omit<PermissionType, 'restricted'>>
  askForMicrophoneAccess(): Promise<PermissionType>
  askForPhotosAccess(accessType?: 'add-only' | 'read-write'): Promise<PermissionType>
  askForRemindersAccess(): Promise<Omit<PermissionType, 'restricted'>>
  askForSpeechRecognitionAccess(): Promise<Omit<PermissionType, 'restricted'>>
  askForScreenCaptureAccess(openPreferences?: boolean): undefined
  getAuthStatus(authType: AuthType): PermissionType | 'not determined'
}

export const importNodeMacPermissionsOrShim = async (): Promise<NodeMacPermissionsModuleShim> => {
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
      askForInputMonitoringAccess:  err,
      askForMicrophoneAccess:  err,
      askForPhotosAccess:  err,
      askForRemindersAccess:  err,
      askForSpeechRecognitionAccess:  err,
      askForScreenCaptureAccess: err,
      getAuthStatus: err,
    }
  }

  // @ts-ignore Only importable on Mac
  return await import('node-mac-permissions')
}
