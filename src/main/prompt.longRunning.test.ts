import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Script } from '@johnlindquist/kit/types/core'

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    quit: vi.fn()
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn()
    }
  })),
  Notification: vi.fn().mockImplementation((options) => ({
    options,
    show: vi.fn(),
    on: vi.fn()
  }))
}))

// Mock other dependencies
vi.mock('./logs', () => ({
  mainLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('./state', () => ({
  kitState: {
    kenvEnv: {}
  }
}))

vi.mock('./process', () => ({
  processes: {
    removeByPid: vi.fn()
  }
}))

vi.mock('./kit', () => ({
  getMainScriptPath: vi.fn(() => '/main/script/path')
}))

describe('Prompt longRunning metadata', () => {
  let Prompt: any
  let mockNotification: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Import after mocks are set up
    const promptModule = await import('./prompt')
    Prompt = promptModule.Prompt
    
    const { Notification } = await import('electron')
    mockNotification = vi.mocked(Notification)
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should skip long-running monitor when script has longrunning: true', async () => {
    const prompt = new Prompt()
    
    // Set up script with longrunning: true
    const script: Partial<Script> = {
      filePath: '/test/script.js',
      name: 'Long Running Script',
      longrunning: true
    }
    
    prompt.script = script as Script
    prompt.scriptPath = script.filePath
    prompt.scriptName = script.name
    
    // Spy on the logging to verify the skip message
    const { mainLog } = await import('./logs')
    const logSpy = vi.mocked(mainLog.info)
    
    // Start the monitor
    prompt['startLongRunningMonitor']()
    
    // Verify it was skipped
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping long-running monitor')
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('longrunning metadata')
    )
    
    // Fast forward time to ensure no notification is shown
    vi.useFakeTimers()
    vi.advanceTimersByTime(40000) // 40 seconds
    
    // Verify no notification was created
    expect(mockNotification).not.toHaveBeenCalled()
    
    vi.useRealTimers()
  })

  it('should show notification for scripts without longrunning metadata', async () => {
    const prompt = new Prompt()
    
    // Set up script without longRunning
    const script: Partial<Script> = {
      filePath: '/test/normal-script.js',
      name: 'Normal Script'
    }
    
    prompt.script = script as Script
    prompt.scriptPath = script.filePath
    prompt.scriptName = script.name
    prompt.scriptStartTime = Date.now()
    
    // Mock bindToProcess to set up the prompt state
    prompt.boundToProcess = true
    prompt.pid = 1234
    
    // Start the monitor
    prompt['startLongRunningMonitor']()
    
    // Fast forward time to trigger notification
    vi.useFakeTimers()
    vi.advanceTimersByTime(35000) // 35 seconds (past 30s threshold)
    
    // Call the check manually since timer might not trigger in test
    prompt['checkLongRunning']()
    
    // Verify notification was created
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Long-Running Script',
        body: expect.stringContaining('Normal Script')
      })
    )
    
    vi.useRealTimers()
  })

  it('should handle Windows platform with toastXml', async () => {
    // Mock Windows platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    })
    
    const prompt = new Prompt()
    
    // Set up script
    const script: Partial<Script> = {
      filePath: '/test/script.js',
      name: 'Windows Script'
    }
    
    prompt.script = script as Script
    prompt.scriptPath = script.filePath
    prompt.scriptName = script.name
    prompt.scriptStartTime = Date.now() - 35000 // Already running for 35s
    prompt.boundToProcess = true
    prompt.pid = 5678
    
    // Trigger the check
    prompt['checkLongRunning']()
    
    // Verify Windows-specific toastXml was included
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        toastXml: expect.stringContaining('<toast>')
      })
    )
    
    const call = mockNotification.mock.calls[0][0]
    expect(call.toastXml).toContain('Long-Running Script')
    expect(call.toastXml).toContain('Windows Script')
    expect(call.toastXml).toContain('action content="Terminate Script"')
    expect(call.toastXml).toContain('action content="Keep Running"')
    
    // Reset platform
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    })
  })

  it('should respect custom threshold from environment', async () => {
    const { kitState } = await import('./state')
    
    // Set custom threshold to 60 seconds
    vi.mocked(kitState).kenvEnv = {
      KIT_LONG_RUNNING_THRESHOLD: '60'
    }
    
    const prompt = new Prompt()
    
    // Set up script
    const script: Partial<Script> = {
      filePath: '/test/script.js',
      name: 'Custom Threshold Script'
    }
    
    prompt.script = script as Script
    prompt.scriptPath = script.filePath
    prompt.scriptName = script.name
    prompt.scriptStartTime = Date.now()
    prompt.boundToProcess = true
    prompt.pid = 9999
    
    // Start the monitor
    prompt['startLongRunningMonitor']()
    
    // Fast forward 35 seconds (should not trigger with 60s threshold)
    vi.useFakeTimers()
    vi.advanceTimersByTime(35000)
    prompt['checkLongRunning']()
    
    // Should not show notification yet
    expect(mockNotification).not.toHaveBeenCalled()
    
    // Fast forward to 65 seconds total
    vi.advanceTimersByTime(30000)
    prompt['checkLongRunning']()
    
    // Now it should show
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Long-Running Script'
      })
    )
    
    vi.useRealTimers()
  })
})