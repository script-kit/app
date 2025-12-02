import { UI } from '@johnlindquist/kit/core/enum';
import React, { useEffect, useState } from 'react';
import { useScreenRecorder } from './hooks/useScreenRecorder';
import ScreenAreaSelector from './screen-area-selector';

export default function ScreenRecorder() {
  const {
    isRecording,
    isPaused,
    recordingState,
    recordingDuration,
    availableSources,
    selectedSourceId,
    selectedArea,
    startAreaSelection,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    selectSource,
    refreshSources,
  } = useScreenRecorder({
    format: 'webm',
    quality: 0.9,
    frameRate: 30,
    enableAudio: true,
  });

  const [showSourceList, setShowSourceList] = useState(false);

  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  // Show area selector when in selection mode
  if (recordingState === 'selecting') {
    return <ScreenAreaSelector />;
  }

  return (
    <div id={UI.screenRecorder} className="flex flex-col h-full w-full bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Screen Recorder</h2>
        {isRecording && (
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-mono">{recordingDuration}</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        {/* Source Selection */}
        {!isRecording && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Screen</label>
            <div className="relative">
              <button
                onClick={() => setShowSourceList(!showSourceList)}
                className="w-full px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-left"
              >
                {selectedSourceId
                  ? availableSources.find(s => s.id === selectedSourceId)?.name || 'Select a screen'
                  : 'Select a screen'}
              </button>

              {showSourceList && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                  {availableSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => {
                        selectSource(source.id);
                        setShowSourceList(false);
                      }}
                      className="w-full px-4 py-3 hover:bg-gray-700 transition-colors text-left flex items-center space-x-3"
                    >
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        className="w-20 h-12 object-cover rounded"
                      />
                      <span className="text-sm">{source.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recording Area Info */}
        {selectedArea && !isRecording && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <h3 className="text-sm font-medium mb-2">Recording Area</h3>
            <div className="text-xs text-gray-400">
              <p>Position: {selectedArea.x}, {selectedArea.y}</p>
              <p>Size: {selectedArea.width} × {selectedArea.height}</p>
            </div>
            <button
              onClick={startAreaSelection}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Select different area
            </button>
          </div>
        )}

        {/* Recording Preview (placeholder) */}
        {isRecording && (
          <div className="mb-6">
            <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-2">🎬</div>
                <p className="text-sm text-gray-400">Recording in progress...</p>
                {selectedArea && (
                  <p className="text-xs text-gray-500 mt-2">
                    Area: {selectedArea.width} × {selectedArea.height}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!isRecording && !selectedArea && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">📹</div>
            <p className="text-gray-400 mb-4">
              Select a screen and choose an area to record
            </p>
            <button
              onClick={startAreaSelection}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Select Recording Area
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex justify-center space-x-4">
          {!isRecording && selectedArea && (
            <button
              onClick={startRecording}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="8" />
              </svg>
              <span>Start Recording</span>
            </button>
          )}

          {!isRecording && !selectedArea && (
            <button
              onClick={startAreaSelection}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span>Select Area</span>
            </button>
          )}

          {isRecording && !isPaused && (
            <>
              <button
                onClick={pauseRecording}
                className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Pause</span>
              </button>
              <button
                onClick={stopRecording}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <rect x="6" y="6" width="8" height="8" />
                </svg>
                <span>Stop</span>
              </button>
            </>
          )}

          {isRecording && isPaused && (
            <>
              <button
                onClick={resumeRecording}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                <span>Resume</span>
              </button>
              <button
                onClick={stopRecording}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <rect x="6" y="6" width="8" height="8" />
                </svg>
                <span>Stop</span>
              </button>
            </>
          )}
        </div>

        {/* Status Bar */}
        <div className="mt-4 text-center text-xs text-gray-500">
          {recordingState === 'idle' && 'Ready to record'}
          {recordingState === 'selecting' && 'Selecting area...'}
          {recordingState === 'recording' && 'Recording...'}
          {recordingState === 'paused' && 'Recording paused'}
        </div>
      </div>
    </div>
  );
}