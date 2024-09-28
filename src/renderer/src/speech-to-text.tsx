/* eslint-disable react/no-unknown-property */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, { useState, useCallback, useRef, useEffect } from 'react';

export default function SpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [streamingTranscript, setStreamingTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const startRecognition = useCallback(() => {
    setIsListening(true);
    iframeRef.current?.contentWindow?.postMessage({ type: 'startRecognition' }, '*');
  }, []);

  const stopRecognition = useCallback(() => {
    setIsListening(false);
    iframeRef.current?.contentWindow?.postMessage({ type: 'stopRecognition' }, '*');
  }, []);

  const onClick = useCallback(() => {
    if (isListening) {
      stopRecognition();
    } else {
      startRecognition();
    }
  }, [isListening, startRecognition, stopRecognition]);

  useEffect(() => {
    function handleWindowMessage(event: MessageEvent) {
      if (event.data.type === 'streamingTranscript') {
        setStreamingTranscript(event.data.transcript);
      } else if (event.data.type === 'finalTranscript') {
        setFinalTranscript(event.data.transcript);
      }
    }

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []);

  const htmlString = `
    <html>
      <head>
        <script>
          window.addEventListener('DOMContentLoaded', () => {
            const recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onresult = (event) => {
              const transcript = Array.from(event.results)
                .map((result) => result[0])
                .map((result) => result.transcript)
                .join('');
              window.parent.postMessage({ type: 'streamingTranscript', transcript: transcript }, '*');

              if (event.results[event.results.length - 1].isFinal) {
                window.parent.postMessage({ type: 'finalTranscript', transcript: transcript }, '*');
              }
            };

            recognition.onerror = (error) => {
              console.error('Speech recognition error:', error);
            };

            window.addEventListener('message', (event) => {
              if (event.data.type === 'startRecognition') {
                recognition.start();
              } else if (event.data.type === 'stopRecognition') {
                recognition.stop();
              }
            });
          });
        </script>
      </head>
      <body>
      </body>
    </html>
  `;

  return (
    <div
      className={`${
        isListening ? 'bg-red-500' : 'bg-green-500'
      } h-full w-full flex flex-col justify-center items-center text-text-base text-xl cursor-pointer`}
      onClick={onClick}
    >
      <iframe
        ref={iframeRef}
        srcDoc={htmlString}
        style={{
          width: 0,
          height: 0,
          border: 'none',
          position: 'absolute',
          visibility: 'hidden',
        }}
        allow="microphone"
        // Fix "network error" in Chrome
        // https://stackoverflow.com/questions/4938346/cross-origin-requests-are-only-supported-for-http-error-when-loading-a-local

        title="speech-iframe"
      />
      <h2>{isListening ? 'Stop Listening' : 'Start Listening'}</h2>
      <div className="mt-4">
        <h3>Streaming Transcript:</h3>
        <h3>Streaming Transcript:</h3>
        <p>{streamingTranscript}</p>
        <h3>Final Transcript:</h3>
        <p>{finalTranscript}</p>
      </div>
    </div>
  );
}
