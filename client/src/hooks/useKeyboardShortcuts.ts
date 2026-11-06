import { useEffect, useRef } from 'react';

export interface KeyboardShortcutHandlers {
  onTogglePlay?: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  onVolumeUp?: () => void;
  onVolumeDown?: () => void;
  onFocusSearch?: () => void;
  enabled?: boolean;
}

function isEditableElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  const tagName = element.tagName.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (element.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts({
  onTogglePlay,
  onNextTrack,
  onPreviousTrack,
  onVolumeUp,
  onVolumeDown,
  onFocusSearch,
  enabled = true,
}: KeyboardShortcutHandlers): void {
  const handlersRef = useRef({
    onTogglePlay,
    onNextTrack,
    onPreviousTrack,
    onVolumeUp,
    onVolumeDown,
    onFocusSearch,
  });

  handlersRef.current = {
    onTogglePlay,
    onNextTrack,
    onPreviousTrack,
    onVolumeUp,
    onVolumeDown,
    onFocusSearch,
  };

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 允许在输入框中按普通按键；但如果按了 Esc 或特定的组合键可选择性放行
      const isInput = isEditableElement(event.target);

      // Ctrl+F / Cmd+F 聚焦搜索框（即使在其他地方）
      if ((event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F')) {
        if (handlersRef.current.onFocusSearch) {
          event.preventDefault();
          handlersRef.current.onFocusSearch();
          return;
        }
      }

      if (isInput) return;

      // 单独按下 / 快捷聚焦搜索
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (handlersRef.current.onFocusSearch) {
          event.preventDefault();
          handlersRef.current.onFocusSearch();
          return;
        }
      }

      // 空格键：播放/暂停
      if (event.code === 'Space' || event.key === ' ') {
        if (handlersRef.current.onTogglePlay) {
          event.preventDefault();
          handlersRef.current.onTogglePlay();
          return;
        }
      }

      // 方向键右 / Ctrl+Right：下一曲
      if ((event.key === 'ArrowRight' && (event.ctrlKey || event.metaKey || event.altKey)) || event.key === 'MediaTrackNext') {
        if (handlersRef.current.onNextTrack) {
          event.preventDefault();
          handlersRef.current.onNextTrack();
          return;
        }
      }

      // 方向键左 / Ctrl+Left：上一曲
      if ((event.key === 'ArrowLeft' && (event.ctrlKey || event.metaKey || event.altKey)) || event.key === 'MediaTrackPrevious') {
        if (handlersRef.current.onPreviousTrack) {
          event.preventDefault();
          handlersRef.current.onPreviousTrack();
          return;
        }
      }

      // 方向键上 / Ctrl+Up：调大音量
      if ((event.key === 'ArrowUp' && (event.ctrlKey || event.altKey)) || event.key === 'AudioVolumeUp') {
        if (handlersRef.current.onVolumeUp) {
          event.preventDefault();
          handlersRef.current.onVolumeUp();
          return;
        }
      }

      // 方向键下 / Ctrl+Down：调小音量
      if ((event.key === 'ArrowDown' && (event.ctrlKey || event.altKey)) || event.key === 'AudioVolumeDown') {
        if (handlersRef.current.onVolumeDown) {
          event.preventDefault();
          handlersRef.current.onVolumeDown();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
