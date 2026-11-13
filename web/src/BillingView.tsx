import React, { useEffect, useState } from 'react';
import {
  AdminMetricsDto,
  ApiHttpError,
  apiRequest,
  resolveWorkspaceQuota,
  WorkspaceOverview,
} from './api';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  formatApiError,
  formatAuditAction,
  formatCurrencyBRL,
  formatDateTimeBR,
  formatPlanName,
  formatSubscriptionStatus,
} from './labels';

interface Props {
  token: string;
  workspaceId: string;
  overview: WorkspaceOverview | null;
  onRefresh: () => Promise<void>;
}

export const BillingView: React.FC<Props> = ({
  token,
  workspaceId,
  overview,
  onRefresh,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<'STARTER' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [simulationNotice, setSimulationNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [metrics, setMetrics] = useState<AdminMetricsDto | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const quota = resolveWorkspaceQuota(overview);
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing_success') === 'true') {
      const plan = params.get('plan') || 'PRO';
      setFeedback({
        type: 'success',
        message: `Assinatura concluída com sucesso! Seu plano foi atualizado para ${formatPlanName(plan)}.`,
      });
      void onRefresh();
    } else if (params.get('billing_cancelled') === 'true') {
      setFeedback({
        type: 'info',
        message: 'Alteração de assinatura cancelada. Seu plano atual foi mantido.',
      });
    }
  }, []);

  const loadAdminMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const data = await apiRequest<AdminMetricsDto>('/admin/metrics', {
        token,
        workspaceId,
      });
      setMetrics(data);
    } catch {
      // ignore if user role doesn't have admin metrics
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    if (overview?.role === 'OWNER' || overview?.role === 'ADMIN') {
      void loadAdminMetrics();
    }
  }, [workspaceId, overview?.role]);

  const handleStripeCheckout = async (plan: 'PRO' | 'ENTERPRISE') => {
    setCheckoutLoading(plan);
    setFeedback(null);
    try {
      const res = await apiRequest<{ checkoutUrl: string }>('/billing/checkout', {
        method: 'POST',
        token,
        workspaceId,
        body: { plan },
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setFeedback({ type: 'error', message: `Não foi possível iniciar a assinatura: ${msg}` });
      setCheckoutLoading(null);
    }
  };

  const handleOpenBillingPortal = async () => {
    setPortalLoading(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ portalUrl: string }>('/billing/portal', {
        method: 'POST',
        token,
        workspaceId,
      });
      if (res.portalUrl) {
        window.location.href = res.portalUrl;
      }
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setFeedback({
        type: 'error',
        message: `Portal de assinatura: ${msg}`,
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const triggerSubscriptionSimulation = async (
    event: 'upgrade' | 'payment_failed' | 'cancel',
    plan?: 'STARTER' | 'PRO' | 'ENTERPRISE',
  ) => {
    setLoading(true);
    setSimulationNotice(null);
    try {
      const targetPlan = plan ?? selectedPlan;
      await apiRequest<{
        eventId: string;
        webhookHttpStatus: number;
        result: { status: 'processed' | 'duplicate' };
      }>('/billing/simulate', {
        method: 'POST',
        token,
        workspaceId,
        body: {
          event,
          plan: targetPlan,
        },
      });
      const summaryByEvent: Record<typeof event, string> = {
        upgrade: `Assinatura atualizada com sucesso para ${formatPlanName(targetPlan)}. Os novos limites já estão ativos.`,
        payment_failed:
          'Pendência financeira simulada. A assinatura entrou em estado de pagamento pendente.',
        cancel: 'Cancelamento simulado. A assinatura foi marcada como cancelada.',
      };
      setSimulationNotice({
        type: 'success',
        text: summaryByEvent[event],
      });
      await onRefresh();
      if (overview?.role === 'OWNER' || overview?.role === 'ADMIN') {
        void loadAdminMetrics();
      }
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setSimulationNotice({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };

  const plans = [
    {
      code: 'STARTER' as const,
      title: 'Plano Starter',
      price: 'R$ 0 / período de teste',
      billingPeriod: '14 dias de avaliação para clínicas iniciais',
      features: [
        'Até 5 recursos ativos (especialistas, salas e equipamentos)',
        'Até 100 agendamentos por mês',
        'Agenda visual de alocação simultânea',
      ],
      isPopular: false,
    },
    {
      code: 'PRO' as const,
      title: 'Plano Pro',
      price: 'R$ 349/mês',
      billingPeriod: 'Cobrança recorrente mensal',
      features: [
        'Até 40 recursos ativos na clínica',
        'Agendamentos ilimitados no mês',
        'Lista de espera com oferta automática de horários vagos',
        'Sinal de reserva configurável por procedimento',
        'Portal de agendamento online para pacientes',
      ],
      isPopular: true,
    },
    {
      code: 'ENTERPRISE' as const,
      title: 'Plano Enterprise',
      price: 'R$ 890/mês',
      billingPeriod: 'Multi-unidade e operação hospitalar',
      features: [
        'Recursos ativos ilimitados',
        'Prioridade clínica e executiva na lista de espera',
        'Registro de auditoria completo para conformidade',
        'Atendimento prioritário e suporte dedicado',
      ],
      isPopular: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Plano e cobrança</h1>
        <p className="text-xs text-ink-secondary mt-0.5">
          Acompanhe o uso de recursos contratados, altere seu plano ou gerencie sua assinatura.
        </p>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)]'
              : feedback.type === 'error'
              ? 'bg-[var(--status-noshow-bg)] border-[var(--status-noshow-border)] text-[var(--status-noshow-text)]'
              : 'bg-[var(--brand-subtle)] border-brand/30 text-brand'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-75 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Resumo de uso atual */}
      <div className="bg-surface border border-border-subtle rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="text-xs text-ink-secondary">Assinatura ativa da clínica</div>
          <div className="flex items-center gap-2.5 mt-1">
            <span className="text-base font-bold text-ink-primary">
              {formatPlanName(quota.plan)}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border border-[var(--status-confirmed-border)]">
              {formatSubscriptionStatus(quota.status)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-ink-secondary">Capacidade de recursos</div>
            <div className="text-sm font-semibold text-ink-primary tabular-nums mt-0.5">
              {quota.maxActiveResources !== null
                ? `Recursos: ${quota.activeResources} de ${quota.maxActiveResources}`
                : `Recursos: ${quota.activeResources} ativos (ilimitado)`}
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Indicadores Financeiros (visível para Proprietário/Administrador) */}
      {(overview?.role === 'OWNER' || overview?.role === 'ADMIN') && (
        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--status-confirmed-text)]" />
                Indicadores de receita recorrente e assinaturas
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Visão consolidada das assinaturas ativas e distribuição por plano.
              </p>
            </div>
            <button
              type="button"
              onClick={loadAdminMetrics}
              disabled={loadingMetrics}
              className="p-2 rounded-lg bg-canvas hover:bg-sunken text-ink-secondary hover:text-ink-primary border border-border-subtle text-xs flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
              Atualizar indicadores
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-canvas border border-border-subtle rounded-lg p-4">
              <div className="text-xs text-ink-secondary font-medium">
                Receita recorrente mensal
              </div>
              <div className="text-2xl font-bold text-[var(--status-confirmed-text)] mt-1 tabular-nums">
                {metrics ? formatCurrencyBRL(metrics.mrrCents) : 'R$ 0,00'}
              </div>
              <div className="text-xs text-ink-secondary mt-1">
                Soma das assinaturas ativas no momento
              </div>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-lg p-4">
              <div className="text-xs text-ink-secondary font-medium">
                Assinaturas pagas ativas
              </div>
              <div className="text-2xl font-bold text-ink-primary mt-1 tabular-nums">
                {metrics?.activeSubscriptionsCount ?? 0}
              </div>
              <div className="text-xs text-ink-secondary mt-1">
                Clínicas em operação regular
              </div>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-lg p-4">
              <div className="text-xs text-ink-secondary font-medium">
                Distribuição por plano
              </div>
              <div className="space-y-1 mt-2 text-xs tabular-nums">
                <div className="flex justify-between text-ink-secondary">
                  <span>Plano Starter:</span>
                  <span className="font-semibold text-ink-primary">
                    {metrics?.distribution.STARTER?.total ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-brand">
                  <span>Plano Pro (R$ 349,00):</span>
                  <span className="font-semibold">
                    {metrics?.distribution.PRO?.active ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-[var(--res-equipment-text)]">
                  <span>Plano Enterprise (R$ 890,00):</span>
                  <span className="font-semibold">
                    {metrics?.distribution.ENTERPRISE?.active ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Acesso ao Portal de Autoatendimento */}
      <div className="bg-surface border border-border-subtle rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-brand shrink-0" />
          <div>
            <div className="text-sm font-semibold text-ink-primary">
              Portal de autoatendimento da assinatura
            </div>
            <div className="text-xs text-ink-secondary">
              Altere a forma de pagamento, consulte faturas ou cancele sua assinatura quando desejar.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpenBillingPortal}
          disabled={portalLoading}
          className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold bg-canvas hover:bg-sunken text-brand border border-brand/30 flex items-center justify-center gap-2 transition"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {portalLoading ? 'Abrindo portal...' : 'Gerenciar forma de pagamento'}
        </button>
      </div>

      {/* Cartões de Planos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => {
          const isCurrent = quota.plan === p.code;
          return (
            <div
              key={p.code}
              className={`rounded-xl border p-5 flex flex-col justify-between relative shadow-xs ${
                isCurrent
                  ? 'bg-[var(--brand-subtle)] border-brand ring-1 ring-brand/40'
                  : p.isPopular
                  ? 'bg-surface border-brand/40'
                  : 'bg-surface border-border-subtle'
              }`}
            >
              {p.isPopular && !isCurrent && (
                <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-[var(--btn-primary-bg)] text-white text-xs font-semibold flex items-center gap-1 shadow-xs">
                  <Sparkles className="w-3 h-3" /> Recomendado
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink-primary">{p.title}</span>
                  {isCurrent && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border border-[var(--status-confirmed-border)]">
                      Plano atual ({formatSubscriptionStatus(quota.status)})
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-ink-primary mt-2 tabular-nums">
                  {p.price}
                </div>
                <div className="text-xs text-ink-secondary">{p.billingPeriod}</div>

                <ul className="mt-4 space-y-2 text-xs text-ink-secondary">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[var(--status-confirmed-text)] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 space-y-2">
                {p.code === 'STARTER' ? (
                  <div className="w-full py-2.5 rounded-lg text-xs font-semibold text-center bg-sunken text-ink-secondary border border-border-subtle">
                    {isCurrent ? 'Plano atual ativo' : 'Plano inicial de avaliação'}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={checkoutLoading !== null}
                    onClick={() => void handleStripeCheckout(p.code)}
                    className="w-full py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white shadow-xs"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    {checkoutLoading === p.code
                      ? 'Redirecionando...'
                      : isCurrent
                      ? `Renovar ${p.title}`
                      : `Assinar ${p.title}`}
                  </button>
                )}

                {isDemoMode && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void triggerSubscriptionSimulation('upgrade', p.code)}
                    className="w-full py-1.5 rounded-lg text-xs font-medium bg-canvas hover:bg-sunken text-ink-secondary hover:text-ink-primary border border-border-subtle transition"
                  >
                    Ativar {p.title} imediatamente (ambiente de demonstração)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulação de Eventos de Assinatura (apenas quando VITE_DEMO_MODE=true) */}
      {isDemoMode && (
        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand" />
              Simulação de situação financeira da assinatura
            </h2>
            <p className="text-xs text-ink-secondary mt-1">
              Simule alterações de plano, atrasos no pagamento ou cancelamento para verificar o bloqueio imediato de criação de novos recursos acima do limite.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs text-ink-secondary mb-1">
              Plano de destino para ativação
            </label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as any)}
              className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
            >
              <option value="STARTER">Plano Starter (limite de 5 recursos)</option>
              <option value="PRO">Plano Pro (limite de 40 recursos)</option>
              <option value="ENTERPRISE">Plano Enterprise (recursos ilimitados)</option>
            </select>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void triggerSubscriptionSimulation('upgrade')}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--status-confirmed-border)] hover:opacity-90 text-white transition"
          >
            Confirmar pagamento e ativar plano
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void triggerSubscriptionSimulation('payment_failed')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-canvas hover:bg-sunken text-[var(--status-pending-text)] border border-[var(--status-pending-border)] transition"
            >
              Simular pagamento pendente
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void triggerSubscriptionSimulation('cancel')}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-canvas hover:bg-[var(--status-noshow-bg)] text-[var(--status-noshow-text)] border border-[var(--status-noshow-border)] transition"
            >
              Simular cancelamento
            </button>
          </div>
        </div>

        {simulationNotice && (
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
              simulationNotice.type === 'success'
                ? 'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)]'
                : 'bg-[var(--status-noshow-bg)] border-[var(--status-noshow-border)] text-[var(--status-noshow-text)]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{simulationNotice.text}</span>
          </div>
        )}
        </div>
      )}

      {/* Últimos eventos financeiros na auditoria */}
      {metrics && metrics.recentLogs && metrics.recentLogs.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-xl p-5 space-y-3 shadow-xs">
          <h3 className="text-xs font-semibold text-ink-primary">
            Histórico recente de alterações de assinatura
          </h3>
          <div className="divide-y divide-border-subtle text-xs">
            {metrics.recentLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="py-2 flex items-center justify-between gap-4"
              >
                <span className="text-ink-primary font-medium">
                  {formatAuditAction(log.action)}
                </span>
                <span className="text-ink-secondary tabular-nums">
                  {formatDateTimeBR(log.occurredAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
