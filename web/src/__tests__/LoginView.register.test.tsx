/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LoginView } from '../LoginView';

describe('LoginView - Cadastro de Nova Clínica e Usuário', () => {
  const defaultProps = {
    email: '',
    password: '',
    onEmailChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onRegister: vi.fn().mockResolvedValue(undefined),
    isLoggingIn: false,
    loginError: null,
    isDark: false,
    onToggleTheme: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renderiza abas "Entrar" e "Cadastrar" e link para alternar para cadastro na tela de login', () => {
    render(<LoginView {...defaultProps} />);

    expect(screen.getByTestId('tab-login')).toBeDefined();
    expect(screen.getByTestId('tab-register')).toBeDefined();
    expect(screen.getByTestId('toggle-to-register')).toBeDefined();
    expect(screen.getByText(/Não tem uma conta\?/i)).toBeDefined();
    expect(screen.getByRole('heading', { name: /Bem-vindo de volta/i })).toBeDefined();
  });

  it('2. Alterna para o formulário de cadastro ao clicar na aba "Cadastrar" ou no link', async () => {
    render(<LoginView {...defaultProps} />);

    // Clica no link "Cadastre sua clínica"
    fireEvent.click(screen.getByTestId('toggle-to-register'));

    expect(screen.getByRole('heading', { name: /Crie sua clínica/i })).toBeDefined();
    expect(screen.getByTestId('register-name-input')).toBeDefined();
    expect(screen.getByTestId('register-workspace-name-input')).toBeDefined();
    expect(screen.getByTestId('register-email-input')).toBeDefined();
    expect(screen.getByTestId('register-password-input')).toBeDefined();
    expect(screen.getByTestId('register-submit-button')).toBeDefined();
    expect(screen.getByTestId('toggle-to-login')).toBeDefined();
  });

  it('3. Valida campos obrigatórios no cliente antes de submeter', async () => {
    const onRegisterMock = vi.fn().mockResolvedValue(undefined);
    render(<LoginView {...defaultProps} onRegister={onRegisterMock} initialMode="register" />);

    const submitBtn = screen.getByTestId('register-submit-button');

    // Submete vazio
    fireEvent.click(submitBtn);
    expect(screen.getByText(/Informe seu nome completo/i)).toBeDefined();
    expect(onRegisterMock).not.toHaveBeenCalled();

    // Preenche nome, mas deixa clínica vazia
    fireEvent.change(screen.getByTestId('register-name-input'), { target: { value: 'Dra. Ana Paula' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText(/Informe o nome da clínica ou consultório/i)).toBeDefined();
    expect(onRegisterMock).not.toHaveBeenCalled();

    // Preenche clínica, mas deixa email inválido
    fireEvent.change(screen.getByTestId('register-workspace-name-input'), { target: { value: 'Clínica Bem Viver' } });
    fireEvent.change(screen.getByTestId('register-email-input'), { target: { value: 'email-invalido' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText(/Informe um e-mail corporativo válido/i)).toBeDefined();
    expect(onRegisterMock).not.toHaveBeenCalled();

    // Email válido, mas senha com menos de 8 caracteres
    fireEvent.change(screen.getByTestId('register-email-input'), { target: { value: 'ana@bemviver.com.br' } });
    fireEvent.change(screen.getByTestId('register-password-input'), { target: { value: '123' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText(/A senha deve conter no mínimo 8 caracteres/i)).toBeDefined();
    expect(onRegisterMock).not.toHaveBeenCalled();
  });

  it('4. Submete com sucesso os dados preenchidos para onRegister', async () => {
    const onRegisterMock = vi.fn().mockResolvedValue(undefined);
    render(<LoginView {...defaultProps} onRegister={onRegisterMock} initialMode="register" />);

    fireEvent.change(screen.getByTestId('register-name-input'), { target: { value: '  Dra. Sofia Lima  ' } });
    fireEvent.change(screen.getByTestId('register-workspace-name-input'), { target: { value: '  Clínica Imagem Alpha  ' } });
    fireEvent.change(screen.getByTestId('register-email-input'), { target: { value: '  sofia@alpha.com.br  ' } });
    fireEvent.change(screen.getByTestId('register-password-input'), { target: { value: 'SenhaSegura!123' } });

    fireEvent.click(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(onRegisterMock).toHaveBeenCalledWith({
        name: 'Dra. Sofia Lima',
        workspaceName: 'Clínica Imagem Alpha',
        email: 'sofia@alpha.com.br',
        password: 'SenhaSegura!123',
      });
    });
  });

  it('5. Exibe mensagem amigável de erro se o e-mail já estiver cadastrado', async () => {
    const onRegisterMock = vi.fn().mockRejectedValue(new Error('E-mail already registered'));
    render(<LoginView {...defaultProps} onRegister={onRegisterMock} initialMode="register" />);

    fireEvent.change(screen.getByTestId('register-name-input'), { target: { value: 'Dr. Roberto' } });
    fireEvent.change(screen.getByTestId('register-workspace-name-input'), { target: { value: 'BioCheck' } });
    fireEvent.change(screen.getByTestId('register-email-input'), { target: { value: 'roberto@biocheck.com.br' } });
    fireEvent.change(screen.getByTestId('register-password-input'), { target: { value: 'Segura!888' } });

    fireEvent.click(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(screen.getByText(/Este e-mail já está cadastrado/i)).toBeDefined();
    });
  });

  it('6. Alterna de volta para Login ao clicar em "Fazer login" ou na aba "Entrar"', async () => {
    render(<LoginView {...defaultProps} initialMode="register" />);

    expect(screen.getByRole('heading', { name: /Crie sua clínica/i })).toBeDefined();

    fireEvent.click(screen.getByTestId('toggle-to-login'));

    expect(screen.getByRole('heading', { name: /Bem-vindo de volta/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Entrar$/i })).toBeDefined();
  });
});
