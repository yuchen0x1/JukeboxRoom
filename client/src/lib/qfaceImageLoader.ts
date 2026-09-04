/**
 * QQ 表情统一图片调度器：网络拉取 + 解码并发控制 + LRU + 状态机
 *
 * 优先级（数值越小越高）：
 * P0 MESSAGE  — 当前可见消息内的表情
 * P1 NEAR     — 即将进入视野
 * P2 PANEL    — 表情面板可见区域
 * P3 MANIFEST — manifest 预热（常用表情）
 */

export const QFaceLoadPriority = {
  MESSAGE: 0,
  NEAR: 1,
  PANEL: 2,
  MANIFEST: 3,
} as const;

export type QFaceLoadPriority = typeof QFaceLoadPriority[keyof typeof QFaceLoadPriority];

export type QFaceImageState = 'idle' | 'loading' | 'loaded' | 'decoded' | 'rendered';

const MAX_CONCURRENT_DECODE = 6;
const LRU_MAX_DECODED = 150;

interface QueueEntry {
  id: string;
  priority: QFaceLoadPriority;
  resolve: () => void;
  reject: (error: Error) => void;
}

type StateListener = (id: string, state: QFaceImageState) => void;
type UrlForId = (id: string) => string;

class QFaceImageLoader {
  private urlForId: UrlForId = (id) => id;
  private states = new Map<string, QFaceImageState>();
  private entries = new Map<string, QueueEntry>();
  private waitQueue: string[] = [];
  private loadPromises = new Map<string, Promise<void>>();
  private activeDecodes = 0;
  private decodedImages = new Map<string, HTMLImageElement>();
  private lruOrder: string[] = [];
  private stateListeners = new Set<StateListener>();

  configure(urlForId: UrlForId): void {
    this.urlForId = urlForId;
  }

  private setState(id: string, state: QFaceImageState): void {
    const prev = this.states.get(id) ?? 'idle';
    if (prev === state) return;
    this.states.set(id, state);
    this.stateListeners.forEach((listener) => listener(id, state));
  }

  getState(id: string): QFaceImageState {
    return this.states.get(id) ?? 'idle';
  }

  isDecoded(id: string): boolean {
    const state = this.getState(id);
    return state === 'decoded' || state === 'rendered';
  }

  getDecodedImage(id: string): HTMLImageElement | undefined {
    return this.decodedImages.get(id);
  }

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeId(id: string, listener: (state: QFaceImageState) => void): () => void {
    listener(this.getState(id));
    const wrapped: StateListener = (changedId, state) => {
      if (changedId === id) listener(state);
    };
    this.stateListeners.add(wrapped);
    return () => this.stateListeners.delete(wrapped);
  }

  markRendered(id: string): void {
    if (this.getState(id) === 'rendered') return;
    this.touchLru(id);
    this.setState(id, 'rendered');
  }

  request(id: string, priority: QFaceLoadPriority): Promise<void> {
    if (!id) return Promise.resolve();

    const state = this.getState(id);
    if (state === 'decoded' || state === 'rendered') return Promise.resolve();

    const existingPromise = this.loadPromises.get(id);
    if (existingPromise) {
      this.bumpPriority(id, priority);
      return existingPromise;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = { id, priority, resolve, reject };
      this.entries.set(id, entry);
      this.enqueueWait(id);
      this.setState(id, 'loading');
      this.pump();
    });

    this.loadPromises.set(id, promise);
    return promise;
  }

  requestMany(ids: string[], priority: QFaceLoadPriority): void {
    const unique = [...new Set(ids.filter(Boolean))];
    unique.forEach((id) => void this.request(id, priority));
  }

  bumpPriority(id: string, priority: QFaceLoadPriority): void {
    const entry = this.entries.get(id);
    if (!entry || priority >= entry.priority) return;
    entry.priority = priority;
    this.enqueueWait(id);
    this.pump();
  }

  private enqueueWait(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    const index = this.waitQueue.indexOf(id);
    if (index >= 0) this.waitQueue.splice(index, 1);

    const effectivePriority = entry.priority;
    let insertAt = this.waitQueue.length;
    for (let i = 0; i < this.waitQueue.length; i += 1) {
      const other = this.entries.get(this.waitQueue[i]);
      const otherPriority = other?.priority ?? QFaceLoadPriority.MANIFEST;
      if (effectivePriority < otherPriority) {
        insertAt = i;
        break;
      }
    }
    this.waitQueue.splice(insertAt, 0, id);
  }

  private pump(): void {
    while (this.activeDecodes < MAX_CONCURRENT_DECODE && this.waitQueue.length > 0) {
      const id = this.waitQueue.shift()!;
      const entry = this.entries.get(id);
      if (!entry) continue;

      const state = this.getState(id);
      if (state === 'decoded' || state === 'rendered') {
        entry.resolve();
        this.entries.delete(id);
        this.loadPromises.delete(id);
        continue;
      }

      if (this.activeDecodes >= MAX_CONCURRENT_DECODE) {
        this.waitQueue.unshift(id);
        break;
      }

      void this.startDecode(id, entry);
    }
  }

  private async startDecode(id: string, entry: QueueEntry): Promise<void> {
    this.activeDecodes += 1;

    try {
      const image = await this.fetchAndDecode(id, this.urlForId(id));
      this.storeDecoded(id, image);
      this.setState(id, 'decoded');
      entry.resolve();
    } catch (error) {
      this.setState(id, 'idle');
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.entries.delete(id);
      this.loadPromises.delete(id);
      this.activeDecodes -= 1;
      this.pump();
    }
  }

  private async fetchAndDecode(id: string, url: string): Promise<HTMLImageElement> {
    const cached = this.decodedImages.get(id);
    if (cached) return cached;

    if (typeof Image === 'undefined') {
      return document.createElement('img');
    }

    const image = new Image();
    image.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`QQ 表情加载失败: ${id}`));
      image.src = url;
    });

    this.setState(id, 'loaded');

    if (image.decode) {
      try {
        await image.decode();
      } catch {
        // decode() 失败时仍使用 onload 结果
      }
    }

    return image;
  }

  private storeDecoded(id: string, image: HTMLImageElement): void {
    this.decodedImages.set(id, image);
    this.touchLru(id);
    this.evictLruIfNeeded();
  }

  private touchLru(id: string): void {
    const index = this.lruOrder.indexOf(id);
    if (index >= 0) this.lruOrder.splice(index, 1);
    this.lruOrder.push(id);
  }

  private evictLruIfNeeded(): void {
    while (this.lruOrder.length > LRU_MAX_DECODED) {
      const evictId = this.lruOrder.shift()!;
      if (this.getState(evictId) === 'rendered') continue;
      this.decodedImages.delete(evictId);
      if (this.getState(evictId) === 'decoded') {
        this.setState(evictId, 'loaded');
      }
    }
  }
}

const loader = new QFaceImageLoader();

export function configureQFaceImageLoader(urlForId: UrlForId): void {
  loader.configure(urlForId);
}

export function getQFaceImageState(id: string): QFaceImageState {
  return loader.getState(id);
}

export function isQFaceImageDecoded(id: string): boolean {
  return loader.isDecoded(id);
}

export function getQFaceDecodedImage(id: string): HTMLImageElement | undefined {
  return loader.getDecodedImage(id);
}

export function subscribeQFaceImageState(id: string, listener: (state: QFaceImageState) => void): () => void {
  return loader.subscribeId(id, listener);
}

export function requestQFaceImage(id: string, priority: QFaceLoadPriority): Promise<void> {
  return loader.request(id, priority);
}

export function requestQFaceImages(ids: string[], priority: QFaceLoadPriority): void {
  loader.requestMany(ids, priority);
}

export function markQFaceImageRendered(id: string): void {
  loader.markRendered(id);
}

export function bumpQFaceImagePriority(id: string, priority: QFaceLoadPriority): void {
  loader.bumpPriority(id, priority);
}
