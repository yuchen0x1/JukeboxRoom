import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Copy, Maximize, Minus, X } from 'lucide-react';

function getPageTitle(pathname: string) {
  if (window.jukeboxWindow) return '个人音乐';
  if (pathname.startsWith('/room/')) return `音乐房间 · ${pathname.split('/')[2] || ''}`;
  if (pathname.startsWith('/tv/')) return `房间展示 · ${pathname.split('/')[2] || ''}`;
  return '音乐大厅';
}

export default function DesktopTitleBar() {
  const location = useLocation();
  const controls = window.jukeboxWindow;
  const [maximized, setMaximized] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const openMenu = (x: number, y: number) => {
    const menuWidth = 196;
    const menuHeight = 132;
    setMenuPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      top: Math.max(42, Math.min(y, window.innerHeight - menuHeight - 8)),
    });
  };

  const closeMenu = (restoreFocus = false) => {
    setMenuPosition(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!controls) return;
    let active = true;
    void controls.isMaximized().then((value) => {
      if (active) setMaximized(value);
    });
    const unsubscribe = controls.onMaximizedChanged(setMaximized);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [controls]);

  useEffect(() => {
    if (!menuPosition) return;
    menuItemsRef.current[0]?.focus();
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) closeMenu();
    };
    window.addEventListener('pointerdown', dismissOutside);
    return () => window.removeEventListener('pointerdown', dismissOutside);
  }, [menuPosition]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    const current = menuItemsRef.current.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1 + menuItemsRef.current.length) % menuItemsRef.current.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + menuItemsRef.current.length) % menuItemsRef.current.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = menuItemsRef.current.length - 1;
    else if (event.key === 'Tab') {
      event.preventDefault();
      closeMenu(true);
      return;
    } else return;
    event.preventDefault();
    menuItemsRef.current[next]?.focus();
  };

  const invokeMenuAction = (action: () => void) => {
    closeMenu(true);
    action();
  };

  useEffect(() => {
    if (!controls) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.repeat || !event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'm') return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )) return;

      event.preventDefault();
      if (event.shiftKey) void controls?.toggleMaximize();
      else void controls?.minimize();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [controls]);

  if (!controls) return null;

  return (
    <header
      className="desktop-titlebar relative z-[100] flex h-10 flex-shrink-0 items-center border-b border-white/[0.07] bg-[#0b0f14] text-white"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('.desktop-window-button, [role="menu"]')) return;
        void controls.toggleMaximize();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="desktop-no-drag desktop-titlebar-brand flex h-full min-w-0 items-center gap-2.5 pl-3 pr-2 text-left"
        aria-haspopup="menu"
        aria-expanded={menuPosition !== null}
        aria-label="JukeboxRoom 窗口菜单"
        onClick={(event) => {
          if (menuPosition) closeMenu();
          else {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.left, rect.bottom);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
          openMenu(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu(rect.left, rect.bottom);
        }}
      >
        <img src="/icons/jukeboxroom-32.png" alt="" className="h-5 w-5 flex-shrink-0 rounded object-cover" width={20} height={20} />
        <span className="whitespace-nowrap text-xs font-semibold text-white/90">JukeboxRoom</span>
        <span className="h-4 w-px flex-shrink-0 bg-white/10" />
        <span className="truncate text-xs text-white/55">{getPageTitle(location.pathname)}</span>
      </button>

      <div className="desktop-drag-region h-full min-w-0 flex-1" aria-hidden="true" />

      {menuPosition && (
        <div
          ref={menuRef}
          className="desktop-window-menu"
          role="menu"
          aria-label="窗口菜单"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onKeyDown={handleMenuKeyDown}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            ref={(node) => { menuItemsRef.current[0] = node; }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => invokeMenuAction(() => { void controls.minimize(); })}
          >
            <Minus aria-hidden="true" />
            <span>最小化</span>
            <kbd>Ctrl+M</kbd>
          </button>
          <button
            ref={(node) => { menuItemsRef.current[1] = node; }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => invokeMenuAction(() => { void controls.toggleMaximize(); })}
          >
            {maximized ? <Copy aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            <span>{maximized ? '还原' : '最大化'}</span>
            <kbd>Ctrl+Shift+M</kbd>
          </button>
          <div className="desktop-window-menu-separator" role="separator" />
          <button
            ref={(node) => { menuItemsRef.current[2] = node; }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="desktop-window-menu-close"
            onClick={() => invokeMenuAction(() => { void controls.close(); })}
          >
            <X aria-hidden="true" />
            <span>关闭</span>
            <kbd>Alt+F4</kbd>
          </button>
        </div>
      )}

      <div className="desktop-no-drag flex h-full flex-shrink-0 items-stretch">
        <button
          type="button"
          className="desktop-window-button"
          aria-label="最小化"
          title="最小化 · Ctrl+M"
          onClick={() => void controls.minimize()}
        >
          <Minus className="h-4 w-4" strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="desktop-window-button"
          aria-label={maximized ? '还原' : '最大化'}
          title={`${maximized ? '还原' : '最大化'} · Ctrl+Shift+M`}
          onClick={() => void controls.toggleMaximize()}
        >
          {maximized
            ? <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />
            : <Maximize className="h-3.5 w-3.5" strokeWidth={1.6} />}
        </button>
        <button
          type="button"
          className="desktop-window-button desktop-window-button--close"
          aria-label="关闭"
          title="关闭"
          onClick={() => void controls.close()}
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
}
