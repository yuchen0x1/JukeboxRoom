export type EqualizerPresetId = 'flat' | 'bass_boost' | 'vocal' | 'treble' | 'electronic';

export interface EqualizerPreset {
  id: EqualizerPresetId;
  name: string;
  description: string;
  /** 60Hz (低频), 250Hz (中低频), 1kHz (中频), 4kHz (中高频), 12kHz (高频) 增益 (dB) */
  gains: [number, number, number, number, number];
}

export const EQUALIZER_PRESETS: Record<EqualizerPresetId, EqualizerPreset> = {
  flat: {
    id: 'flat',
    name: '原声无损',
    description: '保持原汁原味的声音动态，无频响修饰',
    gains: [0, 0, 0, 0, 0],
  },
  bass_boost: {
    id: 'bass_boost',
    name: '超重低音',
    description: '强化鼓点与下潜低频，适合电音、说唱与摇滚',
    gains: [6, 4, 0, -1, -1],
  },
  vocal: {
    id: 'vocal',
    name: '清亮人声',
    description: '削减低频浑浊，突出中频与高频人声细节',
    gains: [-3, -1, 4, 3, 1],
  },
  treble: {
    id: 'treble',
    name: '通透高音',
    description: '提升高频乐器空气感与弦乐解析力',
    gains: [-2, 0, 1, 4, 6],
  },
  electronic: {
    id: 'electronic',
    name: '沉浸律动',
    description: '两端提升（V字调音），营造现场环绕动感',
    gains: [5, 2, -2, 3, 5],
  },
};

const FREQUENCIES = [60, 250, 1000, 4000, 12000] as const;
const STORAGE_KEY = 'openmusic:eq-preset';

export function readStoredEqualizerPreset(): EqualizerPresetId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in EQUALIZER_PRESETS) {
      return raw as EqualizerPresetId;
    }
  } catch {
    // ignore
  }
  return 'flat';
}

export function saveStoredEqualizerPreset(preset: EqualizerPresetId): void {
  try {
    localStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // ignore
  }
}

export class AudioEqualizerEngine {
  private ctx: AudioContext | null = null;
  private filters: BiquadFilterNode[] = [];
  private currentPreset: EqualizerPresetId = readStoredEqualizerPreset();

  public getPreset(): EqualizerPresetId {
    return this.currentPreset;
  }

  public setPreset(presetId: EqualizerPresetId): void {
    if (!EQUALIZER_PRESETS[presetId]) return;
    this.currentPreset = presetId;
    saveStoredEqualizerPreset(presetId);
    this.applyGains();
  }

  public attachToContext(ctx: AudioContext, inputNode: AudioNode, outputNode: AudioNode): AudioNode {
    this.ctx = ctx;
    // 断开旧节点连接避免切换时重复串联
    try {
      this.filters.forEach((f) => f.disconnect());
    } catch {
      // ignore
    }

    this.filters = FREQUENCIES.map((freq, index) => {
      const filter = ctx.createBiquadFilter();
      if (index === 0) {
        filter.type = 'lowshelf';
      } else if (index === FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.0;
      }
      filter.frequency.value = freq;
      filter.gain.value = 0;
      return filter;
    });

    // 链式连接 filters
    let currentInput: AudioNode = inputNode;
    for (const filter of this.filters) {
      currentInput.connect(filter);
      currentInput = filter;
    }
    currentInput.connect(outputNode);

    this.applyGains();
    return currentInput;
  }

  private applyGains(): void {
    if (!this.filters.length) return;
    const preset = EQUALIZER_PRESETS[this.currentPreset] || EQUALIZER_PRESETS.flat;
    this.filters.forEach((filter, index) => {
      const targetGain = preset.gains[index] ?? 0;
      if (this.ctx && Number.isFinite(this.ctx.currentTime)) {
        filter.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
      } else {
        filter.gain.value = targetGain;
      }
    });
  }
}

export const globalAudioEqualizer = new AudioEqualizerEngine();
