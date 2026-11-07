import React, { useEffect, useState } from 'react';
import { AdminMetricsDto, ApiHttpError, apiRequest, WorkspaceOverview } from './api';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CreditCard,
  DollarSign,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

interface Props {
  token: string;
  workspaceId: string;
  overview: WorkspaceOverview | null;
  onRefresh: () => Promise<void>;
}

export const BillingView: React.FC<Props> = ({ token, workspaceId, overview, onRefresh }) => {
  const [customEventId, setCustomEventId] = useState('evt_stripe_sim_' + Math.floor(Math.random() * 90000 + 10000));
  const [selectedPlan, setSelectedPlan] = useState<'STARTER' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [webhookLog, setWebhookLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [metrics, setMetrics] = useState<AdminMetricsDto | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Parse URL query params for Stripe redirect feedback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing_success') === 'true') {
      const plan = params.get('plan') || 'PRO';
      setFeedback({
        type: 'success',
        message: `Sessão de Checkout do Stripe concluída! O webhook do Stripe processa a assinatura recorrente (${plan}) e atualiza o seu plano no banco de dados.`,
      });
      void onRefresh();
    } else if (params.get('billing_cancelled') === 'true') {
      setFeedback({
        type: 'info',
        message: 'Checkout do Stripe cancelado pelo usuário. Seu plano atual foi mantido inalterado.',
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
    } catch (err) {
      console.error('Falha ao carregar métricas:', err);
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
      const msg = err instanceof ApiHttpError ? `[${err.code}] ${err.message}` : String(err);
      setFeedback({ type: 'error', message: `Erro ao iniciar checkout: ${msg}` });
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
      const msg = err instanceof ApiHttpError ? `[${err.code}] ${err.message}` : String(err);
      setFeedback({
        type: 'error',
        message: `Portal do Cliente: ${msg}. (Dica: complete um checkout primeiro para vincular um ID de cliente Stripe).`,
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const triggerSignedWebhook = async (event: 'upgrade' | 'payment_failed' | 'cancel', plan?: 'STARTER' | 'PRO' | 'ENTERPRISE') => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        eventId: string;
        webhookHttpStatus: number;
        result: { status: 'processed' | 'duplicate' };
      }>('/billing/simulate', {
        method: 'POST',
        token,
        workspaceId,
        body: {
          event,
          plan: plan ?? selectedPlan,
          eventId: customEventId.trim() || undefined,
        },
      });
      setWebhookLog(JSON.stringify(res, null, 2));
      await onRefresh();
      if (overview?.role === 'OWNER' || overview?.role === 'ADMIN') {
        void loadAdminMetrics();
      }
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status} ${err.code}] ${err.message}` : String(err);
      setWebhookLog(msg);
    } finally {
      setLoading(false);
    }
  };

  const plans = [
    {
      code: 'STARTER' as const,
      title: 'STARTER (Free Trial)',
      price: 'R$ 0 / Grátis',
      billingPeriod: '14 dias de teste ou uso individual',
      features: [
        'Até 5 BookableResources ativos (limite estrito HTTP 402)',
        'Até 100 agendamentos/mês',
        'Smart Waitlist: Desabilitada',
        'Sinal de Confirmação Anti-No-Show: Desabilitado',
        'Portal Público (/book/:slug): Desabilitado',
      ],
      isPopular: false,
    },
    {
      code: 'PRO' as const,
      title: 'PRO (Operação Clínica & Médica)',
      price: 'R$ 349/mês',
      billingPeriod: 'Cobrança recorrente mensal via Stripe',
      features: [
        'Até 20 BookableResources ativos',
        'Agendamentos mensais ilimitados',
        'Smart Waitlist com SlotOffer expirável automática',
        'Depósitos Anti-No-Show & Política de cancelamento',
        'Portal Público de Autoagendamento liberado',
      ],
      isPopular: true,
    },
    {
      code: 'ENTERPRISE' as const,
      title: 'ENTERPRISE (Hospitais & Redes)',
      price: 'R$ 890/mês',
      billingPeriod: 'Cobrança recorrente mensal via Stripe',
      features: [
        'BookableResources ativos ilimitados',
        'Agendamentos e salas ilimitadas',
        'Fila de Espera com Prioridade VIP',
        'Exportação de Auditoria Imutável (Audit Trail)',
        'Suporte prioritário e SLA de alta disponibilidade',
      ],
      isPopular: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banner de Feedback do Stripe */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Zap className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">{feedback.message}</div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin SaaS Dashboard */}
      {(overview?.role === 'OWNER' || overview?.role === 'ADMIN') && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-white">SaaS Admin Dashboard · Métricas de Receita e Assinaturas</h3>
                <p className="text-xs text-slate-400">
                  Cálculo em tempo real do faturamento mensal recorrente (MRR) e status dos clientes
                </p>
              </div>
            </div>
            <button
              onClick={loadAdminMetrics}
              disabled={loadingMetrics}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
              Atualizar Métricas
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
                <span>MRR Estimado (Stripe Test)</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-emerald-400 mt-1">
                {metrics ? metrics.mrrFormatted : 'R$ 0,00'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Baseado em assinaturas ativas Pro (R$ 349) e Enterprise (R$ 890)</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
                <span>Assinaturas Ativas</span>
                <Users className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-black text-white mt-1">
                {metrics ? metrics.activeSubscriptionsCount : 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Contas em dia no Stripe ou período de trial operacional</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 font-medium">Distribuição por Plano</div>
              <div className="space-y-1 mt-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Starter / Free:</span>
                  <span className="font-mono font-bold">{metrics?.distribution.STARTER?.total ?? 0}</span>
                </div>
                <div className="flex justify-between text-indigo-300">
                  <span>Pro (R$ 349):</span>
                  <span className="font-mono font-bold">{metrics?.distribution.PRO?.active ?? 0}</span>
                </div>
                <div className="flex justify-between text-purple-300">
                  <span>Enterprise (R$ 890):</span>
                  <span className="font-mono font-bold">{metrics?.distribution.ENTERPRISE?.active ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Acesso ao Portal do Cliente Stripe */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-indigo-400 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">Portal do Cliente Stripe (Self-Service)</div>
            <div className="text-xs text-slate-400">
              Cancele, altere seu plano ou atualize a forma de pagamento de forma autônoma sem passar pelo suporte.
            </div>
          </div>
        </div>
        <button
          onClick={handleOpenBillingPortal}
          disabled={portalLoading}
          className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 flex items-center justify-center gap-2 transition"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {portalLoading ? 'Abrindo Portal...' : 'Gerenciar Assinatura no Stripe'}
        </button>
      </div>

      {/* Plan Cards com Integração Stripe Checkout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => {
          const isCurrent = overview?.subscription.plan === p.code;
          return (
            <div
              key={p.code}
              className={`rounded-xl border p-5 flex flex-col justify-between relative ${
                isCurrent
                  ? 'bg-indigo-950/40 border-indigo-500 shadow-xl shadow-indigo-950/50 ring-1 ring-indigo-500/50'
                  : p.isPopular
                  ? 'bg-slate-900 border-indigo-500/40 shadow-md'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {p.isPopular && !isCurrent && (
                <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold tracking-wide flex items-center gap-1 shadow">
                  <Sparkles className="w-3 h-3" /> MAIS ESCOLHIDO
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{p.title}</span>
                  {isCurrent && (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-emerald-500 text-slate-950">
                      PLANO ATIVO ({overview?.subscription.status})
                    </span>
                  )}
                </div>
                <div className="text-2xl font-black text-white mt-2">{p.price}</div>
                <div className="text-[11px] text-slate-400">{p.billingPeriod}</div>

                <ul className="mt-4 space-y-2 text-xs text-slate-300">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 space-y-2">
                {p.code === 'STARTER' ? (
                  <div className="w-full py-2.5 rounded-lg text-xs font-semibold text-center bg-slate-800/80 text-slate-400 border border-slate-700/50">
                    {isCurrent ? 'Plano Free Ativo' : 'Plano Gratuito / Básico'}
                  </div>
                ) : (
                  <button
                    disabled={checkoutLoading !== null}
                    onClick={() => void handleStripeCheckout(p.code)}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg ${
                      p.code === 'PRO'
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    {checkoutLoading === p.code
                      ? 'Iniciando Checkout Stripe...'
                      : isCurrent
                      ? `Renovar ${p.title} (Stripe)`
                      : `Assinar ${p.title} com Stripe`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Painel de Auditoria e Testes de Webhook */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">
            Simulador de Webhooks Stripe & Garantia de Idempotência
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          O Stripe envia webhooks de forma assíncrona. Teste a idempotência e os 4 estados principais da máquina de estados:
          <span className="font-mono text-indigo-300"> checkout.session.completed</span>,
          <span className="font-mono text-amber-300"> invoice.payment_failed</span>,
          <span className="font-mono text-rose-300"> customer.subscription.deleted</span> e
          <span className="font-mono text-cyan-300"> customer.subscription.updated</span>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">externalEventId (Chave Idempotente)</label>
            <input
              type="text"
              value={customEventId}
              onChange={(e) => setCustomEventId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Plano Alvo</label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="STARTER">STARTER</option>
              <option value="PRO">PRO</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              disabled={loading}
              onClick={() => void triggerSignedWebhook('upgrade', selectedPlan)}
              className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Simular checkout.session.completed
            </button>
            <button
              disabled={loading}
              onClick={() => void triggerSignedWebhook('payment_failed')}
              className="py-2 px-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white"
            >
              Simular Inadimplência (PAST_DUE)
            </button>
          </div>
        </div>

        {webhookLog && (
          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-300 overflow-x-auto">
            {webhookLog}
          </pre>
        )}
      </div>
    </div>
  );
};
