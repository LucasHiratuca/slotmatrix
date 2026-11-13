import React, { useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookingDto,
  ServiceProcedureDto,
  WaitlistEntryDto,
} from './api';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  History,
  PlusCircle,
  TimerOff,
  Zap,
} from 'lucide-react';
import {
  cleanPersonName,
  formatApiError,
  formatDateBR,
  formatTimeBR,
  formatWaitlistPriority,
  formatWaitlistStatus,
} from './labels';

interface Props {
  token: string;
  workspaceId: string;
  selectedDate: string;
  procedures: ServiceProcedureDto[];
  waitlist: WaitlistEntryDto[];
  onRefresh: () => Promise<void>;
}

const WAITLIST_BADGE: Record<WaitlistEntryDto['status'], string> = {
  WAITING:
    'bg-[var(--brand-subtle)] text-brand border-brand/30',
  OFFERED:
    'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border-[var(--status-pending-border)]',
  CLAIMED:
    'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border-[var(--status-confirmed-border)]',
  OFFER_EXPIRED:
    'bg-[var(--status-noshow-bg)] text-[var(--status-noshow-text)] border-[var(--status-noshow-border)]',
  CANCELLED:
    'bg-sunken text-ink-secondary border-border-subtle',
};

export const WaitlistLiveRoom: React.FC<Props> = ({
  token,
  workspaceId,
  selectedDate,
  procedures,
  waitlist,
  onRefresh,
}) => {
  const [procedureId, setProcedureId] = useState(procedures[0]?.id ?? '');
  const [clientName, setClientName] = useState('Gabriel Vasconcelos');
  const [clientEmail, setClientEmail] = useState('gabriel.vasconcelos@cliente.test');
  const [priority, setPriority] = useState<'STANDARD' | 'VIP'>('STANDARD');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeQueue = waitlist.filter(
    (w) => w.status === 'WAITING' || w.status === 'OFFERED',
  );
  const historyEntries = waitlist.filter(
    (w) => w.status !== 'WAITING' && w.status !== 'OFFERED',
  );

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    try {
      await apiRequest<WaitlistEntryDto>('/waitlist', {
        method: 'POST',
        token,
        workspaceId,
        body: {
          procedureId: procedureId || procedures[0]?.id,
          clientName,
          clientEmail,
          desiredStartAt: new Date(`${selectedDate}T08:00:00-03:00`).toISOString(),
          desiredEndAt: new Date(`${selectedDate}T18:00:00-03:00`).toISOString(),
          priority,
        },
      });
      setBanner({
        type: 'success',
        text: `${cleanPersonName(clientName)} foi incluído(a) na lista de espera (${formatWaitlistPriority(priority)}). Assim que um horário compatível liberar, uma vaga reservada para oferta será enviada.`,
      });
      await onRefresh();
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setBanner({ type: 'error', text: msg });
    }
  };

  const handleClaimOffer = async (entryId: string) => {
    setBanner(null);
    try {
      const res = await apiRequest<{ entry: WaitlistEntryDto; booking: BookingDto }>(
        `/waitlist/${entryId}/claim`,
        {
          method: 'POST',
          token,
          workspaceId,
        },
      );
      setBanner({
        type: 'success',
        text: `Oferta confirmada! A vaga foi convertida em reserva confirmada para ${cleanPersonName(res.booking.clientName)}.`,
      });
      await onRefresh();
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setBanner({ type: 'error', text: msg });
    }
  };

  const handleForceExpireCascade = async (entryId: string, name: string) => {
    setBanner(null);
    try {
      await apiRequest<WaitlistEntryDto>(`/waitlist/${entryId}/expire-offer`, {
        method: 'POST',
        token,
        workspaceId,
      });
      setBanner({
        type: 'success',
        text: `A oferta enviada para ${cleanPersonName(name)} foi encerrada e a vaga foi repassada automaticamente para o próximo paciente elegível da fila.`,
      });
      await onRefresh();
    } catch (err) {
      const msg =
        err instanceof ApiHttpError
          ? formatApiError(err.message, err.code)
          : formatApiError(String(err));
      setBanner({ type: 'error', text: msg });
    }
  };

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-[var(--status-confirmed-bg)] border-[var(--status-confirmed-border)] text-[var(--status-confirmed-text)]'
              : 'bg-[var(--status-noshow-bg)] border-[var(--status-noshow-border)] text-[var(--status-noshow-text)]'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Cabeçalho e Formulário de Inclusão na Lista de Espera */}
      <div className="bg-surface border border-border-subtle rounded-xl p-5 shadow-xs">
        <h1 className="text-lg font-semibold text-ink-primary flex items-center gap-2">
          <Zap className="w-5 h-5 text-[var(--status-pending-text)]" />
          Lista de espera
        </h1>
        <p className="text-xs text-ink-secondary mt-1">
          Quando uma reserva é cancelada, o sistema bloqueia temporariamente os recursos por 30 minutos para o primeiro paciente compatível da fila. Se o prazo expirar sem confirmação, a vaga é repassada automaticamente ao próximo paciente.
        </p>

        <form
          onSubmit={handleJoinWaitlist}
          className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-ink-secondary mb-1">
              Procedimento desejado
            </label>
            <select
              value={procedureId}
              onChange={(e) => setProcedureId(e.target.value)}
              className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
            >
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-secondary mb-1">
              Nome do paciente
            </label>
            <input
              type="text"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-secondary mb-1">
              E-mail para notificação
            </label>
            <input
              type="email"
              required
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-secondary mb-1">
              Prioridade na fila
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'STANDARD' | 'VIP')}
              className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-xs text-ink-primary"
            >
              <option value="STANDARD">Padrão (ordem de chegada)</option>
              <option value="VIP">Prioridade alta</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            Adicionar à fila
          </button>
        </form>
      </div>

      {/* Candidatos ativos na Lista de Espera */}
      <div className="bg-surface border border-border-subtle rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink-primary">
            Pacientes na fila (ordenados por prioridade e chegada)
          </h2>
          <span className="text-xs text-ink-secondary tabular-nums">
            {activeQueue.length} aguardando na fila
          </span>
        </div>

        {activeQueue.length === 0 ? (
          <div className="text-center py-6 text-xs text-ink-secondary bg-canvas rounded-lg border border-border-subtle">
            Nenhum paciente aguardando na fila ativa no momento.
          </div>
        ) : (
          <div className="space-y-3">
            {activeQueue.map((w, idx) => {
              const proc = procedures.find((p) => p.id === w.procedureId);
              const cleanName = cleanPersonName(w.clientName);
              const offerStart =
                w.activeOffer?.offeredStartAt ?? w.activeOffer?.slotStartAt ?? '';
              const offerEnd =
                w.activeOffer?.offeredEndAt ?? w.activeOffer?.slotEndAt ?? '';
              return (
                <div
                  key={w.id}
                  className={`rounded-xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    w.status === 'OFFERED'
                      ? 'bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] shadow-sm'
                      : 'bg-canvas border-border-subtle'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 text-xs font-bold rounded bg-sunken text-ink-primary border border-border-subtle tabular-nums">
                        {idx + 1}º
                      </span>
                      <span className="text-sm font-semibold text-ink-primary">
                        {cleanName}
                      </span>
                      <span className="text-xs text-ink-secondary">
                        ({w.clientEmail})
                      </span>
                      {w.priority === 'VIP' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border border-[var(--status-pending-border)]">
                          <Flame className="w-3 h-3" /> {formatWaitlistPriority(w.priority)}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded border ${WAITLIST_BADGE[w.status]}`}
                      >
                        {formatWaitlistStatus(w.status)}
                      </span>
                    </div>

                    <div className="text-xs text-ink-secondary tabular-nums">
                      Procedimento: <strong className="text-ink-primary">{proc?.name ?? 'Procedimento clínico'}</strong> · Janela desejada:{' '}
                      <span className="text-brand font-medium">
                        {formatDateBR(w.desiredStartAt)} · {formatTimeBR(w.desiredStartAt)}–{formatTimeBR(w.desiredEndAt)}
                      </span>
                    </div>

                    {/* Exibe dados de oferta ativa SOMENTE quando o status é OFFERED */}
                    {w.status === 'OFFERED' && w.activeOffer && (
                      <div className="mt-2 p-2.5 rounded-lg bg-surface border border-[var(--status-pending-border)] text-xs text-ink-primary flex flex-wrap items-center gap-3 tabular-nums">
                        <Clock className="w-4 h-4 text-[var(--status-pending-text)] shrink-0" />
                        <span>
                          <strong>Vaga reservada para oferta:</strong>{' '}
                          {offerStart ? formatTimeBR(offerStart) : '--:--'}–
                          {offerEnd ? formatTimeBR(offerEnd) : '--:--'} · Recursos bloqueados:{' '}
                          {w.activeOffer.reservedResourceIds.length} · Expira às:{' '}
                          {formatTimeBR(w.activeOffer.expiresAt)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ações para vagas ofertadas */}
                  {w.status === 'OFFERED' && (
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleClaimOffer(w.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--status-confirmed-border)] hover:opacity-90 text-white shadow-xs transition"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Confirmar aceite do paciente
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleForceExpireCascade(w.id, cleanName)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-surface hover:bg-sunken text-ink-primary border border-border-strong shadow-xs transition"
                      >
                        <TimerOff className="w-4 h-4 text-[var(--status-pending-text)]" />
                        Encerrar oferta <ArrowRight className="w-3.5 h-3.5" /> passar ao próximo
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico de atendimentos convertidos ou encerrados da fila */}
      {historyEntries.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
              <History className="w-4 h-4 text-ink-secondary" />
              Histórico da fila
            </h2>
            <span className="text-xs text-ink-secondary tabular-nums">
              {historyEntries.length} atendimento(s) processado(s)
            </span>
          </div>

          <div className="divide-y divide-border-subtle">
            {historyEntries.map((w) => {
              const proc = procedures.find((p) => p.id === w.procedureId);
              const cleanName = cleanPersonName(w.clientName);
              return (
                <div
                  key={w.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-primary">{cleanName}</span>
                      <span className="text-ink-secondary">({w.clientEmail})</span>
                      {w.priority === 'VIP' && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-sunken text-ink-secondary border border-border-subtle">
                          {formatWaitlistPriority(w.priority)}
                        </span>
                      )}
                    </div>
                    <div className="text-ink-secondary tabular-nums">
                      Procedimento: <strong className="text-ink-primary">{proc?.name ?? 'Procedimento clínico'}</strong> · Janela solicitada:{' '}
                      {formatDateBR(w.desiredStartAt)} · {formatTimeBR(w.desiredStartAt)}–{formatTimeBR(w.desiredEndAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded border ${WAITLIST_BADGE[w.status]}`}
                    >
                      {w.status === 'CLAIMED'
                        ? 'Convertida em reserva confirmada'
                        : formatWaitlistStatus(w.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
