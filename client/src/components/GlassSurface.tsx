import type { HTMLAttributes } from 'react';

type GlassVariant = 'base' | 'panel' | 'elevated' | 'modal';

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassVariant;
  interactive?: boolean;
}

export default function GlassSurface({
  variant = 'base',
  interactive = false,
  className = '',
  ...props
}: Props) {
  return (
    <div
      {...props}
      className={[
        'glass-surface',
        variant === 'base' ? '' : 'glass-surface--' + variant,
        interactive ? 'glass-interactive' : '',
        className,
      ].filter(Boolean).join(' ')}
    />
  );
}
