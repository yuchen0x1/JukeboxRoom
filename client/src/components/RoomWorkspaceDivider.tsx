import { useState, type PointerEvent, type KeyboardEvent } from 'react';

interface Props {
  label: string;
  onResize: (clientX: number) => void;
  onResizeBy: (direction: -1 | 1) => void;
}

export default function RoomWorkspaceDivider({ label, onResize, onResizeBy }: Props) {
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onResizeBy(event.key === 'ArrowLeft' ? -1 : 1);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuetext="拖动或使用左右方向键调整"
      tabIndex={0}
      className={`room-workspace-divider${dragging ? ' is-dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={(event) => {
        if (dragging && event.buttons === 1) onResize(event.clientX);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={handleKeyDown}
    />
  );
}
