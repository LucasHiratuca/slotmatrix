/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ResetPasswordView } from '../ResetPasswordView';

describe('ResetPasswordView', () => {
  const defaultProps = {
    token: 'valid-reset-token-123',
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
    isDark: false,
    onToggleTheme: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renderiza campos de nova senha e confirmação', () => {
    render(<ResetPasswordView {...defaultProps} />);

    expect(screen.getByRole('heading', { name: /Redefinir senha/i })).toBeDefined();
    expect(screen.getByTestId('new-password-input')).toBeDefined();
    expect(screen.getByTestId('confirm-password-input')).toBeDefined();
    expect(screen.getByTestId('reset-password-submit-btn')).toBeDefined();
  });

  it('2. Valida tamanho mínimo de senha e senhas diferentes', () => {
    render(<ResetPasswordView {...defaultProps} />);

    // Senha muito curta
    fireEvent.change(screen.getByTestId('new-password-input'), { target: { value: '123' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit-btn'));

    expect(screen.getByText(/A nova senha deve ter no mínimo 8 caracteres/i)).toBeDefined();

    // Senhas diferentes
    fireEvent.change(screen.getByTestId('new-password-input'), { target: { value: 'SenhaSegura123' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'OutraSenha123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit-btn'));

    expect(screen.getByText(/As senhas não coincidem/i)).toBeDefined();
  });

  it('3. Submete com sucesso e exibe mensagem de sucesso', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: 'Senha redefinida com sucesso!',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    render(<ResetPasswordView {...defaultProps} />);

    fireEvent.change(screen.getByTestId('new-password-input'), { target: { value: 'NovaSenhaSegura!123' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'NovaSenhaSegura!123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('reset-password-success-alert')).toBeDefined();
      expect(screen.getByText(/Senha redefinida com sucesso!/i)).toBeDefined();
    });

    globalThis.fetch = originalFetch;
  });
});
