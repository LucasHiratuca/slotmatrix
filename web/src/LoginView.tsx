import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Moon,
  Sun,
} from 'lucide-react';
import { Avatar } from './ui/Primitives';
import { apiRequest } from './api';

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

interface LoginViewProps {
  email: string;
  password: string;
  onEmailChange: (val: string) => void;
  onPasswordChange: (val: string) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  onRegister?: (data: RegisterData) => Promise<void>;
  onForgotPassword?: (email: string) => Promise<{
    message: string;
    resetUrl?: string;
    delivered?: boolean;
    error?: string;
    note?: string;
  } | void>;
  isLoggingIn: boolean;
  loginError: string | null;
  isDark: boolean;
  onToggleTheme: () => void;
  initialMode?: 'login' | 'register';
}

export const LoginView: React.FC<LoginViewProps> = ({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onRegister,
  onForgotPassword,
  isLoggingIn,
  loginError,
  isDark,
  onToggleTheme,
  initialMode = 'login',
}) => {
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [regCapsLockOn, setRegCapsLockOn] = useState(false);
  const [isSendingForgot, setIsSendingForgot] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<{
    message: string;
    resetUrl?: string;
    delivered?: boolean;
    error?: string;
  } | null>(null);

  // Campos do formulário de cadastro
  const [regName, setRegName] = useState('');
  const [regWorkspaceName, setRegWorkspaceName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  const isDemoMode =
    import.meta.env.VITE_DEMO_MODE === 'true' ||
    (import.meta.env.VITE_DEMO_MODE !== 'false' && import.meta.env.MODE === 'test');

  useEffect(() => {
    if (loginError) {
      if (mode === 'login') {
        emailInputRef.current?.focus();
      } else {
        nameInputRef.current?.focus();
      }
    }
  }, [loginError, mode]);

  useEffect(() => {
    if (mode === 'register') {
      nameInputRef.current?.focus();
    } else {
      emailInputRef.current?.focus();
    }
  }, [mode]);

  const handleKeyModifiers = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleRegKeyModifiers = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setRegCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const formatHumanLoginError = (raw: string): string => {
    if (/invalid|credencia|401|incorret|unauthorized|falha.*autentic/i.test(raw)) {
      return 'E-mail ou senha incorretos. Confira os dados e tente de novo.';
    }
    if (/e-?mail.*already.*register|e-?mail.*j.*cadastrad/i.test(raw)) {
      return 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.';
    }
    if (/password.*at least 8|senha.*m[ií]nimo 8/i.test(raw)) {
      return 'A senha deve conter no mínimo 8 caracteres.';
    }
    return raw;
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);

    const trimmedName = regName.trim();
    const trimmedWsName = regWorkspaceName.trim();
    const trimmedEmail = regEmail.trim();
    const pass = regPassword;

    if (!trimmedName || trimmedName.length < 2) {
      setClientError('Informe seu nome completo (mínimo de 2 caracteres).');
      nameInputRef.current?.focus();
      return;
    }
    if (!trimmedWsName || trimmedWsName.length < 2) {
      setClientError('Informe o nome da clínica ou consultório (mínimo de 2 caracteres).');
      return;
    }
    if (trimmedWsName.length > 80) {
      setClientError('O nome da clínica deve ter no máximo 80 caracteres.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setClientError('Informe um e-mail corporativo válido.');
      return;
    }
    if (!pass || pass.length < 8) {
      setClientError('A senha deve conter no mínimo 8 caracteres.');
      return;
    }

    if (onRegister) {
      try {
        await onRegister({
          name: trimmedName,
          workspaceName: trimmedWsName,
          email: trimmedEmail,
          password: pass,
        });
      } catch (err: any) {
        setClientError(formatHumanLoginError(err?.message || 'Falha ao realizar cadastro. Tente novamente.'));
      }
    }
  };

  const handleForgotPassword = async () => {
    setClientError(null);
    setForgotStatus(null);
    const em = email.trim();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setClientError('Informe seu e-mail corporativo no campo acima para receber o link de redefinição de senha.');
      emailInputRef.current?.focus();
      return;
    }

    setIsSendingForgot(true);
    try {
      let res: {
        message: string;
        resetUrl?: string;
        delivered?: boolean;
        error?: string;
        note?: string;
      } | void;

      if (onForgotPassword) {
        res = await onForgotPassword(em);
      } else {
        res = await apiRequest<{
          message: string;
          resetUrl?: string;
          delivered?: boolean;
          error?: string;
          note?: string;
        }>('/auth/forgot-password', {
          method: 'POST',
          body: { email: em },
        });
      }

      const delivered = res?.delivered ?? false;
      const error = res?.error;
      const resetUrl = res?.resetUrl;

      setForgotStatus({
        message: delivered
          ? `✓ E-mail enviado com sucesso para ${em}! Verifique sua caixa de entrada e spam.`
          : error
          ? `Falha na entrega via SMTP para ${em}: ${error}`
          : `Solicitação registrada para ${em}. Servidor SMTP não configurado no .env.`,
        resetUrl,
        delivered,
        error,
      });
    } catch (err: any) {
      setClientError(err?.message || 'Falha ao solicitar redefinição de senha. Tente novamente.');
    } finally {
      setIsSendingForgot(false);
    }
  };

  const currentError = clientError || loginError;

  return (
    <div className="min-h-screen bg-canvas text-ink-primary flex flex-col lg:flex-row">
      {/* Coluna Esquerda (44%): Formulário de Autenticação */}
      <div className="w-full lg:w-[44%] bg-surface flex flex-col justify-between px-6 py-5 sm:px-10 sm:py-8 lg:px-14 lg:py-10 border-b lg:border-b-0 lg:border-r border-border-subtle">
        {/* Topo: Marca + Alternador de Tema */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="w-8 h-8 rounded-lg bg-[var(--btn-primary-bg)] text-white flex items-center justify-center shadow-xs"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="3" width="9" height="3" rx="1.5" fill="currentColor" />
                <rect x="2" y="7.5" width="9" height="3" rx="1.5" fill="currentColor" />
                <rect x="12" y="7.5" width="4" height="3" rx="1" fill="currentColor" fillOpacity="0.45" />
                <rect x="2" y="12" width="9" height="3" rx="1.5" fill="currentColor" />
                <line x1="5.5" y1="4.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <span className="text-[16px] font-semibold text-ink-primary">
                SlotMatrix
              </span>
              <span className="hidden sm:inline-block ml-2 text-[13px] text-ink-secondary">
                Coordenação clínica
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-canvas hover:bg-sunken text-[13px] text-ink-secondary hover:text-ink-primary transition"
          >
            {isDark ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.6} />
                <span>Tema claro</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-ink-secondary" strokeWidth={1.6} />
                <span>Tema escuro</span>
              </>
            )}
          </button>
        </div>

        {/* Bloco Central: Formulário (centro óptico alinhado à coluna direita) */}
        <div className="w-full max-w-[390px] mx-auto my-auto py-4 sm:py-6 space-y-5">
          {/* Alternador de Modo: Entrar / Cadastrar */}
          <div
            className="flex items-center p-1 bg-sunken rounded-xl border border-border-subtle max-w-[240px]"
            role="tablist"
            aria-label="Opções de autenticação"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              data-testid="tab-login"
              onClick={() => {
                setMode('login');
                setClientError(null);
              }}
              className={`flex-1 py-1.5 px-3 text-[13px] rounded-lg transition cursor-pointer ${
                mode === 'login'
                  ? 'bg-surface text-ink-primary shadow-xs font-semibold'
                  : 'text-ink-secondary hover:text-ink-primary font-medium'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              data-testid="tab-register"
              onClick={() => {
                setMode('register');
                setClientError(null);
              }}
              className={`flex-1 py-1.5 px-3 text-[13px] rounded-lg transition cursor-pointer ${
                mode === 'register'
                  ? 'bg-surface text-ink-primary shadow-xs font-semibold'
                  : 'text-ink-secondary hover:text-ink-primary font-medium'
              }`}
            >
              Cadastrar
            </button>
          </div>

          {mode === 'login' ? (
            <>
              <div className="space-y-1.5">
                <h1 className="text-[24px] sm:text-[26px] font-semibold text-ink-primary leading-tight">
                  Bem-vindo de volta
                </h1>
                <p className="text-[14px] text-ink-secondary">
                  Entre com seu e-mail da clínica para abrir a agenda do dia.
                </p>
              </div>

              {currentError && (
                <div
                  role="alert"
                  data-testid="login-error-alert"
                  className="p-3.5 rounded-xl border bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error-text)] flex items-start gap-2.5 text-[13px]"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                  <span>{formatHumanLoginError(currentError)}</span>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void onSubmit(email, password);
                }}
                className="space-y-4"
                noValidate
              >
                <div>
                  <label
                    htmlFor="login-email-input"
                    className="block text-[13px] font-medium text-ink-primary mb-1.5"
                  >
                    E-mail corporativo
                  </label>
                  <input
                    ref={emailInputRef}
                    id="login-email-input"
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    placeholder="nome@suaclinica.com.br"
                    className="w-full h-12 px-3.5 rounded-lg bg-surface border border-border-strong text-[14px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus-visible:outline-2 focus-visible:outline-brand transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password-input"
                      className="block text-[13px] font-medium text-ink-primary"
                    >
                      Senha
                    </label>
                    <button
                      type="button"
                      disabled={isSendingForgot || isLoggingIn}
                      data-testid="forgot-password-button"
                      onClick={() => void handleForgotPassword()}
                      className="text-[13px] text-brand hover:underline font-medium cursor-pointer disabled:opacity-50"
                    >
                      {isSendingForgot ? 'Enviando link...' : 'Esqueceu a senha?'}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      id="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => onPasswordChange(e.target.value)}
                      onKeyUp={handleKeyModifiers}
                      onKeyDown={handleKeyModifiers}
                      placeholder="Digite sua senha"
                      className="w-full h-12 pl-3.5 pr-24 rounded-lg bg-surface border border-border-strong text-[14px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus-visible:outline-2 focus-visible:outline-brand transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-ink-secondary hover:text-ink-primary hover:bg-sunken inline-flex items-center gap-1 transition"
                    >
                      {showPassword ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" strokeWidth={1.6} />
                          <span>Ocultar</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.6} />
                          <span>Mostrar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {capsLockOn && (
                    <div
                      role="status"
                      className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[var(--status-pending-text)]"
                    >
                      <KeyRound className="w-3.5 h-3.5 shrink-0" />
                      <span>O Caps Lock está ativado.</span>
                    </div>
                  )}

                  {forgotStatus && (
                    <div
                      role="status"
                      data-testid="forgot-password-success-alert"
                      className={`mt-2.5 p-3.5 rounded-xl border space-y-2 text-[13px] ${
                        forgotStatus.delivered
                          ? 'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)]'
                          : forgotStatus.error
                          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {forgotStatus.delivered ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                        )}
                        <div className="space-y-1">
                          <span className="font-medium block">{forgotStatus.message}</span>
                          {!forgotStatus.delivered && (
                            <span className="text-[12px] opacity-90 block">
                              {forgotStatus.error
                                ? 'Verifique suas credenciais de e-mail no arquivo .env (SMTP_USER/SMTP_PASS).'
                                : 'Configure SMTP_HOST, SMTP_USER e SMTP_PASS no arquivo .env para que os e-mails cheguem no Gmail.'}
                            </span>
                          )}
                        </div>
                      </div>
                      {forgotStatus.resetUrl && (
                        <div className="pt-2 flex items-center justify-between border-t border-current/20 text-[12px]">
                          <span className="opacity-80">
                            {forgotStatus.delivered ? 'Link gerado:' : 'Link direto de redefinição:'}
                          </span>
                          <a
                            href={forgotStatus.resetUrl}
                            data-testid="test-reset-link"
                            className="font-semibold underline hover:opacity-80"
                          >
                            Redefinir senha agora →
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full h-12 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] active:translate-y-[0.5px] text-white font-semibold text-[15px] shadow-sm ring-1 ring-inset ring-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:bg-sunken disabled:text-ink-muted disabled:ring-0 disabled:shadow-none disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Entrando...</span>
                    </>
                  ) : (
                    <span>Entrar</span>
                  )}
                </button>

                <div className="pt-2 text-center text-[13px] text-ink-secondary">
                  <span>Não tem uma conta? </span>
                  <button
                    type="button"
                    data-testid="toggle-to-register"
                    onClick={() => {
                      setMode('register');
                      setClientError(null);
                    }}
                    className="text-brand hover:underline font-semibold cursor-pointer"
                  >
                    Cadastre sua clínica
                  </button>
                </div>
              </form>

              {/* Contas de demonstração recolhidas em acordeão (VITE_DEMO_MODE) */}
              {isDemoMode && (
                <details className="group pt-3 border-t border-border-subtle">
                  <summary className="list-none cursor-pointer flex items-center justify-between py-1.5 text-[13px] font-medium text-ink-secondary hover:text-ink-primary select-none">
                    <span>Explorar com uma conta de demonstração</span>
                    <ChevronDown className="w-4 h-4 text-ink-muted transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="mt-2.5 space-y-2">
                    <button
                      type="button"
                      disabled={isLoggingIn}
                      onClick={() => void onSubmit('owner@vitascan.test', 'Passw0rd!')}
                      className="w-full text-left p-2.5 rounded-xl bg-canvas hover:bg-brand-tint/50 border border-border-subtle transition flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name="Dra. Renata Silveira" size="sm" />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-ink-primary truncate">
                            Dra. Renata Silveira · Proprietária
                          </div>
                          <div className="text-[12px] text-ink-secondary truncate">
                            VitaScan Diagnósticos (Proprietário(a) · Plano Pro)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-[12px] font-medium rounded-md bg-brand-tint text-brand-tint-text shrink-0">
                        Plano Pro
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isLoggingIn}
                      onClick={() => void onSubmit('owner@aura.test', 'Passw0rd!')}
                      className="w-full text-left p-2.5 rounded-xl bg-canvas hover:bg-sunken border border-border-subtle transition flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name="Clara Mendes" size="sm" />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-ink-primary truncate">
                            Clara Mendes · Proprietária
                          </div>
                          <div className="text-[12px] text-ink-secondary truncate">
                            Estúdio Aura (Proprietário(a) · Plano Starter)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-[12px] font-medium rounded-md bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border border-[var(--status-pending-border)] shrink-0 tabular-nums">
                        5 de 5
                      </span>
                    </button>

                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        disabled={isLoggingIn}
                        onClick={() => void onSubmit('admin@vitascan.test', 'Passw0rd!')}
                        className="text-left p-2 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle transition"
                      >
                        <div className="text-[12px] font-semibold text-ink-primary truncate">
                          Marcos V.
                        </div>
                        <div className="text-[12px] text-ink-secondary truncate">
                          Administração
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={isLoggingIn}
                        onClick={() => void onSubmit('coord@vitascan.test', 'Passw0rd!')}
                        className="text-left p-2 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle transition"
                      >
                        <div className="text-[12px] font-semibold text-ink-primary truncate">
                          Helena Prado
                        </div>
                        <div className="text-[12px] text-ink-secondary truncate">
                          Coordenação
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={isLoggingIn}
                        onClick={() => void onSubmit('spec@vitascan.test', 'Passw0rd!')}
                        className="text-left p-2 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle transition"
                      >
                        <div className="text-[12px] font-semibold text-ink-primary truncate">
                          Dra. Camila
                        </div>
                        <div className="text-[12px] text-ink-secondary truncate">
                          Especialista
                        </div>
                      </button>
                    </div>
                  </div>
                </details>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <h1 className="text-[24px] sm:text-[26px] font-semibold text-ink-primary leading-tight">
                  Crie sua clínica
                </h1>
                <p className="text-[14px] text-ink-secondary">
                  Cadastre seu usuário e sua clínica para iniciar o teste gratuito.
                </p>
              </div>

              {currentError && (
                <div
                  role="alert"
                  data-testid="login-error-alert"
                  className="p-3.5 rounded-xl border bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error-text)] flex items-start gap-2.5 text-[13px]"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                  <span>{formatHumanLoginError(currentError)}</span>
                </div>
              )}

              <form
                onSubmit={handleRegisterSubmit}
                className="space-y-3.5"
                noValidate
              >
                <div>
                  <label
                    htmlFor="register-name-input"
                    className="block text-[13px] font-medium text-ink-primary mb-1"
                  >
                    Nome completo
                  </label>
                  <input
                    ref={nameInputRef}
                    id="register-name-input"
                    data-testid="register-name-input"
                    type="text"
                    name="name"
                    autoComplete="name"
                    required
                    value={regName}
                    onChange={(e) => {
                      setRegName(e.target.value);
                      setClientError(null);
                    }}
                    placeholder="Dra. Renata Silveira"
                    className="w-full h-11 px-3.5 rounded-lg bg-surface border border-border-strong text-[14px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus-visible:outline-2 focus-visible:outline-brand transition"
                  />
                </div>

                <div>
                  <label
                    htmlFor="register-workspace-name-input"
                    className="block text-[13px] font-medium text-ink-primary mb-1"
                  >
                    Nome da clínica ou consultório
                  </label>
                  <input
                    id="register-workspace-name-input"
                    data-testid="register-workspace-name-input"
                    type="text"
                    name="workspaceName"
                    required
                    value={regWorkspaceName}
                    onChange={(e) => {
                      setRegWorkspaceName(e.target.value);
                      setClientError(null);
                    }}
                    placeholder="Ex: VitaScan Diagnósticos"
                    className="w-full h-11 px-3.5 rounded-lg bg-surface border border-border-strong text-[14px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus-visible:outline-2 focus-visible:outline-brand transition"
                  />
                </div>

                <div>
                  <label
                    htmlFor="register-email-input"
                    className="block text-[13px] font-medium text-ink-primary mb-1"
                  >
                    E-mail corporativo
                  </label>
                  <input
                    id="register-email-input"
                    data-testid="register-email-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={regEmail}
                    onChange={(e) => {
                      setRegEmail(e.target.value);
                      setClientError(null);
                    }}
                    placeholder="nome@suaclinica.com.br"
                    className="w-full h-11 px-3.5 rounded-lg bg-surface border border-border-strong text-[14px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus-visible:outline-2 focus-visible:outline-brand transition"
                  />
                </div>

                <div>
                  <label
                    htmlFor="register-password-input"
                    className="block text-[13px] font-medium text-ink-primary mb-1"
                  >
                    Senha (mínimo de 8 caracteres)
                  </label>
                  <div className="relative">
                    <input
                      id="register-password-input"
                      data-testid="register-password-input"
                      type={showRegPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="new-password"
                      required
                      value={regPassword}
                      onChange={(e) => {
                        setRegPassword(e.target.value);
                        setClientError(null);
                      }}
                      onKeyUp={handleRegKeyModifiers}
                      onKeyDown={handleRegKeyModifiers}
                      placeholder="Crie uma senha forte"
                      className="w-full h-11 pl-3.5 pr-24 rounded-lg bg-surface border border-border-strong text-[14px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus-visible:outline-2 focus-visible:outline-brand transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((prev) => !prev)}
                      aria-label={showRegPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md text-[13px] font-medium text-ink-secondary hover:text-ink-primary hover:bg-sunken inline-flex items-center gap-1 transition"
                    >
                      {showRegPassword ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" strokeWidth={1.6} />
                          <span>Ocultar</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.6} />
                          <span>Mostrar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {regCapsLockOn && (
                    <div
                      role="status"
                      className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--status-pending-text)]"
                    >
                      <KeyRound className="w-3.5 h-3.5 shrink-0" />
                      <span>O Caps Lock está ativado.</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  data-testid="register-submit-button"
                  disabled={isLoggingIn}
                  className="w-full h-12 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] active:translate-y-[0.5px] text-white font-semibold text-[15px] shadow-sm ring-1 ring-inset ring-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:bg-sunken disabled:text-ink-muted disabled:ring-0 disabled:shadow-none disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Criando clínica...</span>
                    </>
                  ) : (
                    <span>Criar clínica e começar</span>
                  )}
                </button>

                <div className="pt-2 text-center text-[13px] text-ink-secondary">
                  <span>Já possui uma conta? </span>
                  <button
                    type="button"
                    data-testid="toggle-to-login"
                    onClick={() => {
                      setMode('login');
                      setClientError(null);
                    }}
                    className="text-brand hover:underline font-semibold cursor-pointer"
                  >
                    Fazer login
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Rodapé útil da coluna esquerda */}
        <div className="hidden sm:flex items-center justify-center lg:justify-start text-[13px] text-ink-secondary">
          <span>
            {mode === 'login'
              ? 'Problemas para entrar? Fale com o administrador da clínica.'
              : 'Período de teste sem custos e sem fidelidade.'}
          </span>
        </div>
      </div>

      {/* Coluna Direita (56%): Container único centralizado (max-w-[700px]) alinhado ao centro óptico do formulário */}
      <div className="hidden lg:flex lg:w-[56%] bg-canvas items-center justify-center p-10 xl:p-14 relative overflow-hidden">
        <div
          data-testid="login-brand-column"
          className="w-full max-w-[700px] mx-auto my-auto flex flex-col gap-6"
        >
          {/* Título e subtítulo alinhados à mesma borda esquerda da ilustração e das provas */}
          <div data-testid="login-brand-header" className="space-y-2">
            <h2 className="text-[26px] xl:text-[28px] font-semibold text-ink-primary leading-snug">
              Especialista, sala e equipamento reservados em um único movimento.
            </h2>
            <p className="text-[15px] text-ink-secondary leading-relaxed">
              Cada procedimento cruza a agenda médica, a sala preparada e o tempo de esterilização antes de confirmar o horário do paciente.
            </p>
          </div>

          {/* Ilustração Principal: Matriz de Alocação Atômica com eixo LINEAR (20 min = 84px; 40m = 168px; 20m = 84px; 10m = 42px) */}
          <div
            data-testid="login-brand-illustration"
            className="w-full bg-surface border border-border-subtle rounded-2xl p-6 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-semibold text-ink-primary">
                  Clínica exemplo · Agenda do dia
                </span>
                <span className="px-2 py-0.5 rounded-md bg-sunken text-ink-secondary text-[12px] font-medium">
                  Exemplo ilustrativo
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border border-[var(--status-confirmed-border)]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>3 recursos vinculados</span>
              </span>
            </div>

            <svg
              role="img"
              aria-label="Exemplo ilustrativo da matriz de alocação com escala linear de 20 em 20 minutos das 08:40 às 10:20: um atendimento de 40 minutos das 09:00 às 09:40 ocupa simultaneamente especialista, sala de exame com 20 minutos adicionais de limpeza e equipamento com 10 minutos de limpeza."
              viewBox="0 0 640 246"
              className="w-full h-auto overflow-visible"
            >
              <defs>
                <pattern
                  id="login-cleanup-hatch"
                  width="8"
                  height="8"
                  patternTransform="rotate(-45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="8" height="8" fill="var(--bg-sunken)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="8"
                    stroke="var(--text-muted)"
                    strokeOpacity="0.4"
                    strokeWidth="3"
                  />
                </pattern>
              </defs>

              {/* Cabeçalho de Horas: Escala LINEAR exata de 20 em 20 min (84px por 20 min; 4,2px/min) */}
              <g className="tabular-nums" fill="var(--text-secondary)" fontSize="12" fontWeight="500">
                <text x="10" y="18">Recurso clínico</text>
                <text x="200" y="18" textAnchor="middle">08:40</text>
                <text x="284" y="18" textAnchor="middle" fill="var(--accent-primary)" fontWeight="600">09:00</text>
                <text x="368" y="18" textAnchor="middle">09:20</text>
                <text x="452" y="18" textAnchor="middle">09:40</text>
                <text x="536" y="18" textAnchor="middle">10:00</text>
                <text x="620" y="18" textAnchor="middle">10:20</text>
              </g>

              {/* Linhas verticais da grade (espaçamento linear idêntico de 84px) */}
              <g stroke="var(--border-subtle)" strokeWidth="1">
                <line x1="200" y1="28" x2="200" y2="232" />
                <line x1="284" y1="28" x2="284" y2="232" strokeDasharray="3 3" />
                <line x1="368" y1="28" x2="368" y2="232" strokeDasharray="3 3" />
                <line x1="452" y1="28" x2="452" y2="232" strokeDasharray="3 3" />
                <line x1="536" y1="28" x2="536" y2="232" strokeDasharray="3 3" />
                <line x1="620" y1="28" x2="620" y2="232" strokeDasharray="3 3" />
              </g>

              {/* Divisórias horizontais das 3 raias */}
              <g stroke="var(--border-subtle)" strokeWidth="1">
                <line x1="0" y1="28" x2="632" y2="28" />
                <line x1="0" y1="96" x2="632" y2="96" />
                <line x1="0" y1="164" x2="632" y2="164" />
                <line x1="0" y1="232" x2="632" y2="232" />
              </g>

              {/* Rótulo Raia 1: Especialista (Círculo) */}
              <g transform="translate(8, 44)">
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="var(--res-specialist-bg)"
                  stroke="var(--res-specialist-border)"
                />
                <text
                  x="18"
                  y="22"
                  textAnchor="middle"
                  fill="var(--res-specialist-text)"
                  fontSize="11"
                  fontWeight="600"
                >
                  EV
                </text>
                <text x="42" y="15" fill="var(--text-primary)" fontSize="13" fontWeight="600">
                  Especialista
                </text>
                <text x="42" y="31" fill="var(--text-secondary)" fontSize="12">
                  Radiologia vascular
                </text>
              </g>

              {/* Rótulo Raia 2: Sala (Quadrado) */}
              <g transform="translate(8, 112)">
                <rect
                  x="2"
                  y="2"
                  width="32"
                  height="32"
                  rx="6"
                  fill="var(--res-room-bg)"
                  stroke="var(--res-room-border)"
                />
                <text
                  x="18"
                  y="22"
                  textAnchor="middle"
                  fill="var(--res-room-text)"
                  fontSize="11"
                  fontWeight="600"
                >
                  S1
                </text>
                <text x="42" y="15" fill="var(--text-primary)" fontSize="13" fontWeight="600">
                  Sala de exame 01
                </text>
                <text x="42" y="31" fill="var(--text-secondary)" fontSize="12">
                  Ambiente preparado
                </text>
              </g>

              {/* Rótulo Raia 3: Equipamento (Chanfrado) */}
              <g transform="translate(8, 180)">
                <rect
                  x="2"
                  y="2"
                  width="32"
                  height="32"
                  rx="9"
                  fill="var(--res-equipment-bg)"
                  stroke="var(--res-equipment-border)"
                />
                <text
                  x="18"
                  y="22"
                  textAnchor="middle"
                  fill="var(--res-equipment-text)"
                  fontSize="11"
                  fontWeight="600"
                >
                  UD
                </text>
                <text x="42" y="15" fill="var(--text-primary)" fontSize="13" fontWeight="600">
                  Ultrassom Doppler
                </text>
                <text x="42" y="31" fill="var(--text-secondary)" fontSize="12">
                  Unidade #01 · HD
                </text>
              </g>

              {/* Bloco Raia 1: Atendimento 09:00–09:40 (40 min = 168px exatos: x=284 a x=452) */}
              <g className="matrix-anim-lane-1">
                <rect
                  data-testid="svg-service-block-1"
                  x="284"
                  y="38"
                  width="168"
                  height="48"
                  rx="8"
                  fill="var(--status-confirmed-bg)"
                  stroke="var(--status-confirmed-border)"
                  strokeWidth="1.5"
                />
                <rect
                  x="284"
                  y="38"
                  width="4"
                  height="48"
                  rx="2"
                  fill="var(--status-confirmed-border)"
                />
                <text x="298" y="58" fill="var(--status-confirmed-text)" fontSize="13" fontWeight="600">
                  Paciente exemplo
                </text>
                <text x="298" y="75" fill="var(--status-confirmed-text)" fontSize="11.5" opacity="0.92">
                  Eco-Doppler · 40 min
                </text>
              </g>

              {/* Bloco Raia 2: Atendimento 09:00–09:40 (40 min = 168px) + Limpeza 09:40–10:00 (20 min = 84px: x=452 a x=536) */}
              <g className="matrix-anim-lane-2">
                <rect
                  data-testid="svg-service-block-2"
                  x="284"
                  y="106"
                  width="168"
                  height="48"
                  rx="8"
                  fill="var(--status-confirmed-bg)"
                  stroke="var(--status-confirmed-border)"
                  strokeWidth="1.5"
                />
                <rect
                  x="284"
                  y="106"
                  width="4"
                  height="48"
                  rx="2"
                  fill="var(--status-confirmed-border)"
                />
                <text x="298" y="126" fill="var(--status-confirmed-text)" fontSize="13" fontWeight="600">
                  Paciente exemplo
                </text>
                <text x="298" y="143" fill="var(--status-confirmed-text)" fontSize="11.5" opacity="0.92">
                  Atendimento · 40 min
                </text>
              </g>

              <g className="matrix-anim-cleanup">
                <rect
                  data-testid="svg-cleanup-room-20m"
                  x="452"
                  y="106"
                  width="84"
                  height="48"
                  rx="7"
                  fill="url(#login-cleanup-hatch)"
                  stroke="var(--border-strong)"
                  strokeDasharray="3 2"
                />
                <text x="544" y="134" fill="var(--text-secondary)" fontSize="11.5" fontWeight="600">
                  Limpeza 20 min
                </text>
              </g>

              {/* Bloco Raia 3: Atendimento 09:00–09:40 (40 min = 168px) + Limpeza 09:40–09:50 (10 min = 42px: x=452 a x=494) */}
              <g className="matrix-anim-lane-3">
                <rect
                  data-testid="svg-service-block-3"
                  x="284"
                  y="174"
                  width="168"
                  height="48"
                  rx="8"
                  fill="var(--status-confirmed-bg)"
                  stroke="var(--status-confirmed-border)"
                  strokeWidth="1.5"
                />
                <rect
                  x="284"
                  y="174"
                  width="4"
                  height="48"
                  rx="2"
                  fill="var(--status-confirmed-border)"
                />
                <text x="298" y="194" fill="var(--status-confirmed-text)" fontSize="13" fontWeight="600">
                  Paciente exemplo
                </text>
                <text x="298" y="211" fill="var(--status-confirmed-text)" fontSize="11.5" opacity="0.92">
                  Uso do aparelho · 40 min
                </text>
              </g>

              <g className="matrix-anim-cleanup">
                <rect
                  data-testid="svg-cleanup-equip-10m"
                  x="452"
                  y="174"
                  width="42"
                  height="48"
                  rx="7"
                  fill="url(#login-cleanup-hatch)"
                  stroke="var(--border-strong)"
                  strokeDasharray="3 2"
                />
                <text x="502" y="202" fill="var(--text-secondary)" fontSize="11.5" fontWeight="600">
                  Limpeza 10 min
                </text>
              </g>

              {/* Conector Vertical Atômico unindo as 3 raias em 09:00 */}
              <g>
                <line
                  x1="274"
                  y1="62"
                  x2="274"
                  y2="198"
                  stroke="var(--accent-primary)"
                  strokeWidth="2"
                  className="matrix-anim-connector"
                />
                <circle cx="274" cy="62" r="4" fill="var(--accent-primary)" />
                <circle cx="274" cy="130" r="4" fill="var(--accent-primary)" />
                <circle cx="274" cy="198" r="4" fill="var(--accent-primary)" />
              </g>
            </svg>
          </div>

          {/* 3 Provas Verdadeiras: 14px, contraste AA, no máximo 2 linhas cada, sem divisores pesados */}
          <div
            data-testid="login-brand-proofs"
            className="w-full grid grid-cols-3 gap-6 pt-1"
          >
            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-ink-primary leading-snug">
                Sem colisão de agenda
              </div>
              <p className="text-[14px] text-ink-secondary leading-snug">
                Especialista, sala e aparelho reservados juntos.
              </p>
            </div>

            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-ink-primary leading-snug">
                Sinal e fila ativa
              </div>
              <p className="text-[14px] text-ink-secondary leading-snug">
                Retenção configurável e oferta automática na fila.
              </p>
            </div>

            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-ink-primary leading-snug">
                Auditoria imutável
              </div>
              <p className="text-[14px] text-ink-secondary leading-snug">
                Histórico íntegro de todas as operações clínicas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
