import React, { useEffect, useState } from 'react';
import { ApiHttpError, apiRequest, formatMoneyBRL } from './api';
import { ArrowLeft, Calendar, CheckCircle2, Clock, ShieldCheck, Sparkles } from 'lucide-react';

interface PublicCatalogDto {
  workspace: { name: string; slug: string };
  date: string;
  procedures: {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    depositCents: number;
    currency: string;
    requiredCategories: string[];
    availableSlots: { startAt: string; endAt: string }[];
  }[];
}

interface Props {
  slug: string;
  onBackToApp?: () => void;
}

export const PublicBookingPage: React.FC<Props> = ({ slug, onBackToApp }) => {
  const [catalog, setCatalog] = useState<PublicCatalogDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProcId, setSelectedProcId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const loadCatalog = async () => {
    setError(null);
    try {
      const res = await apiRequest<PublicCatalogDto>(`/public/book/${slug}`);
      setCatalog(res);
      if (res.procedures[0]) {
        setSelectedProcId(res.procedures[0].id);
        setSelectedSlot(res.procedures[0].availableSlots[0]?.startAt ?? '');
      }
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status}] ${err.message}` : String(err);
      setError(msg);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, [slug]);

  const activeProc = catalog?.procedures.find((p) => p.id === selectedProcId);

  const handleSelfBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcId || !selectedSlot) return;
    setConfirmation(null);
    setError(null);
    try {
      const res = await apiRequest<{
        bookingId: string;
        procedureName: string;
        startAt: string;
        status: string;
        depositCents: number;
      }>(`/public/book/${slug}/schedule`, {
        method: 'POST',
        body: {
          procedureId: selectedProcId,
          startAt: selectedSlot,
          clientName,
          clientEmail,
        },
      });
      setConfirmation(
        `Reserva #${res.bookingId.slice(0, 8)} criada (${res.status}) para ${res.procedureName}! Sinal requerido: ${formatMoneyBRL(res.depositCents)}.`,
      );
      await loadCatalog();
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status}] ${err.message}` : String(err);
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-mono uppercase tracking-wider text-indigo-400">
              SlotMatrix Public Self-Booking Portal
            </span>
          </div>
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Painel Operacional
            </button>
          )}
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-4 text-xs text-rose-200">
            {error}
          </div>
        )}

        {confirmation && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-4 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{confirmation}</span>
          </div>
        )}

        {catalog && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">{catalog.workspace.name}</h1>
              <p className="text-xs text-slate-400 mt-1">
                Autoagendamento online validado por disponibilidade multi-recurso • Data base:{' '}
                <span className="font-mono text-indigo-300">{catalog.date}</span>
              </p>
            </div>

            <form onSubmit={handleSelfBook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Escolha o Procedimento
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catalog.procedures.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setSelectedProcId(p.id);
                        setSelectedSlot(p.availableSlots[0]?.startAt ?? '');
                      }}
                      className={`text-left p-3.5 rounded-xl border transition ${
                        selectedProcId === p.id
                          ? 'bg-indigo-950/50 border-indigo-500'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="text-sm font-semibold text-white">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {p.durationMinutes} min • {formatMoneyBRL(p.priceCents)}
                      </div>
                      <div className="text-[11px] text-amber-300 mt-1 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Sinal Anti-No-Show: {formatMoneyBRL(p.depositCents)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {activeProc && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Horários Disponíveis ({activeProc.availableSlots.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {activeProc.availableSlots.map((s) => (
                      <button
                        type="button"
                        key={s.startAt}
                        onClick={() => setSelectedSlot(s.startAt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${
                          selectedSlot === s.startAt
                            ? 'bg-indigo-600 text-white border-indigo-400 font-bold'
                            : 'bg-slate-950 text-slate-300 border-slate-800'
                        }`}
                      >
                        {s.startAt.slice(11, 16)} UTC
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Seu Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: Lucas Andrade"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Seu E-mail</label>
                  <input
                    type="email"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="lucas@exemplo.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedSlot}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Confirmar Pré-Reserva Multi-Recurso
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
