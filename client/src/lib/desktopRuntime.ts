export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.jukeboxWindow);
}
