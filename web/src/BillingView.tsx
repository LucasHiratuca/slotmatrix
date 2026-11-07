import React, { useState } from 'react';
import { ApiHttpError, apiRequest, WorkspaceOverview } from './api';
import { Check, CreditCard, RefreshCw, ShieldCheck, Terminal, Zap } from 'lucide-react';

interface Props {
  token: string;
  workspaceId: string;
  overview: WorkspaceOverview | null;
  onRefresh: () => Promise<void>;
}

export const BillingView: React.FC<Props> = ({ token, workspaceId, overview, onRefresh }) => {
  const [customEventId, setCustomEventId] = useState('evt_slotmatrix_demo_1001');
  const [selectedPlan, setSelectedPlan] = useState<'STARTER' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [webhookLog, setWebhookLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      title: 'STARTER',
      price: 'R$ 290/mês',
      features: [
        'Até 5 BookableResources ativos',
        'Até 100 agendamentos/mês',
        'Smart Waitlist: Desabilitada',
        'SecurityDeposit Anti-No-Show: Desabilitado',
        'Portal Público (/book/:slug): Desabilitado',
      ],
    },
    {
      code: 'PRO' as const,
      title: 'PRO (Operação Clínica & Diagnóstico)',
      price: 'R$ 890/mês',
      features: [
        'Até 40 BookableResources ativos',
        'Agendamentos ilimitados',
        'Smart Waitlist com SlotOffer Expirável: Habilitada',
        'SecurityDeposit & Retenção Anti-No-Show: Habilitado',
        'Portal Público de Autoagendamento: Habilitado',
      ],
    },
    {
      code: 'ENTERPRISE' as const,
      title: 'ENTERPRISE (Hospitais & Redes)',
      price: 'R$ 2.490/mês',
      features: [
        'BookableResources ilimitados',
        'Agendamentos ilimitados',
        'Prioridade VIP Fura-Fila na Smart Waitlist',
        'Exportação Completa de AuditLogs Imutáveis',
        'SLA Dedicado & Webhooks Assinados HMAC-SHA256',
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => {
          const isCurrent = overview?.subscription.plan === p.code;
          return (
            <div
              key={p.code}
              className={`rounded-xl border p-5 flex flex-col justify-between ${
                isCurrent
                  ? 'bg-indigo-950/30 border-indigo-500 shadow-lg'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{p.title}</span>
                  {isCurrent && (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-indigo-500 text-white">
                      PLANO ATUAL ({overview?.subscription.status})
                    </span>
                  )}
                </div>
                <div className="text-xl font-bold text-indigo-300 mt-2">{p.price}</div>
                <ul className="mt-4 space-y-2 text-xs text-slate-300">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                disabled={loading}
                onClick={() => {
                  setCustomEventId(`evt_upgrade_${p.code.toLowerCase()}_${Date.now()}`);
                  void triggerSignedWebhook('upgrade', p.code);
                }}
                className="mt-5 w-full py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                Simular Webhook Upgrade p/ {p.code}
              </button>
            </div>
          );
        })}
      </div>

      {/* Idempotent Webhook Simulator */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">
            Simulador de Webhook de Pagamento Assinado (<code>BillingWebhookAcl</code> + Idempotência por{' '}
            <code>externalEventId</code>)
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Dispare duas vezes o mesmo <code>externalEventId</code> para comprovar que a 1ª chamada retorna{' '}
          <code>status: "processed"</code> e a 2ª chamada retorna <code>status: "duplicate"</code> sem duplicar
          efeitos colaterais nem eventos de domínio.
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
              Disparar checkout.session.completed
            </button>
            <button
              disabled={loading}
              onClick={() => void triggerSignedWebhook('payment_failed')}
              className="py-2 px-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white"
            >
              Simular PAST_DUE
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
