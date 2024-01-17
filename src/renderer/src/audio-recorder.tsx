/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-plusplus */
import React from 'react';
import { UI } from '@johnlindquist/kit/core/enum';

import { useAtomValue } from 'jotai';
import { placeholderAtom, previewEnabledAtom } from './jotai';
import { useAudioRecorder } from './audio-hooks';

export default function AudioRecorder() {
  const placeholder = useAtomValue(placeholderAtom);
  const hasPreview = useAtomValue(previewEnabledAtom);

  const { volume } = useAudioRecorder();

  return (
    <div id={UI.mic} className="flex min-h-full min-w-full flex-row">
      <div
        className={`w-full ${
          hasPreview ? `mt-16 p-2` : `justify-center p-8`
        } flex flex-col items-center text-text-base`}
      >
        <h1 className="text-center text-5xl">{placeholder || 'Recording'}</h1>
        {/* A circle that represents the recording state */}
        <div
          className="mt-4 h-4 w-4 rounded-full"
          style={{
            backgroundColor: `hsl(${volume * 2}, 100%, 50%, 1)`,
          }}
        />
      </div>
    </div>
  );
}
