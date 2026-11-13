import React, { useEffect, useState } from 'react';
import { ApiHttpError, apiRequest } from './api';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  formatApiError,
  formatBookingStatus,
  formatCurrencyBRL,
  formatDateBR,
  formatDepositWithPercentage,
  formatTimeBR,
} from './labels';

interface PublicCatalogDto {
  workspace: { id: string; name: string; slug: string };
  date: string;
  procedures: {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    depositCents: number;
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
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
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
        `Reserva registrada (${formatBookingStatus(res.status)}) para ${res.procedureName}. Sinal de reserva: ${formatCurrencyBRL(res.depositCents)}.`,
      );
      await loadCatalog();
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-primary p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand" />
            <span className="text-xs font-semibold text-brand">
              Portal de agendamento online
            </span>
          </div>
          {onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink-primary bg-surface border border-border-subtle px-3 py-1.5 rounded-lg"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao painel da clínica
            </button>
          )}
        </div>

        {error && (
          <div className="bg-[var(--status-noshow-bg)] border border-[var(--status-noshow-border)] rounded-xl p-4 text-xs text-[var(--status-noshow-text)]">
            {error}
          </div>
        )}

        {confirmation && (
          <div className="bg-[var(--status-confirmed-bg)] border border-[var(--status-confirmed-border)] rounded-xl p-4 text-xs text-[var(--status-confirmed-text)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{confirmation}</span>
          </div>
        )}

        {catalog && (
          <div className="bg-surface border border-border-subtle rounded-2xl p-6 space-y-6 shadow-xs">
            <div>
              <h1 className="text-xl font-bold text-ink-primary">
                {catalog.workspace.name}
              </h1>
              <p className="text-xs text-ink-secondary mt-1 tabular-nums">
                Agendamento online com verificação automática de especialista, sala e equipamento · Data:{' '}
                <span className="text-brand font-semibold">
                  {formatDateBR(catalog.date)}
                </span>
              </p>
            </div>

            <form onSubmit={handleSelfBook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-primary mb-2">
                  Escolha o procedimento
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
                          ? 'bg-[var(--brand-subtle)] border-brand'
                          : 'bg-canvas border-border-subtle'
                      }`}
                    >
                      <div className="text-sm font-semibold text-ink-primary">
                        {p.name}
                      </div>
                      <div className="text-xs text-ink-secondary mt-1 tabular-nums">
                        Atendimento: {p.durationMinutes} min ·{' '}
                        {formatCurrencyBRL(p.priceCents)}
                      </div>
                      <div className="text-xs text-[var(--status-pending-text)] mt-1 flex items-center gap-1 tabular-nums">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Sinal de reserva:{' '}
                        {formatDepositWithPercentage(p.depositCents, p.priceCents)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {activeProc && (
                <div>
                  <label className="block text-xs font-semibold text-ink-primary mb-2 tabular-nums">
                    Horários disponíveis ({activeProc.availableSlots.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {activeProc.availableSlots.map((s) => (
                      <button
                        type="button"
                        key={s.startAt}
                        onClick={() => setSelectedSlot(s.startAt)}
                        className={`px-3 py-1.5 rounded-lg text-xs border inline-flex items-center gap-1.5 tabular-nums ${
                          selectedSlot === s.startAt
                            ? 'bg-[var(--btn-primary-bg)] text-white border-brand font-semibold'
                            : 'bg-canvas text-ink-secondary border-border-subtle'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimeBR(s.startAt)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-secondary mb-1">
                    Seu nome completo
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex.: Lucas Andrade"
                    className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-secondary mb-1">
                    Seu e-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="lucas@exemplo.com"
                    className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedSlot}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-40 text-white shadow-xs"
              >
                Confirmar reserva online
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
