import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Moon, Sun } from 'lucide-react';
import { apiRequest } from './api';

interface ResetPasswordViewProps {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({
  token,
  onSuccess,
  onCancel,
  isDark,
  onToggleTheme,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleKeyModifiers = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newPassword || newPassword.length < 8) {
      setErrorMessage('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('As senhas não coincidem. Digite a mesma senha nos dois campos.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/auth/reset-password', {
        method: 'POST',
        body: {
          token,
          password: newPassword,
        },
      });

      setSuccessMessage(res.message || 'Senha redefinida com sucesso! Você já pode entrar com a nova senha.');
      setTimeout(() => {
        onSuccess();
      }, 2500);
    } catch (err: any) {
      const raw = err?.message || 'Falha ao redefinir a senha.';
      if (/invalid|expired/i.test(raw)) {
        setErrorMessage('O link de redefinição expirou ou é inválido. Solicite um novo link.');
      } else {
        setErrorMessage(raw);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-primary flex flex-col justify-between p-6 sm:p-10">
      {/* Topo */}
      <div className="flex items-center justify-between max-w-[480px] w-full mx-auto">
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
            <span className="text-[16px] font-semibold text-ink-primary">SlotMatrix</span>
            <span className="hidden sm:inline-block ml-2 text-[13px] text-ink-secondary">
              Coordenação clínica
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-canvas hover:bg-sunken text-[13px] text-ink-secondary hover:text-ink-primary transition cursor-pointer"
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

      {/* Card Central */}
      <div className="max-w-[420px] w-full mx-auto bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-[24px] font-semibold text-ink-primary leading-tight">
            Redefinir senha
          </h1>
          <p className="text-[14px] text-ink-secondary leading-relaxed">
            Crie uma nova senha segura para acessar sua conta no SlotMatrix.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            data-testid="reset-password-error-alert"
            className="p-3.5 rounded-xl border bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error-text)] flex items-start gap-2.5 text-[13px]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage ? (
          <div
            role="status"
            data-testid="reset-password-success-alert"
            className="p-4 rounded-xl border bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)] space-y-3"
          >
            <div className="flex items-start gap-2.5 text-[14px]">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={2} />
              <span>{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={onSuccess}
              className="w-full h-10 rounded-lg bg-[var(--btn-primary-bg)] text-white text-[14px] font-semibold hover:bg-[var(--btn-primary-hover)] transition cursor-pointer"
            >
              Fazer login agora
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="new-password-input"
                className="block text-[13px] font-medium text-ink-primary mb-1.5"
              >
                Nova senha (mínimo de 8 caracteres)
              </label>
              <div className="relative">
                <input
                  id="new-password-input"
                  data-testid="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  onKeyUp={handleKeyModifiers}
                  onKeyDown={handleKeyModifiers}
                  placeholder="Digite sua nova senha"
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
            </div>

            <div>
              <label
                htmlFor="confirm-password-input"
                className="block text-[13px] font-medium text-ink-primary mb-1.5"
              >
                Confirmar nova senha
              </label>
              <input
                id="confirm-password-input"
                data-testid="confirm-password-input"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Repita a nova senha"
                className="w-full h-12 px-3.5 rounded-lg bg-surface border border-border-strong text-[14px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus-visible:outline-2 focus-visible:outline-brand transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="reset-password-submit-btn"
              className="w-full h-12 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white font-semibold text-[15px] shadow-sm disabled:bg-sunken disabled:text-ink-muted disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando nova senha...</span>
                </>
              ) : (
                <span>Salvar nova senha</span>
              )}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="text-[13px] text-brand hover:underline font-medium cursor-pointer"
              >
                Voltar para o login
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Rodapé */}
      <div className="text-center text-[13px] text-ink-secondary">
        SlotMatrix · Coordenação de agendas clínicas
      </div>
    </div>
  );
};
