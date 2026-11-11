/** Load camera/vision and Three.js gesture code only when a gesture mode is requested. */
type GalaxyHandGestureModule = typeof import('../components/galaxy/lib/galaxyHandGesture');

let gestureModulePromise: Promise<GalaxyHandGestureModule> | null = null;

export async function syncGalaxyHandGestureMode(mode: 'off' | 'gesture'): Promise<void> {
  if (mode === 'off' && !gestureModulePromise) return;

  const pending = gestureModulePromise ??= import('../components/galaxy/lib/galaxyHandGesture');
  let gestureModule: GalaxyHandGestureModule;
  try {
    gestureModule = await pending;
  } catch (error) {
    if (gestureModulePromise === pending) gestureModulePromise = null;
    throw error;
  }
  await gestureModule.syncGalaxyHandGestureMode(mode);
}
