export type CoverBackdropTuning = {
  coverOpacity: number;
  baseOverlay: number;
  gradientTop: number;
  gradientBottom: number;
  imgBrightness: number;
};

/** 无法采样亮度时，用偏保守的遮罩避免亮色封面过曝 */
const FALLBACK_TUNING: CoverBackdropTuning = {
  coverOpacity: 0.82,
  baseOverlay: 0.26,
  gradientTop: 0.32,
  gradientBottom: 0.34,
  imgBrightness: 0.94,
};

/** 采样封面平均亮度（0=暗，1=亮） */
export function measureCoverLuminance(img: HTMLImageElement): number | null {
  try {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count += 1;
    }

    return count ? sum / count / 255 : null;
  } catch {
    return null;
  }
}

/** 根据封面亮度计算背景遮罩与压暗参数 */
export function tuneCoverBackdrop(luminance: number | null): CoverBackdropTuning {
  if (luminance == null) return FALLBACK_TUNING;

  const bright = Math.max(0, luminance - 0.48);
  const factor = Math.min(1, bright / 0.35);

  return {
    coverOpacity: 0.85 - factor * 0.1,
    baseOverlay: 0.22 + factor * 0.22,
    gradientTop: 0.28 + factor * 0.18,
    gradientBottom: 0.32 + factor * 0.16,
    imgBrightness: 1 - factor * 0.1,
  };
}

export function extractCoverPalette(img: HTMLImageElement): { primary: string; secondary: string } {
  try {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { primary: 'rgba(30, 41, 59, 0.7)', secondary: 'rgba(15, 23, 42, 0.8)' };

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let rTop = 0, gTop = 0, bTop = 0, countTop = 0;
    let rBot = 0, gBot = 0, bBot = 0, countBot = 0;
    const half = (size * size) / 2;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      const pixelIndex = i / 4;
      if (pixelIndex < half) {
        rTop += data[i];
        gTop += data[i + 1];
        bTop += data[i + 2];
        countTop++;
      } else {
        rBot += data[i];
        gBot += data[i + 1];
        bBot += data[i + 2];
        countBot++;
      }
    }

    const c1 = countTop ? [Math.round(rTop / countTop), Math.round(gTop / countTop), Math.round(bTop / countTop)] : [30, 41, 59];
    const c2 = countBot ? [Math.round(rBot / countBot), Math.round(gBot / countBot), Math.round(bBot / countBot)] : [15, 23, 42];

    return {
      primary: `rgba(${c1[0]}, ${c1[1]}, ${c1[2]}, 0.55)`,
      secondary: `rgba(${c2[0]}, ${c2[1]}, ${c2[2]}, 0.65)`,
    };
  } catch {
    return { primary: 'rgba(30, 41, 59, 0.7)', secondary: 'rgba(15, 23, 42, 0.8)' };
  }
}
