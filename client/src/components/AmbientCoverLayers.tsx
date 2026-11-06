import { useEffect, useMemo, useState } from 'react';
import { extractCoverPalette, measureCoverLuminance, tuneCoverBackdrop, type CoverBackdropTuning } from '../lib/coverBackdrop';
import { toProxiedMediaUrl } from '../lib/mediaProxyUrl';

interface Props {
  coverUrl: string;
  className?: string;
}

export default function AmbientCoverLayers({ coverUrl, className = 'absolute inset-0' }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [tuning, setTuning] = useState<CoverBackdropTuning>(() => tuneCoverBackdrop(null));
  const [palette, setPalette] = useState(() => ({
    primary: 'rgba(30, 41, 59, 0.55)',
    secondary: 'rgba(15, 23, 42, 0.65)',
  }));
  const displayUrl = useMemo(() => toProxiedMediaUrl(coverUrl), [coverUrl]);

  useEffect(() => {
    setLoaded(false);
    setTuning(tuneCoverBackdrop(null));

    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      setTuning(tuneCoverBackdrop(measureCoverLuminance(probe)));
      setPalette(extractCoverPalette(probe));
    };
    probe.onerror = () => {
      setTuning(tuneCoverBackdrop(null));
    };
    probe.src = displayUrl;

    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [displayUrl]);

  return (
    <div className={`${className} overflow-hidden`} aria-hidden>
      <div className="absolute inset-0 bg-[var(--color-bg-elevated)]" />

      {/* 渐变流光色彩底衬 */}
      <div
        className="absolute -inset-10 opacity-70 blur-3xl transition-all duration-1000"
        style={{
          background: `radial-gradient(circle at 20% 30%, ${palette.primary}, transparent 65%), radial-gradient(circle at 80% 70%, ${palette.secondary}, transparent 65%)`,
        }}
      />

      <img
        src={displayUrl}
        alt=""
        crossOrigin="anonymous"
        className="absolute inset-0 h-full w-full object-cover saturate-125 transition-[opacity,filter] duration-700"
        style={{
          opacity: loaded ? tuning.coverOpacity : 0,
          filter: `blur(32px) brightness(${tuning.imgBrightness})`,
          transform: 'scale(1.08)',
        }}
        onLoad={() => setLoaded(true)}
      />

      <div
        className="absolute inset-0 transition-[background-color] duration-700"
        style={{ backgroundColor: `rgba(0, 0, 0, ${tuning.baseOverlay})` }}
      />

      <div
        className="absolute inset-0 transition-[background] duration-700"
        style={{
          background: `linear-gradient(to bottom, rgba(0, 0, 0, ${tuning.gradientTop}), transparent, rgba(0, 0, 0, ${tuning.gradientBottom}))`,
        }}
      />
    </div>
  );
}
