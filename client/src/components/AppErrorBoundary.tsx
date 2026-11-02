import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const stack = String(error?.stack || '').split('\n').slice(0, 6).join('\n');
    return { hasError: true, message: `${error?.message}\n${stack}` };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled application error', { error, componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-full items-center justify-center bg-netease-dark px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-lg font-semibold">页面暂时无法加载</p>
          <p className="mt-2 text-sm leading-6 text-white/55">刷新页面后可继续使用房间、播放和聊天功能。</p>
          {this.state.message && (
            <p className="mt-3 rounded-lg bg-white/5 p-2 text-left text-[11px] leading-4 text-red-300 break-all">
              {this.state.message}
            </p>
          )}
          <button type="button" onClick={() => window.location.reload()} className="mx-auto mt-6 inline-flex items-center gap-2 rounded-lg bg-netease-red px-4 py-2.5 text-sm font-medium transition-[filter] hover:brightness-105">
            <RefreshCw className="h-4 w-4" />
            刷新页面
          </button>
        </div>
      </main>
    );
  }
}
