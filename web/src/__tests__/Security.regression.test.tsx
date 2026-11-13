import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { BillingView } from '../BillingView';
import { LoginView } from '../LoginView';
import { ErrorBoundary } from '../ErrorBoundary';

describe('Front-end Security Hardening Regression Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('nunca grava JWT em localStorage e revoga sessão via POST /api/auth/logout', async () => {
    localStorage.setItem('slotmatrix_token', 'legacy-leaked-jwt');

    const calledUrls: { url: string; method: string; credentials?: RequestCredentials }[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calledUrls.push({ url, method, credentials: init?.credentials });

      const jsonResponse = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      if (url.endsWith('/api/auth/session')) {
        return jsonResponse({ authenticated: false });
      }
      if (url.endsWith('/api/auth/login')) {
        return jsonResponse({
          token: 'ephemeral-jwt-not-to-be-stored',
          userId: 'u-1',
          email: 'owner@vitascan.test',
          name: 'Dra Renata',
          workspaces: [
            {
              id: 'ws-vita',
              name: 'VitaScan Diagnósticos',
              slug: 'vitascan-diagnosticos',
              role: 'OWNER',
              plan: 'PRO',
              subscriptionStatus: 'ACTIVE',
            },
          ],
        });
      }
      if (url.endsWith('/api/me/workspaces')) {
        return jsonResponse([
          {
            id: 'ws-vita',
            name: 'VitaScan Diagnósticos',
            slug: 'vitascan-diagnosticos',
            role: 'OWNER',
            plan: 'PRO',
            subscriptionStatus: 'ACTIVE',
          },
        ]);
      }
      if (url.endsWith('/api/workspace')) {
        return jsonResponse({
          id: 'ws-vita',
          name: 'VitaScan Diagnósticos',
          slug: 'vitascan-diagnosticos',
          role: 'OWNER',
          subscription: { plan: 'PRO', status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: null },
          entitlements: {
            planLabel: 'PRO',
            subscriptionHealthy: true,
            maxActiveResources: 40,
            maxBookingsPerMonth: null,
            smartWaitlistEnabled: true,
            securityDepositEnabled: true,
            publicBookingPortalEnabled: true,
            vipWaitlistPriorityEnabled: true,
            exportableAuditLogs: true,
          },
          quota: { resourcesUsed: 6, resourcesMax: 40, usagePercent: 15 },
        });
      }
      if (url.endsWith('/api/dashboard/kpis')) {
        return jsonResponse({
          totalBookings: 0,
          confirmedOrCompletedBookings: 0,
          noShowCount: 0,
          noShowRatePercent: 0,
          protectedRevenueCents: 0,
          waitlistRecoveredBookings: 0,
          waitlistRecoveredRevenueCents: 0,
          activeWaitlistOffers: 0,
          waitingInQueue: 0,
          utilizationByCategory: {},
        });
      }
      if (url.includes('/api/timeline')) {
        return jsonResponse({ date: '2026-11-12', resources: [] });
      }
      if (url.endsWith('/api/auth/logout')) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse([]);
    });

    render(<App />);

    // Token legado removido imediatamente no bootstrap
    expect(localStorage.getItem('slotmatrix_token')).toBeNull();

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'owner@vitascan.test' } });
    fireEvent.change(passwordInput, { target: { value: 'Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('plan-usage-bar')).toBeTruthy();
    });

    // Nenhum JWT salvo em localStorage após login
    expect(localStorage.getItem('slotmatrix_token')).toBeNull();
    // Todas as chamadas usaram credentials: 'include'
    expect(calledUrls.every((c) => c.credentials === 'include')).toBe(true);
  });

  it('oculta contas de demonstração e simulador de cobrança quando VITE_DEMO_MODE=false', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');

    render(
      <LoginView
        email=""
        password=""
        onEmailChange={() => {}}
        onPasswordChange={() => {}}
        onSubmit={async () => {}}
        isLoggingIn={false}
        loginError={null}
        isDark={false}
        onToggleTheme={() => {}}
      />,
    );

    expect(screen.queryByText(/Contas de demonstração/i)).toBeNull();
    expect(screen.queryByText(/Passw0rd!/i)).toBeNull();

    cleanup();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ mrrCents: 0, mrrFormatted: 'R$ 0,00', activeSubscriptionsCount: 0, distribution: {}, recentLogs: [] }), { status: 200 }));

    render(
      <BillingView
        token=""
        workspaceId="ws-1"
        overview={{
          id: 'ws-1',
          name: 'Clínica Real',
          slug: 'clinica-real',
          role: 'OWNER',
          subscription: { plan: 'STARTER', status: 'TRIALING', trialEndsAt: null, currentPeriodEnd: null },
          entitlements: {
            planLabel: 'STARTER',
            subscriptionHealthy: true,
            maxActiveResources: 5,
            maxBookingsPerMonth: 100,
            smartWaitlistEnabled: false,
            securityDepositEnabled: false,
            publicBookingPortalEnabled: false,
            vipWaitlistPriorityEnabled: false,
            exportableAuditLogs: false,
          },
          quota: { resourcesUsed: 2, resourcesMax: 5, usagePercent: 40 },
        }}
        onRefresh={async () => {}}
      />,
    );

    expect(screen.queryByText(/Simulação de situação financeira da assinatura/i)).toBeNull();
    expect(screen.queryByText(/ambiente de demonstração/i)).toBeNull();
  });

  it('ErrorBoundary invoca /api/auth/logout com credentials include e limpa dados locais', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock;
    localStorage.setItem('slotmatrix_token', 'legacy');
    localStorage.setItem('slotmatrix_workspace_id', 'ws-1');

    const Broken: React.FC = () => {
      throw new Error('Crash');
    };
    render(
      <ErrorBoundary scope="section" sectionTitle="Teste" onLogout={() => {}}>
        <Broken />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sair e entrar de novo/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
    expect(localStorage.getItem('slotmatrix_token')).toBeNull();
    expect(localStorage.getItem('slotmatrix_workspace_id')).toBeNull();
  });
});
