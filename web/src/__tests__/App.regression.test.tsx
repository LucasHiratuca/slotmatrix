import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { ErrorBoundary } from '../ErrorBoundary';
import { normalizePlanCode, resolveWorkspaceQuota } from '../api';

describe('Fase 1 & Fase 2 — Regressão: App, Limites de Plano, Glossário pt-BR e ErrorBoundary', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolveWorkspaceQuota normaliza planos desconhecidos/minúsculos e nunca lança erro com overview undefined ou sem usage', () => {
    expect(normalizePlanCode('pro')).toBe('PRO');
    expect(normalizePlanCode('enterprise')).toBe('ENTERPRISE');
    expect(normalizePlanCode('TRIALING')).toBe('STARTER');
    expect(normalizePlanCode(undefined)).toBe('STARTER');

    const fromNull = resolveWorkspaceQuota(null);
    expect(fromNull.plan).toBe('STARTER');
    expect(fromNull.maxActiveResources).toBe(5);
    expect(fromNull.activeResources).toBe(0);

    const fromBackendShape = resolveWorkspaceQuota({
      id: 'ws-1',
      name: 'Estúdio Aura',
      slug: 'estudio-aura',
      role: 'OWNER',
      subscription: {
        plan: 'STARTER',
        status: 'TRIALING',
        trialEndsAt: null,
        currentPeriodEnd: null,
      },
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
      quota: {
        resourcesUsed: 5,
        resourcesMax: 5,
        usagePercent: 100,
      },
    });
    expect(fromBackendShape.activeResources).toBe(5);
    expect(fromBackendShape.maxActiveResources).toBe(5);
    expect(fromBackendShape.isAtQuotaLimit).toBe(true);
  });

  it('exibe o estado explícito de carregamento (skeleton) enquanto os dados da clínica ainda não chegaram', () => {
    localStorage.setItem('slotmatrix_workspace_id', 'ws-1');

    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));

    render(<App />);

    expect(localStorage.getItem('slotmatrix_token')).toBeNull();
    expect(screen.getByTestId('workspace-loading-skeleton')).toBeTruthy();
    expect(screen.getByText(/Carregando clínica, plano e limites de recursos/i)).toBeTruthy();
  });

  it('renderiza sem lançar TypeError quando /api/workspace retorna o contrato real (com `quota` e sem `usage`) ou com campos de plano indefinidos', async () => {
    localStorage.setItem('slotmatrix_workspace_id', 'ws-aura');

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const jsonResponse = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      if (url.endsWith('/api/auth/session')) {
        return jsonResponse({
          authenticated: true,
          userId: 'user-1',
          email: 'owner@aura.test',
          name: 'Ana Paula',
          workspaces: [
            {
              id: 'ws-aura',
              name: 'Estúdio Aura',
              slug: 'estudio-aura',
              role: 'OWNER',
              plan: 'STARTER',
              subscriptionStatus: 'TRIALING',
            },
          ],
        });
      }

      if (url.endsWith('/api/me/workspaces')) {
        return jsonResponse([
          {
            id: 'ws-aura',
            name: 'Estúdio Aura',
            slug: 'estudio-aura',
            role: 'OWNER',
            plan: 'STARTER',
            subscriptionStatus: 'TRIALING',
          },
        ]);
      }

      if (url.endsWith('/api/workspace')) {
        return jsonResponse({
          id: 'ws-aura',
          name: 'Estúdio Aura',
          slug: 'estudio-aura',
          role: 'OWNER',
          subscription: null,
          entitlements: {
            planLabel: 'STARTER',
            subscriptionHealthy: true,
          },
          quota: undefined,
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

      return jsonResponse([]);
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('plan-usage-bar')).toBeTruthy();
    });

    expect(screen.getByTestId('plan-usage-bar').textContent).toContain('Plano Starter · 0 de 5 recursos');
  });

  it('exibe tela amigável de erro (sem tela azul/vazia) quando o carregamento da clínica falha na rede', async () => {
    localStorage.setItem('slotmatrix_workspace_id', 'ws-1');

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/session')) {
        return new Response(
          JSON.stringify({
            authenticated: true,
            userId: 'user-1',
            email: 'owner@aura.test',
            name: 'Ana Paula',
            workspaces: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error('Network failure');
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-load-error')).toBeTruthy();
    });

    expect(screen.getAllByText(/Não foi possível carregar os dados da clínica/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sair/i })).toBeTruthy();
  });

  it('ErrorBoundary captura exceções de renderização, registra no console e exibe fallback em pt-BR', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const BrokenComponent: React.FC = () => {
      throw new Error('Falha simulada de render');
    };

    const onLogout = vi.fn();
    render(
      <ErrorBoundary
        scope="section"
        sectionTitle="Seção de Teste"
        context={{ route: '/#agenda', userEmail: 'owner@vitascan.test', plan: 'PRO' }}
        onLogout={onLogout}
      >
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Erro ao carregar a seção Seção de Teste/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Sair e entrar de novo/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
