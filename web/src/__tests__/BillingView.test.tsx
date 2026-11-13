/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BillingView } from '../BillingView';
import { WorkspaceOverview } from '../api';

const mockStarterOverview: WorkspaceOverview = {
  id: 'ws-starter-1',
  name: 'Estúdio Aura',
  slug: 'estudio-aura',
  role: 'OWNER',
  subscription: {
    plan: 'STARTER',
    status: 'TRIALING',
    trialEndsAt: null,
    currentPeriodEnd: null,
    externalCustomerId: null,
  },
  entitlements: {
    planLabel: 'Plano Starter',
    subscriptionHealthy: true,
    maxActiveResources: 5,
    maxBookingsPerMonth: 100,
    smartWaitlistEnabled: false,
    securityDepositEnabled: false,
    publicBookingPortalEnabled: false,
    vipWaitlistPriorityEnabled: false,
    exportableAuditLogs: false,
  },
  quota: {
    resourcesUsed: 2,
    resourcesMax: 5,
    usagePercent: 40,
  },
};

describe('BillingView (Stripe Subscription UI, Feedback & Security)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    (window as any).location = originalLocation;
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    (window as any).location = originalLocation;
  });

  it('1. Renderiza planos com Plano Starter como "Gratuito" e botão atual desabilitado', () => {
    render(
      <BillingView
        token="mock-token"
        workspaceId="ws-starter-1"
        overview={mockStarterOverview}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('Gratuito')).toBeDefined();
    expect(screen.getByText('Plano atual ativo')).toBeDefined();
    expect(screen.getByRole('button', { name: /Assinar Plano Pro/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Assinar Plano Enterprise/i })).toBeDefined();
  });

  it('2. "Gerenciar forma de pagamento" fica desabilitado para clínica sem customerId', () => {
    render(
      <BillingView
        token="mock-token"
        workspaceId="ws-starter-1"
        overview={mockStarterOverview}
        onRefresh={vi.fn()}
      />,
    );

    const portalBtn = screen.getByRole('button', { name: /Gerenciar forma de pagamento/i });
    expect(portalBtn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Assine um plano para gerenciar o pagamento/i)).toBeDefined();
  });

  it('3. Dispara POST /billing/checkout ao clicar em "Assinar Plano Pro" e redireciona', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/billing/checkout')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_mock_123' }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    // Mock window.location.href assignment
    delete (window as any).location;
    window.location = { href: '' } as any;

    render(
      <BillingView
        token="mock-token"
        workspaceId="ws-starter-1"
        overview={mockStarterOverview}
        onRefresh={vi.fn()}
      />,
    );

    const proBtn = screen.getByRole('button', { name: /Assinar Plano Pro/i });
    fireEvent.click(proBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
      expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_mock_123');
    });
  });

  it('4. Exibe mensagem amigável em pt-BR quando Stripe não configurado (NUNCA "Unexpected error")', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/billing/checkout')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            error: 'BILLING_NOT_CONFIGURED',
            message: 'O faturamento com Stripe ainda não foi configurado nesta instalação.',
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    render(
      <BillingView
        token="mock-token"
        workspaceId="ws-starter-1"
        overview={mockStarterOverview}
        onRefresh={vi.fn()}
      />,
    );

    const proBtn = screen.getByRole('button', { name: /Assinar Plano Pro/i });
    fireEvent.click(proBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/O pagamento ainda não foi configurado nesta instalação/i),
      ).toBeDefined();
      expect(screen.queryByText(/Unexpected error/i)).toBeNull();
    });
  });

  it('5. Exibe banner de confirmação com polling curto ao retornar do checkout (?billing_success=true)', async () => {
    window.history.replaceState({}, '', '/?billing_success=true&plan=PRO');
    const refreshMock = vi.fn().mockResolvedValue(undefined);

    render(
      <BillingView
        token="mock-token"
        workspaceId="ws-starter-1"
        overview={mockStarterOverview}
        onRefresh={refreshMock}
      />,
    );

    expect(
      screen.getByText(/Confirmando seu pagamento do Plano Pro junto ao Stripe/i),
    ).toBeDefined();
  });

  it('6. Exibe banner de alerta persistente quando a clínica está com status PAST_DUE', () => {
    const pastDueOverview: WorkspaceOverview = {
      ...mockStarterOverview,
      subscription: {
        plan: 'PRO',
        status: 'PAST_DUE',
        trialEndsAt: null,
        currentPeriodEnd: null,
        externalCustomerId: 'cus_past_due_123',
      },
      entitlements: {
        ...mockStarterOverview.entitlements,
        subscriptionHealthy: false,
      },
    };

    render(
      <BillingView
        token="mock-token"
        workspaceId="ws-starter-1"
        overview={pastDueOverview}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText(/Pendência no pagamento da assinatura/i)).toBeDefined();
    expect(
      screen.getByText(/Novos agendamentos estão temporariamente bloqueados/i),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Regularizar pagamento agora/i })).toBeDefined();
  });
});
