import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="my-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-slate-100 backdrop-blur-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-base font-semibold text-rose-300">
            {this.props.title || 'Display Error'}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600/80 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
