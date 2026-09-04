import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export const MODAL_ROOT_ATTR = 'data-modal-root';

interface Props {
  open: boolean;
  children: React.ReactNode;
  onClose?: () => void;
  /** 是否显示遮罩层，默认 true */
  mask?: boolean;
  /** 点击遮罩是否关闭；mask 为 false 时无效，默认 true */
  closeOnMaskClick?: boolean;
  zIndex?: number;
  panelClassName?: string;
  containerClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

export function isInsideModalRoot(target: EventTarget | null): boolean {
  return Boolean((target as Element | null)?.closest?.(`[${MODAL_ROOT_ATTR}]`));
}

export default function Modal({
  open,
  children,
  onClose,
  mask = true,
  closeOnMaskClick = true,
  zIndex = 80,
  panelClassName = 'glass-surface glass-surface--modal relative w-full max-w-sm animate-fade-in rounded-2xl p-6',
  containerClassName = 'fixed inset-0 flex items-center justify-center p-4',
  ariaLabel = '对话框',
  ariaLabelledBy,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const activeElement = document.activeElement;
    restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;

      const focusableElement = getFocusableElements(panel)[0];
      (focusableElement ?? panel).focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const restoreFocusElement = restoreFocusRef.current;
      if (restoreFocusElement && document.contains(restoreFocusElement)) {
        restoreFocusElement.focus();
      }
      restoreFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const maskClassName = 'modal-mask glass-scrim absolute inset-0';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onClose) {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusableElements = getFocusableElements(panel);
    if (focusableElements.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && (activeElement === firstElement || !panel.contains(activeElement))) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && (activeElement === lastElement || !panel.contains(activeElement))) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return createPortal(
    <div
      className={containerClassName}
      style={{ zIndex }}
      {...{ [MODAL_ROOT_ATTR]: '' }}
    >
      {mask && (
        closeOnMaskClick && onClose ? (
          <button
            type="button"
            className={maskClassName}
            onClick={onClose}
            aria-label="关闭"
          />
        ) : (
          <div className={maskClassName} aria-hidden />
        )
      )}
      <div
        ref={panelRef}
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
}
