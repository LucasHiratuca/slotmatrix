import React, { useEffect, useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookingDto,
  ServiceProcedureDto,
} from './api';
import {
  cleanPersonName,
  formatApiError,
  formatDateBR,
  formatTimeBR,
} from './labels';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  X,
} from 'lucide-react';

export interface RescheduleModalProps {
  open: boolean;
  booking: BookingDto | {
    id?: string;
    bookingId?: string;
    clientName: string;
    procedureName: string;
    serviceStartAt?: string;
    serviceEndAt?: string;
    startAt?: string;
    endAt?: string;
    procedureId?: string;
  } | null;
  procedures: ServiceProcedureDto[];
  token: string;
  workspaceId: string;
  onClose: () => void;
  onSuccess: (updatedBooking: BookingDto) => void;
  onToast?: (message: string, type?: 'success' | 'error') => void;
}

interface AvailableSlot {
  startAt: string;
  endAt: string;
  allocations?: {
    resourceId: string;
    resourceName: string;
    category: string;
  }[];
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
  open,
  booking,
  procedures,
  token,
  workspaceId,
  onClose,
  onSuccess,
  onToast,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bookingId = booking ? ('id' in booking ? booking.id : booking.bookingId) : null;
  const clientName = booking ? cleanPersonName(booking.clientName) : '';
  const procedureName = booking?.procedureName ?? 'Procedimento';
  const currentStartAt = booking ? ('startAt' in booking ? booking.startAt : booking.serviceStartAt) : null;

  const matchedProcedure = procedures.find(
    (p) =>
      ('procedureId' in (booking ?? {}) && p.id === (booking as any).procedureId) ||
      p.name === procedureName,
  );

  useEffect(() => {
    if (!open || !booking) return;
    setErrorMessage(null);
    setSelectedSlotStartAt(null);
    const initialDate = currentStartAt
      ? currentStartAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setSelectedDate(initialDate);
  }, [open, booking, currentStartAt]);

  useEffect(() => {
    if (!open || !selectedDate || !matchedProcedure) return;

    let cancelled = false;
    const fetchSlots = async () => {
      setLoadingSlots(true);
      setErrorMessage(null);
      try {
        const fromIso = `${selectedDate}T08:00:00.000Z`;
        const toIso = `${selectedDate}T20:00:00.000Z`;
        const res = await apiRequest<{ availableSlots: AvailableSlot[] }>(
          `/procedures/${matchedProcedure.id}/available-slots?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&stepMinutes=30`,
          { token, workspaceId },
        );
        if (!cancelled) {
          setAvailableSlots(res.availableSlots ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof ApiHttpError
              ? formatApiError(err.message, err.code)
              : 'Não foi possível buscar os horários disponíveis para esta data.';
          setErrorMessage(msg);
          setAvailableSlots([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    };

    void fetchSlots();
    return () => {
      cancelled = true;
    };
  }, [open, selectedDate, matchedProcedure?.id, token, workspaceId]);

  if (!open || !booking || !bookingId) return null;

  const handleConfirmReschedule = async () => {
    if (!selectedSlotStartAt) {
      setErrorMessage('Por favor, selecione um novo horário para o agendamento.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await apiRequest<BookingDto>(`/bookings/${bookingId}/reschedule`, {
        method: 'POST',
        token,
        workspaceId,
        body: {
          startAt: selectedSlotStartAt,
        },
      });

      onToast?.(
        `Reserva de ${clientName} reagendada para ${formatDateBR(selectedSlotStartAt)} às ${formatTimeBR(selectedSlotStartAt)} com sucesso!`,
        'success',
      );
      onSuccess(updated);
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : 'Falha ao reagendar reserva. Verifique a disponibilidade dos recursos.';
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-testid="reschedule-modal"
        aria-modal="true"
        aria-label={`Reagendar reserva de ${clientName}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface border border-border-strong rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand" />
              <h2 className="text-base font-semibold text-ink-primary">
                Reagendar atendimento
              </h2>
            </div>
            <p className="text-xs text-ink-secondary mt-1">
              <strong className="text-ink-primary">{clientName}</strong> · {procedureName}
              {matchedProcedure && ` (${matchedProcedure.durationMinutes} min)`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar reagendamento"
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-sunken transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Horário atual */}
          {currentStartAt && (
            <div className="p-3 rounded-xl bg-canvas border border-border-subtle flex items-center justify-between text-xs text-ink-secondary">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-muted" />
                Horário agendado atualmente:
              </span>
              <strong className="text-ink-primary tabular-nums">
                {formatDateBR(currentStartAt)} às {formatTimeBR(currentStartAt)}
              </strong>
            </div>
          )}

          {/* Seleção de Data */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink-primary flex items-center justify-between">
              <span>Nova data desejada</span>
              <span className="text-[11px] font-normal text-ink-muted">Horário de funcionamento: 08:00 às 20:00</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setSelectedSlotStartAt(null);
                }
              }}
              className="w-full px-3 py-2 rounded-lg bg-canvas border border-border-subtle text-xs text-ink-primary font-medium focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>

          {/* Seleção de Horário Disponível com alocação multi-recurso garantida */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink-primary">
                Horários livres com 3 recursos simultâneos
              </span>
              {loadingSlots && (
                <span className="inline-flex items-center gap-1 text-[11px] text-brand">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Buscando vagas...
                </span>
              )}
            </div>

            {loadingSlots ? (
              <div className="grid grid-cols-4 gap-2 py-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-9 bg-sunken rounded-lg animate-pulse" />
                ))}
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="p-4 rounded-xl bg-canvas border border-border-subtle text-center text-xs text-ink-secondary space-y-1">
                <p>Nenhum horário livre simultâneo encontrado para esta data.</p>
                <p className="text-[11px] text-ink-muted">
                  Tente selecionar outro dia para encontrar especialistas, salas e equipamentos livres.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-52 overflow-y-auto p-1 border border-border-subtle/50 rounded-xl bg-canvas/40">
                {availableSlots.map((slot) => {
                  const isSelected = selectedSlotStartAt === slot.startAt;
                  const isSameAsCurrent =
                    currentStartAt &&
                    new Date(slot.startAt).getTime() === new Date(currentStartAt).getTime();
                  const timeStr = formatTimeBR(slot.startAt);

                  return (
                    <button
                      key={slot.startAt}
                      type="button"
                      onClick={() => setSelectedSlotStartAt(slot.startAt)}
                      className={`px-2.5 py-2 rounded-lg text-xs font-semibold tabular-nums transition border flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-[var(--btn-primary-bg)] text-white border-[var(--btn-primary-bg)] shadow-sm'
                          : isSameAsCurrent
                          ? 'bg-sunken text-ink-muted border-dashed border-border-strong opacity-75'
                          : 'bg-surface hover:bg-sunken text-ink-primary border-border-subtle'
                      }`}
                    >
                      <span>{timeStr}</span>
                      {isSameAsCurrent && (
                        <span className="text-[9px] font-normal leading-tight">Atual</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Erro */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-[var(--status-noshow-bg)] border border-[var(--status-noshow-border)] flex items-start gap-2 text-xs text-[var(--status-noshow-text)]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Resumo da nova alocação quando horário selecionado */}
          {selectedSlotStartAt && (
            <div className="p-3 rounded-xl bg-brand-tint/60 border border-brand/30 text-xs text-ink-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                <span>
                  Novo horário: <strong>{formatDateBR(selectedSlotStartAt)} às {formatTimeBR(selectedSlotStartAt)}</strong>
                </span>
              </div>
              <span className="text-[11px] text-brand font-medium">Recursos liberados imediatamente</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-subtle bg-canvas flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface border border-border-subtle text-xs font-medium text-ink-primary hover:bg-sunken transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selectedSlotStartAt || submitting}
            onClick={() => void handleConfirmReschedule()}
            className="px-4 py-2 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition shadow-xs flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Reagendando...</span>
              </>
            ) : (
              <span>Confirmar reagendamento</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
