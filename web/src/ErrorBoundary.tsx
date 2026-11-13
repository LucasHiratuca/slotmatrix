import React from 'react';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryContext {
  route?: string;
  userEmail?: string | null;
  workspaceId?: string | null;
  plan?: string | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  scope?: 'global' | 'section';
  sectionTitle?: string;
  context?: ErrorBoundaryContext;
  onRetry?: () => void;
  onLogout?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { scope = 'global', sectionTitle, context } = this.props;
    console.error('[SlotMatrix ErrorBoundary]', {
      scope,
      section: sectionTitle ?? 'root',
      route: context?.route ?? (typeof window !== 'undefined' ? window.location.pathname : '/'),
      user: context?.userEmail ?? 'desconhecido',
      workspaceId: context?.workspaceId ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('slotmatrix_workspace_id') : null),
      plan: context?.plan ?? 'desconhecido',
      errorMessage: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  private handleLogoutAndReset = (): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('slotmatrix_token');
      localStorage.removeItem('slotmatrix_workspace_id');
      localStorage.removeItem('slotmatrix_user_email');
      localStorage.removeItem('slotmatrix_user_name');
    }
    if (typeof fetch !== 'undefined') {
      void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    }
    this.setState({ hasError: false });
    if (this.props.onLogout) {
      this.props.onLogout();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isGlobal = (this.props.scope ?? 'global') === 'global';

    return (
      <div
        role="alert"
        className={
          isGlobal
            ? 'min-h-screen bg-canvas text-ink-primary flex items-center justify-center p-6'
            : 'bg-surface border border-border-subtle rounded-xl p-6 text-ink-primary my-4'
        }
      >
        <div className="max-w-md w-full bg-surface border border-border-subtle rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)] text-[var(--status-pending-text)] shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-ink-primary">
                {isGlobal
                  ? 'Não foi possível exibir esta página agora'
                  : `Erro ao carregar a seção ${this.props.sectionTitle ?? 'selecionada'}`}
              </h2>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Ocorreu uma falha inesperada ao renderizar os dados desta visualização. Seus dados continuam seguros e
                você pode tentar recarregar a tela ou renovar sua sessão.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </button>

            <button
              type="button"
              onClick={this.handleLogoutAndReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-canvas hover:bg-sunken text-ink-primary border border-border-subtle transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair e entrar de novo
            </button>
          </div>
        </div>
      </div>
    );
  }
}
