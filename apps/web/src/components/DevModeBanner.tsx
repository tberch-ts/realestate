import { useEffect, useState } from 'react';
import { getDevMode, setDevMode, toggleDevMode, onDevModeChange } from '../lib/devMode';

// Persistent banner shown at the top of the screen whenever dev mode is ON.
// Click to disable; or press Ctrl+Alt+D (consistent with TalkStud.io main framework).
// On localhost the default is ON, on re.talkstud.io the default is OFF.

export default function DevModeBanner() {
  const [on, setOn] = useState<boolean>(() => getDevMode());

  // Subscribe to dev-mode changes so banner updates wherever the toggle fires.
  useEffect(() => onDevModeChange(setOn), []);

  // Ctrl+Alt+D keyboard shortcut — global.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const next = toggleDevMode();
        setOn(next);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!on) return null;

  return (
    <div
      onClick={() => setDevMode(false)}
      className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-amber-50 text-xs px-3 py-1.5 flex items-center justify-center gap-3 cursor-pointer hover:bg-amber-500 shadow"
      title="Click to switch to LIVE mode — or press Ctrl+Alt+D"
    >
      <span className="font-bold tracking-wide">⚠ DEV MODE</span>
      <span>
        Test credentials. PostGrid letters will NOT be printed or mailed.
      </span>
      <span className="opacity-80">· Ctrl+Alt+D to toggle</span>
    </div>
  );
}
