import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Layers } from 'lucide-react';
import {
  ROOM_VISUAL_DISPLAY_ORDER,
  ROOM_VISUAL_MODE_META,
  type RoomVisualMode,
} from '../lib/roomVisualPreset';

interface Props {
  value: RoomVisualMode;
  onChange: (mode: RoomVisualMode) => void;
}

export default function RoomVisualPresetSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [open]);

  const select = (mode: RoomVisualMode) => {
    onChange(mode);
    setOpen(false);
  };

  const headerBtnClass =
    'flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card';

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="视觉预设"
        className={headerBtnClass}
      >
        <Layers className="h-4 w-4 flex-shrink-0" />
        <span className="hidden whitespace-nowrap sm:inline">{ROOM_VISUAL_MODE_META[value].name}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="视觉预设"
          className="absolute right-0 top-full z-50 mt-1 max-h-[min(70vh,420px)] min-w-[9.5rem] overflow-y-auto rounded-xl border border-white/10 bg-netease-card py-1 shadow-2xl animate-fade-in"
        >
          {ROOM_VISUAL_DISPLAY_ORDER.map((mode) => (
            <button
              key={mode}
              type="button"
              role="option"
              aria-selected={value === mode}
              onClick={() => select(mode)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-netease-muted transition-colors hover:bg-netease-card hover:text-white"
            >
              <Check className={`h-3.5 w-3.5 flex-shrink-0 ${value === mode ? 'opacity-100' : 'opacity-0'}`} />
              <span>{ROOM_VISUAL_MODE_META[mode].name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
