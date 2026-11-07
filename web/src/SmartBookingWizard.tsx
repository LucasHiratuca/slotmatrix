import React, { useEffect, useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookingDto,
  formatMoneyBRL,
  ServiceProcedureDto,
} from './api';
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  DollarSign,
  Play,
  ShieldCheck,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';

interface AvailableSlotOption {
  startAt: string;
  endAt: string;
  allocations: {
    resourceId: string;
    resourceName: string;
    category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
    prepMinutes: number;
    cleanupMinutes: number;
    effectiveStartAt: string;
    effectiveEndAt: string;
  }[];
}

interface Props {
  token: string;
  workspaceId: string;
  selectedDate: string;
  procedures: ServiceProcedureDto[];
  bookings: BookingDto[];
  onRefresh: () => Promise<void>;
}

const STATUS_BADGE: Record<BookingDto['status'], string> = {
  PENDING_DEPOSIT: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  CONFIRMED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  CHECKED_IN: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  COMPLETED: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  CANCELLED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  NO_SHOW: 'bg-red-600/25 text-red-300 border-red-500/40',
  EXPIRED: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
};

export const SmartBookingWizard: React.FC<Props> = ({
  token,
  workspaceId,
  selectedDate,
  procedures,
  bookings,
  onRefresh,
}) => {
  const [selectedProcedureId, setSelectedProcedureId] = useState<string>(procedures[0]?.id ?? '');
  const [availableSlots, setAvailableSlots] = useState<AvailableSlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlotOption | null>(null);
  const [clientName, setClientName] = useState('Marina Albuquerque');
  const [clientEmail, setClientEmail] = useState('marina.albuquerque@cliente.test');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (procedures.length > 0 && !procedures.some((p) => p.id === selectedProcedureId)) {
      setSelectedProcedureId(procedures[0].id);
    }
  }, [procedures, selectedProcedureId]);

  const loadAvailableSlots = async (procId: string, dateStr: string) => {
    if (!procId) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const from = `${dateStr}T08:00:00.000Z`;
      const to = `${dateStr}T18:00:00.000Z`;
      const res = await apiRequest<{ availableSlots: AvailableSlotOption[] }>(
        `/procedures/${procId}/available-slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&stepMinutes=30`,
        { token, workspaceId },
      );
      setAvailableSlots(res.availableSlots);
      if (res.availableSlots.length > 0) {
        setSelectedSlot(res.availableSlots[0]);
      }
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (selectedProcedureId && selectedDate) {
      void loadAvailableSlots(selectedProcedureId, selectedDate);
    }
  }, [selectedProcedureId, selectedDate, workspaceId]);

  const selectedProc = procedures.find((p) => p.id === selectedProcedureId);

  const handleScheduleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !selectedProcedureId) return;
    setFeedback(null);
    try {
      const created = await apiRequest<BookingDto>('/bookings', {
        method: 'POST',
        token,
        workspaceId,
        body: {
          procedureId: selectedProcedureId,
          startAt: selectedSlot.startAt,
          clientName,
          clientEmail,
        },
      });
      setFeedback({
        type: 'success',
        text: `Agendamento #${created.id.slice(0, 8)} criado em estado ${created.status} com alocação simultânea de ${created.allocations.length} recursos!`,
      });
      await onRefresh();
      await loadAvailableSlots(selectedProcedureId, selectedDate);
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status} ${err.code}] ${err.message}` : String(err);
      setFeedback({ type: 'error', text: msg });
    }
  };

  const handleLifecycleAction = async (
    bookingId: string,
    action: 'confirm-deposit' | 'check-in' | 'complete' | 'cancel' | 'no-show',
  ) => {
    setFeedback(null);
    try {
      const updated = await apiRequest<BookingDto>(`/bookings/${bookingId}/${action}`, {
        method: 'POST',
        token,
        workspaceId,
        body:
          action === 'cancel'
            ? { reason: 'Cancelamento acionado na central operacional — disparando Smart Waitlist' }
            : {},
      });
      const extra =
        action === 'cancel'
          ? ` | Retido: ${formatMoneyBRL(updated.retainedCents)} • Reembolsado: ${formatMoneyBRL(updated.refundedCents)} • Smart Waitlist notificada automaticamente!`
          : '';
      setFeedback({
        type: 'success',
        text: `Reserva de ${updated.clientName} atualizada para ${updated.status}${extra}`,
      });
      await onRefresh();
      await loadAvailableSlots(selectedProcedureId, selectedDate);
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status} ${err.code}] ${err.message}` : String(err);
      setFeedback({ type: 'error', text: msg });
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-75 hover:opacity-100">
            Fechar
          </button>
        </div>
      )}

      {/* Multi-Resource Smart Booking Wizard */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-indigo-400" />
          Smart Multi-Resource Booking Wizard (Interseção Livre + Buffers Assimétricos)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          O motor <code className="text-indigo-300">MultiResourceAvailabilityDomainService</code> varre todos os
          recursos qualificados e exibe apenas os horários em que Especialista, Sala (com janela extra de
          esterilização) e Equipamento estão simultaneamente livres.
        </p>

        <form onSubmit={handleScheduleBooking} className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column: procedure & client */}
          <div className="lg:col-span-5 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                1. Selecione o Procedimento (<code className="text-indigo-300">ServiceProcedure</code>)
              </label>
              <select
                value={selectedProcedureId}
                onChange={(e) => setSelectedProcedureId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              >
                {procedures.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.durationMinutes}m — {formatMoneyBRL(p.priceCents)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome do Paciente / Cliente</label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">E-mail do Cliente</label>
                <input
                  type="email"
                  required
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            {selectedProc && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Valor Total do Procedimento:</span>
                  <span className="font-mono font-bold text-white">{formatMoneyBRL(selectedProc.priceCents)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-300 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Sinal Anti-No-Show (<code className="font-mono">SecurityDeposit</code>):
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {formatMoneyBRL(selectedProc.depositCents)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Política de Cancelamento: Reembolso 100% até {selectedProc.cancellationPolicy.fullRefundThresholdHours}h
                  antes; retenção de {selectedProc.cancellationPolicy.partialRetentionPercent}% entre{' '}
                  {selectedProc.cancellationPolicy.partialRefundThresholdHours}h e{' '}
                  {selectedProc.cancellationPolicy.fullRefundThresholdHours}h; retenção 100% em No-Show.
                </p>
              </div>
            )}
          </div>

          {/* Right column: available slots & resource breakdown */}
          <div className="lg:col-span-7 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                2. Horários Viáveis em {selectedDate} (UTC)
              </label>
              {loadingSlots ? (
                <div className="text-xs text-slate-400 py-4">Calculando interseção multi-recurso...</div>
              ) : availableSlots.length === 0 ? (
                <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-lg p-3">
                  Nenhum horário disponível para os 3 recursos simultâneos nesta data.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                  {availableSlots.map((slot) => {
                    const active = selectedSlot?.startAt === slot.startAt;
                    return (
                      <button
                        type="button"
                        key={slot.startAt}
                        onClick={() => setSelectedSlot(slot)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-400 font-bold shadow'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {slot.startAt.slice(11, 16)} – {slot.endAt.slice(11, 16)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedSlot && (
              <div className="bg-slate-950 border border-indigo-500/30 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-indigo-300">
                  Recursos que serão bloqueados atomicamente neste horário:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {selectedSlot.allocations.map((a) => (
                    <div
                      key={a.resourceId}
                      className="bg-slate-900 border border-slate-800 rounded p-2 text-[11px]"
                    >
                      <div className="font-mono font-bold text-indigo-300">{a.category}</div>
                      <div className="text-white font-medium truncate">{a.resourceName}</div>
                      <div className="text-slate-400 font-mono mt-1">
                        Ocupado: {a.effectiveStartAt.slice(11, 16)}–{a.effectiveEndAt.slice(11, 16)}
                        {a.cleanupMinutes > 0 && (
                          <span className="text-amber-300 block">
                            (inclui +{a.cleanupMinutes}m esteril.)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!selectedSlot}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition"
              >
                Alocar Recursos Atomicamente &amp; Agendar
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Bookings Table & Lifecycle State Machine */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Máquina de Estados de Agendamentos (<code className="text-indigo-300">Booking Aggregate</code>)
            </h3>
            <p className="text-xs text-slate-400">
              Dica: Cancele o agendamento confirmado de <strong>Roberto Almeida (09:00)</strong> para ver o motor
              reativo disparar uma <code>SlotOffer</code> automática para a 1ª paciente da Smart Waitlist!
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="bg-slate-950/90 border border-slate-800 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">{b.clientName}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${STATUS_BADGE[b.status]}`}>
                    {b.status}
                  </span>
                  {b.originWaitlistEntryId && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                      Recuperado via Smart Waitlist
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-300 font-medium">
                  {b.procedureName} •{' '}
                  <span className="font-mono text-indigo-300">
                    {b.startAt.slice(0, 10)} {b.startAt.slice(11, 16)}–{b.endAt.slice(11, 16)} UTC
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {b.allocations.map((a) => (
                    <span
                      key={a.resourceId}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-900 border border-slate-800 text-slate-300"
                    >
                      {a.category}: {a.resourceName} ({a.effectiveStartAt.slice(11, 16)}–
                      {a.effectiveEndAt.slice(11, 16)})
                    </span>
                  ))}
                </div>

                <div className="text-[11px] text-slate-400 flex flex-wrap gap-4 pt-1">
                  <span>Preço: {formatMoneyBRL(b.priceCents)}</span>
                  <span>
                    Sinal ({b.depositStatus}): {formatMoneyBRL(b.depositCents)}
                  </span>
                  {(b.retainedCents > 0 || b.refundedCents > 0) && (
                    <span className="text-amber-300 font-mono">
                      Liquidação Penalty → Retido: {formatMoneyBRL(b.retainedCents)} | Reembolsado:{' '}
                      {formatMoneyBRL(b.refundedCents)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons for state machine */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {b.status === 'PENDING_DEPOSIT' && (
                  <button
                    onClick={() => void handleLifecycleAction(b.id, 'confirm-deposit')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Confirmar Sinal
                  </button>
                )}

                {b.status === 'CONFIRMED' && (
                  <>
                    <button
                      onClick={() => void handleLifecycleAction(b.id, 'check-in')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Check-in
                    </button>
                    <button
                      onClick={() => void handleLifecycleAction(b.id, 'no-show')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/80 hover:bg-amber-600 text-white"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      No-Show
                    </button>
                  </>
                )}

                {b.status === 'CHECKED_IN' && (
                  <button
                    onClick={() => void handleLifecycleAction(b.id, 'complete')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Concluir
                  </button>
                )}

                {(b.status === 'PENDING_DEPOSIT' || b.status === 'CONFIRMED') && (
                  <button
                    onClick={() => void handleLifecycleAction(b.id, 'cancel')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/90 hover:bg-rose-500 text-white"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancelar (Aciona Waitlist)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
