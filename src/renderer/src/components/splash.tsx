import { useAtom } from 'jotai';
import React from 'react';
import iconUrl from '../assets/icon.png';
import {
  appConfigAtom,
  runMainScriptAtom,
  splashBodyAtom,
  splashHeaderAtom,
  splashProgressAtom,
} from '../jotai';

// const questions = [
//   `What problem should Script Kit will solve for you?`,
//   `What's something you'ven want to write a script for?`,
//   `What's your idea of the perfect developer tool?`,
//   `What's stopped you from writing scripts in the past?`,
// ];

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-spin text-text-base text-opacity-75"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-50" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-100"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// Key features to highlight during installation
const features = [
  {
    icon: '⚡',
    title: 'Quick Scripts',
    description: 'TypeScript/JavaScript with top-level await'
  },
  {
    icon: '🎯',
    title: 'Rich Prompts',
    description: 'arg(), editor(), div() and more'
  },
  {
    icon: '🔧',
    title: 'System APIs',
    description: 'Clipboard, windows, notifications'
  },
  {
    icon: '🤖',
    title: 'AI Helpers',
    description: 'Built-in text generation tools'
  },
];

function Aside() {
  const [appConfig] = useAtom(appConfigAtom);
  const [body] = useAtom(splashBodyAtom);
  const [header] = useAtom(splashHeaderAtom);
  const [progress] = useAtom(splashProgressAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);

  // Links are now hardcoded in the nav section

  return (
    <aside className="col-span-3 flex h-full flex-col justify-between bg-bg-base/40 p-4 pt-8 shadow-inner">
      <div className="flex h-full flex-col items-center">
        <div className="relative">
          <img src={iconUrl} className="mb-2 w-20" alt="Script Kit Icon" />
          {progress !== 100 && (
            <div className="absolute -right-1 -top-1 rounded-full bg-bg-base bg-opacity-80 p-1.5 backdrop-blur-lg">
              <Spinner />
            </div>
          )}
        </div>
        <h1 className="mb-1 text-xl font-semibold">{progress === 100 ? 'Script Kit Ready' : 'Preparing Kit...'}</h1>
        <h3 className="mx-4 text-center text-xs font-normal leading-tight opacity-70">{header}</h3>
        <h3 className="max-h-8 overflow-hidden break-all px-4 text-center text-xxs font-normal leading-tight opacity-70">
          {body}
        </h3>
        {progress === 100 && (
          <div className="flex flex-col px-3 pt-3">
            <button
              className="rounded-md border border-text-base border-opacity-25 bg-primary bg-opacity-90 px-4 py-2 text-sm font-semibold text-bg-base shadow-md shadow-primary/25 transition-all duration-200 hover:bg-opacity-100 hover:shadow-primary/50"
              type="button"
              onClick={() => {
                runMainScript();
              }}
            >
              {appConfig?.isLinux ? (
                <>
                  <span>🚀 Launch with</span>
                  <div>
                    <kbd className="rounded-md border-secondary bg-primary bg-opacity-25 p-0.5 text-xs">~/.kit/kar</kbd>
                  </div>
                </>
              ) : (
                <>
                  Launch with{' '}
                  <span className="text-xs">
                    <kbd className="rounded-md bg-primary bg-opacity-25 p-0.5">{appConfig?.isMac ? 'CMD' : 'CTRL'}</kbd>
                    <kbd>+</kbd>
                    <kbd className="rounded-md bg-primary bg-opacity-25 p-0.5">;</kbd>
                    {!appConfig?.isWin && (
                      <p className="text-xs font-mono">
                        <hr className="my-1" />
                        Or invoke <kbd>~/.kit/kar</kbd>
                      </p>
                    )}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      <nav className="space-y-1.5 pb-3">
        <a
          href="https://github.com/johnlindquist/kit/discussions"
          className="flex w-full items-center justify-center rounded-md bg-text-base bg-opacity-5 p-1.5 text-xs font-normal text-text-base no-underline opacity-70 transition hover:bg-opacity-10 hover:opacity-100"
        >
          💬 Forum
        </a>
        <a
          href="https://www.scriptkit.com/scripts"
          className="flex w-full items-center justify-center rounded-md bg-text-base bg-opacity-5 p-1.5 text-xs font-normal text-text-base no-underline opacity-70 transition hover:bg-opacity-10 hover:opacity-100"
        >
          📦 Scripts
        </a>
        <a
          href="https://github.com/johnlindquist/kit/discussions/categories/docs"
          className="flex w-full items-center justify-center rounded-md bg-text-base bg-opacity-5 p-1.5 text-xs font-normal text-text-base no-underline opacity-70 transition hover:bg-opacity-10 hover:opacity-100"
        >
          📚 Docs
        </a>
      </nav>
      <small className="text-center text-xs opacity-40">{appConfig.version}</small>
    </aside>
  );
}

export default function Splash() {
  const [appConfig] = useAtom(appConfigAtom);
  const [progress] = useAtom(splashProgressAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);

  const shortcuts = [
    { keys: [appConfig?.isMac ? 'CMD' : 'CTRL', ';'], description: 'Main menu' },
    { keys: [appConfig?.isMac ? 'CMD' : 'CTRL', 'P'], description: 'New script' },
    { keys: [appConfig?.isMac ? 'CMD' : 'CTRL', 'K'], description: 'Actions' },
    { keys: [appConfig?.isMac ? 'CMD' : 'CTRL', 'E'], description: 'Examples' },
  ];

  return (
    <div key="splash" className="fixed left-0 top-0 grid h-screen w-screen grid-cols-8">
      <Aside />
      <main className="col-span-5 h-full w-full bg-bg-base/10 p-5">
        <div className="flex h-full flex-col justify-center">
          <div className="space-y-4">
            {/* Welcome Section */}
            <div className="mb-4">
              <h2 className="mb-2 text-2xl font-bold text-text-base">Welcome to Script Kit! 🚀</h2>
              <p className="text-sm text-text-base opacity-80">
                Create custom scripts and workflows quickly.
              </p>
            </div>

            {/* Features Grid - Compact */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, index) => (
                <div key={index} className="rounded-md border border-text-base border-opacity-10 bg-text-base bg-opacity-5 p-3">
                  <div className="mb-1 flex items-center space-x-2">
                    <span className="text-xl">{feature.icon}</span>
                    <h3 className="font-medium text-text-base text-sm">{feature.title}</h3>
                  </div>
                  <p className="text-xs text-text-base opacity-70 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>

            {/* Keyboard Shortcuts - Compact */}
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-text-base">Keyboard Shortcuts</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center space-x-1">
                    <div className="flex items-center">
                      {shortcut.keys.map((key, i) => (
                        <React.Fragment key={i}>
                          <kbd className="rounded bg-text-base bg-opacity-10 px-1.5 py-0.5 text-xs font-mono">{key}</kbd>
                          {i < shortcut.keys.length - 1 && <span className="mx-0.5 text-xs">+</span>}
                        </React.Fragment>
                      ))}
                    </div>
                    <span className="text-xs text-text-base opacity-70">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Community Links - Compact */}
            <div className="mt-4 border-t border-text-base border-opacity-10 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-text-base">Join Our Community</h3>
              <div className="flex space-x-3">
                <a
                  href="https://discord.gg/qnUX4XqJQd"
                  className="flex items-center space-x-1.5 rounded-md bg-[#5865F2] px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                  </svg>
                  <span className="font-medium">Discord</span>
                </a>
                <a
                  href="https://x.com/scriptkitapp"
                  className="flex items-center space-x-1.5 rounded-md bg-[#1DA1F2] px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  <span className="font-medium">Follow X</span>
                </a>
              </div>
            </div>

            {/* Progress indicator for installation */}
            {progress < 100 && (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-text-base opacity-70">Installing Kit SDK...</span>
                  <span className="text-xs font-mono text-text-base opacity-70">{progress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-text-base bg-opacity-10">
                  <div 
                    className="h-1.5 rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
