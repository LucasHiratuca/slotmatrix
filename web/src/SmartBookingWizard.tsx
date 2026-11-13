import React, { useEffect, useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookableResourceDto,
  BookingDto,
  ServiceProcedureDto,
} from './api';
import { AuditEntryItem } from './AuditView';
import { BookingDetailsDrawer } from './BookingDetailsDrawer';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CreditCard,
  Cpu,
  Eye,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import {
  cleanPersonName,
  formatApiError,
  formatBookingStatus,
  formatCapability,
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
  formatDepositStatus,
  formatDepositWithPercentage,
  formatResourceCategory,
  formatTimeBR,
} from './labels';

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
  onDateChange?: (date: string) => void;
  procedures: ServiceProcedureDto[];
  bookings: BookingDto[];
  resourcesCatalog?: BookableResourceDto[];
  auditLogs?: AuditEntryItem[];
  role?: 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST' | null;
  onRefresh: () => Promise<void>;
  onOptimisticStatusUpdate?: (
    bookingId: string,
    newStatus: BookingDto['status'],
    updatedBooking?: BookingDto,
  ) => void;
  initialOpenNewBooking?: boolean;
  initialPrefillHour?: number | null;
  initialProcedureId?: string | null;
  initialClientName?: string | null;
  initialClientEmail?: string | null;
  onConsumePrefill?: () => void;
  onNavigateToAgenda?: (dateIso: string, bookingId: string) => void;
}

const STATUS_BADGE: Record<BookingDto['status'], string> = {
  PENDING_DEPOSIT:
    'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border-[var(--status-pending-border)]',
  CONFIRMED:
    'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border-[var(--status-confirmed-border)]',
  CHECKED_IN:
    'bg-[var(--status-checkedin-bg)] text-[var(--status-checkedin-text)] border-[var(--status-checkedin-border)]',
  COMPLETED:
    'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-[var(--status-completed-border)]',
  CANCELLED:
    'bg-sunken text-ink-secondary border-border-subtle',
  NO_SHOW:
    'bg-[var(--status-noshow-bg)] text-[var(--status-noshow-text)] border-[var(--status-noshow-border)]',
  EXPIRED:
    'bg-sunken text-ink-secondary border-border-subtle',
};

export const SmartBookingWizard: React.FC<Props> = ({
  token,
  workspaceId,
  selectedDate,
  onDateChange,
  procedures,
  bookings,
  resourcesCatalog = [],
  auditLogs = [],
  role = null,
  onRefresh,
  onOptimisticStatusUpdate,
  initialOpenNewBooking = false,
  initialPrefillHour = null,
  initialProcedureId = null,
  initialClientName = null,
  initialClientEmail = null,
  onConsumePrefill,
  onNavigateToAgenda,
}) => {
  const [showNewBookingPanel, setShowNewBookingPanel] = useState<boolean>(initialOpenNewBooking);
  const [selectedProcedureId, setSelectedProcedureId] = useState<string>(
    initialProcedureId || procedures[0]?.id || '',
  );
  const [availableSlots, setAvailableSlots] = useState<AvailableSlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlotOption | null>(null);
  const [clientName, setClientName] = useState(initialClientName || 'Marina Albuquerque');
  const [clientEmail, setClientEmail] = useState(
    initialClientEmail || 'marina.albuquerque@cliente.test',
  );
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [drawerBookingId, setDrawerBookingId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    if (initialClientName) {
      setClientName(initialClientName);
    }
    if (initialClientEmail) {
      setClientEmail(initialClientEmail);
    }
  }, [initialClientName, initialClientEmail]);

  useEffect(() => {
    if (initialOpenNewBooking) {
      setShowNewBookingPanel(true);
    }
  }, [initialOpenNewBooking]);

  useEffect(() => {
    if (initialProcedureId && procedures.some((p) => p.id === initialProcedureId)) {
      setSelectedProcedureId(initialProcedureId);
    }
  }, [initialProcedureId, procedures]);

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
      const from = new Date(`${dateStr}T08:00:00-03:00`).toISOString();
      const to = new Date(`${dateStr}T18:00:00-03:00`).toISOString();
      const res = await apiRequest<{ availableSlots: AvailableSlotOption[] }>(
        `/procedures/${procId}/available-slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&stepMinutes=30`,
        { token, workspaceId },
      );
      setAvailableSlots(res.availableSlots);
      if (res.availableSlots.length > 0) {
        if (initialPrefillHour !== null) {
          const matched = res.availableSlots.find((s) => {
            const hh = Number(formatTimeBR(s.startAt).split(':')[0]);
            return hh === initialPrefillHour;
          });
          setSelectedSlot(matched ?? res.availableSlots[0]);
          onConsumePrefill?.();
        } else {
          setSelectedSlot(res.availableSlots[0]);
        }
      }
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (selectedProcedureId && selectedDate && showNewBookingPanel) {
      void loadAvailableSlots(selectedProcedureId, selectedDate);
    }
  }, [selectedProcedureId, selectedDate, workspaceId, showNewBookingPanel]);

  const selectedProc = procedures.find((p) => p.id === selectedProcedureId);

  const handleScheduleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !selectedProcedureId) return;
    setFeedback(null);
    setSubmitting(true);
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
        text: `Reserva criada (${formatBookingStatus(created.status)}) para ${cleanPersonName(created.clientName)} com alocação simultânea de ${created.allocations.length} recursos.`,
      });
      await onRefresh();
      setShowNewBookingPanel(false);
      setSelectedSlot(null);
      const bookingDate = created.startAt ? created.startAt.split('T')[0] : selectedDate;
      onNavigateToAgenda?.(bookingDate, created.id);
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setFeedback({ type: 'error', text: msg });
    } finally {
      setSubmitting(false);
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
            ? { reason: 'Cancelamento solicitado na central operacional — ofertando vaga para a lista de espera' }
            : {},
      });
      const actionDetails =
        action === 'cancel'
          ? ` · Retido: ${formatCurrencyBRL(updated.retainedCents)} · Reembolsado: ${formatCurrencyBRL(updated.refundedCents)}. Se houver candidatos na lista de espera, uma vaga reservada para oferta foi enviada.`
          : action === 'no-show'
          ? ` · Sinal retido: ${formatCurrencyBRL(updated.retainedCents)}.`
          : '';
      setFeedback({
        type: 'success',
        text: `Reserva atualizada para "${formatBookingStatus(updated.status)}"${actionDetails}`,
      });
      await onRefresh();
      if (selectedProcedureId && showNewBookingPanel) {
        await loadAvailableSlots(selectedProcedureId, selectedDate);
      }
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setFeedback({ type: 'error', text: msg });
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        cleanPersonName(b.clientName).toLowerCase().includes(q) ||
        b.clientEmail.toLowerCase().includes(q) ||
        b.procedureName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página de Reservas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border-subtle rounded-xl p-5 shadow-xs">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Reservas</h1>
          <p className="text-xs text-ink-secondary mt-0.5">
            Acompanhe todas as reservas da clínica, gerencie sinais de reserva e crie novos agendamentos com alocação simultânea de recursos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewBookingPanel((prev) => !prev)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
            showNewBookingPanel
              ? 'bg-sunken text-ink-primary hover:bg-border-subtle border border-border-subtle'
              : 'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white shadow-xs'
          }`}
        >
          {showNewBookingPanel ? (
            <>
              <X className="w-4 h-4" /> Fechar novo agendamento
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" /> Novo agendamento
            </>
          )}
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)]'
              : 'bg-[var(--status-noshow-bg)] border-[var(--status-noshow-border)] text-[var(--status-noshow-text)]'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Fluxo "Novo agendamento" */}
      {showNewBookingPanel && (
        <div className="bg-surface border border-brand/30 rounded-xl p-6 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border-subtle">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--brand-subtle)] border border-brand/30 text-brand text-xs font-medium mb-2">
                <Sparkles className="w-3.5 h-3.5" /> Alocação combinada de especialista, sala e equipamento
              </div>
              <h2 className="text-base font-semibold text-ink-primary flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-brand" />
                Novo agendamento
              </h2>
              <p className="text-xs text-ink-secondary mt-1">
                O sistema cruza as janelas de trabalho, preparo, atendimento e limpeza de cada recurso exigido pelo procedimento antes de liberar um horário.
              </p>
            </div>

            {onDateChange && (
              <div>
                <label className="block text-xs text-ink-secondary mb-1 font-medium">
                  Data do atendimento
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => onDateChange(e.target.value)}
                  className="bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary focus:outline-none focus:border-brand tabular-nums"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
            {/* Seleção de Procedimento */}
            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-xs font-semibold text-ink-primary">
                Escolha o procedimento
              </h3>
              <div className="space-y-2.5">
                {procedures.map((proc) => {
                  const isSelected = proc.id === selectedProcedureId;
                  return (
                    <button
                      key={proc.id}
                      type="button"
                      onClick={() => setSelectedProcedureId(proc.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition ${
                        isSelected
                          ? 'bg-[var(--brand-subtle)] border-brand ring-1 ring-brand/40'
                          : 'bg-canvas border-border-subtle hover:border-border-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-ink-primary">
                          {proc.name}
                        </span>
                        <span className="text-xs font-semibold text-[var(--status-confirmed-text)] tabular-nums">
                          {formatCurrencyBRL(proc.priceCents)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-ink-secondary">
                        <span className="px-2 py-0.5 rounded bg-surface border border-border-subtle tabular-nums">
                          Atendimento: {proc.durationMinutes} min
                        </span>
                        {proc.depositCents > 0 && (
                          <span className="px-2 py-0.5 rounded bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)] text-[var(--status-pending-text)] flex items-center gap-1 tabular-nums">
                            <ShieldCheck className="w-3 h-3" /> Sinal de reserva:{' '}
                            {formatDepositWithPercentage(proc.depositCents, proc.priceCents)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-border-subtle space-y-1">
                        {proc.requirements.map((req, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs text-ink-secondary"
                          >
                            <span className="flex items-center gap-1 font-medium text-ink-primary">
                              {req.category === 'SPECIALIST' && (
                                <UserCheck className="w-3 h-3 text-[var(--res-specialist-text)]" />
                              )}
                              {req.category === 'ROOM' && (
                                <Building2 className="w-3 h-3 text-[var(--res-room-text)]" />
                              )}
                              {req.category === 'EQUIPMENT' && (
                                <Cpu className="w-3 h-3 text-[var(--res-equipment-text)]" />
                              )}
                              {formatResourceCategory(req.category)}:{' '}
                              {req.requiredCapabilities.map(formatCapability).join(', ')}
                            </span>
                            <span className="text-ink-secondary tabular-nums">
                              Preparo {req.prepMinutes}m · Limpeza {req.cleanupMinutes}m
                            </span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seleção de Horário Disponível */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-ink-primary">
                  Horários disponíveis ({formatDateBR(selectedDate)})
                </h3>
                <span className="text-xs text-brand font-medium tabular-nums">
                  {availableSlots.length} opções
                </span>
              </div>

              {loadingSlots ? (
                <div className="p-8 text-center text-ink-secondary text-xs bg-canvas rounded-xl border border-border-subtle">
                  Calculando disponibilidade simultânea de recursos...
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="p-6 text-center bg-canvas rounded-xl border border-border-subtle space-y-2">
                  <Clock className="w-6 h-6 text-[var(--status-pending-text)] mx-auto" />
                  <p className="text-xs font-medium text-ink-primary">
                    Nenhum horário com todos os recursos disponíveis nesta data.
                  </p>
                  <p className="text-xs text-ink-secondary">
                    Escolha outra data ou inclua o paciente na Lista de espera.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto pr-1">
                  {availableSlots.map((slot) => {
                    const isSelected = selectedSlot?.startAt === slot.startAt;
                    return (
                      <button
                        type="button"
                        key={slot.startAt}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? 'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] ring-1 ring-[var(--status-confirmed-border)]'
                            : 'bg-canvas border-border-subtle hover:border-border-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-ink-primary flex items-center gap-1.5 tabular-nums">
                            <Clock className="w-4 h-4 text-[var(--status-confirmed-text)]" />
                            {formatTimeBR(slot.startAt)} – {formatTimeBR(slot.endAt)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border border-[var(--status-confirmed-border)] tabular-nums">
                            {slot.allocations.length} recursos livres
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {slot.allocations.map((a) => (
                            <span
                              key={a.resourceId}
                              className="text-xs px-2 py-0.5 rounded bg-surface text-ink-secondary border border-border-subtle"
                            >
                              {formatResourceCategory(a.category)}:{' '}
                              <strong className="text-ink-primary">{a.resourceName}</strong>
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dados do Paciente e Confirmação */}
            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-xs font-semibold text-ink-primary">
                Dados do paciente e confirmação
              </h3>
              <form
                onSubmit={handleScheduleBooking}
                className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3.5"
              >
                <div>
                  <label className="block text-xs text-ink-secondary mb-1">
                    Nome completo do paciente
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-secondary mb-1">
                    E-mail do paciente
                  </label>
                  <input
                    type="email"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
                  />
                </div>

                {selectedSlot && selectedProc ? (
                  <div className="p-3 rounded-lg bg-[var(--brand-subtle)] border border-brand/30 space-y-1.5 text-xs">
                    <div className="font-semibold text-brand">
                      Resumo da reserva:
                    </div>
                    <div className="text-ink-secondary">
                      Procedimento: <strong className="text-ink-primary">{selectedProc.name}</strong>
                    </div>
                    <div className="text-ink-secondary tabular-nums">
                      Horário:{' '}
                      <strong className="text-ink-primary">
                        {formatDateBR(selectedDate)} · {formatTimeBR(selectedSlot.startAt)} às{' '}
                        {formatTimeBR(selectedSlot.endAt)}
                      </strong>
                    </div>
                    {selectedProc.depositCents > 0 && (
                      <div className="text-[var(--status-pending-text)] font-medium pt-1 tabular-nums">
                        Sinal de reserva:{' '}
                        {formatDepositWithPercentage(
                          selectedProc.depositCents,
                          selectedProc.priceCents,
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-surface border border-border-subtle text-xs text-ink-secondary text-center">
                    Selecione um horário disponível ao lado para habilitar a reserva.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!selectedSlot || submitting}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-40 text-white transition flex items-center justify-center gap-2 shadow-xs"
                >
                  {submitting ? (
                    'Registrando reserva...'
                  ) : (
                    <>
                      Confirmar reserva
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Reservas */}
      <div className="bg-surface border border-border-subtle rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">
              Reservas registradas ({filteredBookings.length})
            </h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Gerencie o andamento de cada atendimento: confirmação de sinal de reserva, entrada do paciente, conclusão, falta ou cancelamento com acionamento automático da lista de espera.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar paciente ou procedimento..."
                className="bg-canvas border border-border-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink-primary placeholder-ink-muted focus:outline-none focus:border-brand"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-canvas border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-ink-primary focus:outline-none focus:border-brand"
            >
              <option value="ALL">Todos os status ({bookings.length})</option>
              <option value="CONFIRMED">Confirmada</option>
              <option value="PENDING_DEPOSIT">Aguardando sinal</option>
              <option value="CHECKED_IN">Em atendimento</option>
              <option value="COMPLETED">Concluída</option>
              <option value="NO_SHOW">Falta registrada</option>
              <option value="CANCELLED">Cancelada</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredBookings.map((b) => {
            const cleanClient = cleanPersonName(b.clientName);
            return (
              <div
                key={b.id}
                className="bg-canvas border border-border-subtle rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-primary">
                      {cleanClient}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded border ${STATUS_BADGE[b.status]}`}
                    >
                      {formatBookingStatus(b.status)}
                    </span>
                    {b.originWaitlistEntryId && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border border-[var(--status-pending-border)]">
                        Recuperada pela lista de espera
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-ink-secondary font-medium tabular-nums">
                    {b.procedureName} ·{' '}
                    <span className="text-brand font-semibold">
                      {formatDateTimeBR(b.startAt)} às {formatTimeBR(b.endAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {b.allocations.map((a) => (
                      <span
                        key={a.resourceId}
                        className="px-2 py-0.5 text-xs rounded bg-surface border border-border-subtle text-ink-secondary tabular-nums"
                      >
                        {formatResourceCategory(a.category)}: {a.resourceName} (
                        {formatTimeBR(a.effectiveStartAt)}–{formatTimeBR(a.effectiveEndAt)})
                      </span>
                    ))}
                  </div>

                  <div className="text-xs text-ink-secondary flex flex-wrap gap-4 pt-1 tabular-nums">
                    <span>Valor: {formatCurrencyBRL(b.priceCents)}</span>
                    <span>
                      Sinal de reserva ({formatDepositStatus(b.depositStatus)}):{' '}
                      {formatDepositWithPercentage(b.depositCents, b.priceCents)}
                    </span>
                    {(b.retainedCents > 0 || b.refundedCents > 0) && (
                      <span className="text-[var(--status-pending-text)] font-medium">
                        Retido: {formatCurrencyBRL(b.retainedCents)} · Reembolsado:{' '}
                        {formatCurrencyBRL(b.refundedCents)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Botões de ação */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDrawerBookingId(b.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-sunken text-ink-primary border border-border-subtle transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-ink-muted" />
                    Ver detalhes
                  </button>

                  {b.status === 'PENDING_DEPOSIT' && (
                    <button
                      type="button"
                      onClick={() => void handleLifecycleAction(b.id, 'confirm-deposit')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--status-confirmed-border)] hover:opacity-90 text-white transition"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Confirmar sinal
                    </button>
                  )}

                  {b.status === 'CONFIRMED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleLifecycleAction(b.id, 'check-in')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Registrar chegada
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLifecycleAction(b.id, 'no-show')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-sunken text-[var(--status-pending-text)] border border-[var(--status-pending-border)] transition"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Registrar falta
                      </button>
                    </>
                  )}

                  {b.status === 'CHECKED_IN' && (
                    <button
                      type="button"
                      onClick={() => void handleLifecycleAction(b.id, 'complete')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Concluir atendimento
                    </button>
                  )}

                  {(b.status === 'PENDING_DEPOSIT' || b.status === 'CONFIRMED') && (
                    <button
                      type="button"
                      onClick={() => void handleLifecycleAction(b.id, 'cancel')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-[var(--status-noshow-bg)] text-[var(--status-noshow-text)] border border-[var(--status-noshow-border)] transition"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelar e ofertar vaga
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredBookings.length === 0 && (
            <div className="py-8 text-center text-xs text-ink-secondary">
              Nenhuma reserva encontrada para os filtros selecionados.
            </div>
          )}
        </div>
      </div>

      {/* Drawer Compartilhado de Detalhes da Reserva */}
      <BookingDetailsDrawer
        open={Boolean(drawerBookingId)}
        bookingId={drawerBookingId}
        bookings={bookings}
        procedures={procedures}
        resourcesCatalog={resourcesCatalog}
        auditLogs={auditLogs}
        role={role}
        token={token}
        workspaceId={workspaceId}
        onClose={() => setDrawerBookingId(null)}
        onOptimisticStatusUpdate={onOptimisticStatusUpdate}
        onRefresh={onRefresh}
        onToast={(msg, type) => setFeedback({ type: type ?? 'success', text: msg })}
        onCancelAndRecreate={(prefill) => {
          setDrawerBookingId(null);
          setSelectedProcedureId(prefill.procedureId);
          setClientName(prefill.clientName);
          setClientEmail(prefill.clientEmail);
          setShowNewBookingPanel(true);
        }}
      />
    </div>
  );
};
