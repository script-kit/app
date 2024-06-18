import { UI } from '@johnlindquist/kit/core/enum';

import { useAtomValue } from 'jotai';
import { useAudioRecorder } from './audio-hooks';
import { micStateAtom, placeholderAtom, previewEnabledAtom } from './jotai';

export default function AudioRecorder() {
  const placeholder = useAtomValue(placeholderAtom);
  const hasPreview = useAtomValue(previewEnabledAtom);
  const micState = useAtomValue(micStateAtom);

  const { volume } = useAudioRecorder();

  return (
    <div id={UI.mic} className="flex min-h-full min-w-full flex-row">
      <div
        className={`w-full ${
          hasPreview ? 'mt-16 p-2' : 'justify-center p-8'
        } flex flex-col items-center text-text-base`}
      >
        <h1 className="text-center text-5xl">
          {micState === 'recording'
            ? placeholder || 'Recording'
            : micState === 'idle'
              ? 'Preparing Mic...'
              : micState === 'stopped'
                ? 'Mic Stopped'
                : ''}
        </h1>
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
