import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';

const realFetch = globalThis.fetch;

const BANNED_UI_TERMS = [
  'BookableResource',
  'ServiceProcedure',
  'Turnaround',
  'cleanupMinutes',
  'prepMinutes',
  'serviceSlot',
  'SlotOffer',
  'SecurityDeposit',
  'AuditLog',
  'PlanQuota',
  'CanRegisterResourceSpecification',
  'No-Show',
  'Webhook',
  'UTC',
  'Wizard',
  'Timeline',
  'Trocar Conta',
  'Smart Waitlist',
  '(VIP)',
];

function assertNoBannedTermsInDom() {
  const text = document.body.textContent ?? '';
  for (const term of BANNED_UI_TERMS) {
    expect(text).not.toContain(term);
  }
}

describe('Fase 1, Fase 2 & Fase 3B Etapa 0 — Verificação End-to-End contra API Real (http://localhost:18081)', () => {
  let consoleErrors: unknown[][] = [];
  let consoleWarnings: unknown[][] = [];
  let sessionCookie = '';

  beforeEach(() => {
    localStorage.clear();
    sessionCookie = '';
    window.history.pushState({}, '', '/');
    consoleErrors = [];
    consoleWarnings = [];

    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      consoleWarnings.push(args);
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' && input.startsWith('/api')
          ? `http://localhost:18081${input}`
          : input;
      const headers = new Headers(init?.headers ?? {});
      if (sessionCookie) {
        headers.set('Cookie', sessionCookie);
      }
      const res = await realFetch(url, { ...init, headers });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        const match = /slotmatrix_session=([^;]+)/.exec(setCookie);
        if (match) {
          sessionCookie = match[1] ? `slotmatrix_session=${match[1]}` : '';
        }
      }
      if (String(url).endsWith('/api/auth/logout')) {
        sessionCookie = '';
      }
      return res;
    };
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('1. owner@vitascan.test (PRO/ACTIVE): login, navegação nas 8 páginas da sidebar, percentuais com vírgula pt-BR, zero termos técnicos proibidos e refresh sem erros no console', async () => {
    render(<App />);
    assertNoBannedTermsInDom();

    // Verifica que os campos começam vazios por padrão antes do clique no botão demo
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    expect(emailInput.value).toBe('');

    fireEvent.click(screen.getByText(/VitaScan Diagnósticos \(Proprietário\(a\) · Plano Pro\)/i));

    await waitFor(() => {
      expect(screen.getByTestId('plan-usage-bar').textContent).toContain(
        'Plano Pro · 6 de 40 recursos',
      );
    });
    expect(screen.getAllByText(/Proprietária|Proprietário\(a\)/i).length).toBeGreaterThan(0);
    assertNoBannedTermsInDom();

    // 1. Visão geral
    fireEvent.click(screen.getByRole('button', { name: /Visão geral/i }));
    await waitFor(() => {
      expect(screen.getByText(/Taxa de faltas/i)).toBeTruthy();
      expect(screen.getByText(/Receita protegida por sinais/i)).toBeTruthy();
      expect(screen.getByText(/Receita recuperada pela lista de espera/i)).toBeTruthy();
    });
    // Verifica formatação pt-BR com vírgula nos percentuais decimais
    expect(document.body.textContent).not.toMatch(/\d+\.\d+%/);
    assertNoBannedTermsInDom();

    // 2. Agenda
    fireEvent.click(screen.getByRole('button', { name: /^Agenda$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Atualizado/i)).toBeTruthy();
    });
    expect(document.body.textContent).not.toMatch(/\d+\.\d+%/);
    assertNoBannedTermsInDom();

    // 3. Reservas
    fireEvent.click(screen.getByRole('button', { name: /Reservas/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Novo agendamento/i })).toBeTruthy();
    });
    assertNoBannedTermsInDom();

    // 4. Lista de espera (sem ID técnico #794895ae e sem estado contraditório)
    fireEvent.click(screen.getByRole('button', { name: /Lista de espera/i }));
    await waitFor(() => {
      expect(screen.getByText(/Pacientes na fila/i)).toBeTruthy();
    });
    expect(document.body.textContent).not.toMatch(/Convertida na reserva #[a-f0-9]/i);
    assertNoBannedTermsInDom();

    // 5. Recursos
    fireEvent.click(screen.getByRole('button', { name: /^Recursos/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Novo recurso/i })).toBeTruthy();
    });
    assertNoBannedTermsInDom();

    // 6. Procedimentos
    fireEvent.click(screen.getByRole('button', { name: /Procedimentos/i }));
    await waitFor(() => {
      expect(screen.getByText(/Eco-Doppler Vascular Completo/i)).toBeTruthy();
    });
    assertNoBannedTermsInDom();

    // 7. Plano e cobrança
    fireEvent.click(screen.getByRole('button', { name: /Plano e cobrança/i }));
    await waitFor(() => {
      expect(screen.getByText(/Assinatura ativa da clínica/i)).toBeTruthy();
    });
    assertNoBannedTermsInDom();

    // 8. Auditoria
    fireEvent.click(screen.getByRole('button', { name: /Auditoria/i }));
    await waitFor(() => {
      expect(screen.getByText(/Registro de auditoria/i)).toBeTruthy();
    });
    assertNoBannedTermsInDom();

    // Simular Refresh (F5) mantendo localStorage
    cleanup();
    render(<App />);
    expect(screen.getByTestId('workspace-loading-skeleton')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('plan-usage-bar').textContent).toContain(
        'Plano Pro · 6 de 40 recursos',
      );
    });

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
  });

  it('2. admin@vitascan.test, coord@vitascan.test e spec@vitascan.test: login, RBAC em pt-BR e refresh em cada papel', async () => {
    for (const persona of [
      { email: 'admin@vitascan.test', expectedRole: /Administração|Administrador\(a\)/i, seesAdmin: true },
      { email: 'coord@vitascan.test', expectedRole: /Coordenação/i, seesAdmin: false },
      { email: 'spec@vitascan.test', expectedRole: /Especialista/i, seesAdmin: false },
    ]) {
      localStorage.clear();
      sessionCookie = '';
      cleanup();
      render(<App />);

      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: persona.email } });
      fireEvent.change(passwordInput, { target: { value: 'Passw0rd!' } });
      fireEvent.click(screen.getByRole('button', { name: /^Entrar$/i }));

      await waitFor(() => {
        expect(screen.getByTestId('plan-usage-bar').textContent).toContain(
          'Plano Pro · 6 de 40 recursos',
        );
      });
      expect(screen.getAllByText(persona.expectedRole).length).toBeGreaterThan(0);

      if (persona.seesAdmin) {
        expect(screen.queryByRole('button', { name: /Auditoria/i })).toBeTruthy();
      } else {
        expect(screen.queryByRole('button', { name: /Auditoria/i })).toBeNull();
      }

      // Refresh mantendo sessão
      cleanup();
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId('plan-usage-bar').textContent).toContain(
          'Plano Pro · 6 de 40 recursos',
        );
      });
      expect(screen.getAllByText(persona.expectedRole).length).toBeGreaterThan(0);
    }

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
  });

  it('3. owner@aura.test (STARTER/TRIALING, 5 de 5): drawer de Novo recurso exibe painel de upgrade + mensagem amigável de limite sem erro de render + refresh', async () => {
    render(<App />);

    fireEvent.click(screen.getByText(/Estúdio Aura \(Proprietário\(a\) · Plano Starter\)/i));

    await waitFor(() => {
      expect(screen.getByTestId('plan-usage-bar').textContent).toContain(
        'Plano Starter · 5 de 5 recursos',
      );
    });
    expect(screen.getByText('Período de teste')).toBeTruthy();
    expect(screen.getAllByText(/Proprietária|Proprietário\(a\)/i).length).toBeGreaterThan(0);

    // Ir para a página Recursos e abrir o drawer "Novo recurso"
    fireEvent.click(screen.getByRole('button', { name: /^Recursos/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Novo recurso/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Novo recurso/i }));

    // Deve exibir o painel de upgrade informando o limite 5 de 5
    await waitFor(() => {
      expect(screen.getByTestId('quota-upgrade-panel')).toBeTruthy();
    });

    // Testar também o envio ao servidor clicando em "Preencher formulário mesmo assim"
    fireEvent.click(screen.getByRole('button', { name: /Preencher formulário mesmo assim/i }));
    const nameInput = screen.getByPlaceholderText(/Ex\.: Ultrassom Portátil 03/i);
    fireEvent.change(nameInput, { target: { value: 'Equipamento Excedente 06' } });
    const capInput = screen.getByPlaceholderText(/Ex\.: Doppler vascular/i);
    fireEvent.change(capInput, { target: { value: 'Doppler vascular' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar recurso/i }));

    await waitFor(() => {
      expect(screen.getByTestId('resource-submit-error')).toBeTruthy();
    });
    assertNoBannedTermsInDom();

    // Simular Refresh (F5)
    cleanup();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('plan-usage-bar').textContent).toContain(
        'Plano Starter · 5 de 5 recursos',
      );
    });

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
  });

  it('4. Rota pública /book/vitascan-diagnosticos: acesso direto, sem termos proibidos e refresh sem erros', async () => {
    window.history.pushState({}, '', '/book/vitascan-diagnosticos');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('VitaScan Diagnósticos')).toBeTruthy();
    });
    expect(screen.getByText(/Confirmar reserva online/i)).toBeTruthy();
    assertNoBannedTermsInDom();

    // Refresh na rota pública
    cleanup();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('VitaScan Diagnósticos')).toBeTruthy();
    });

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
  });
});
