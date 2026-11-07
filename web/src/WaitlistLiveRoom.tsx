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
  PlusCircle,
  RefreshCw,
  TimerOff,
  Zap,
} from 'lucide-react';

interface Props {
  token: string;
  workspaceId: string;
  selectedDate: string;
  procedures: ServiceProcedureDto[];
  waitlist: WaitlistEntryDto[];
  onRefresh: () => Promise<void>;
}

const WAITLIST_BADGE: Record<WaitlistEntryDto['status'], string> = {
  WAITING: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  OFFERED: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400 animate-pulse',
  CLAIMED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  OFFER_EXPIRED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  CANCELLED: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
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
          desiredStartAt: `${selectedDate}T08:00:00.000Z`,
          desiredEndAt: `${selectedDate}T18:00:00.000Z`,
          priority,
        },
      });
      setBanner({
        type: 'success',
        text: `${clientName} adicionado(a) à Smart Waitlist! Assim que um horário compatível vagar, uma SlotOffer será emitida.`,
      });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status} ${err.code}] ${err.message}` : String(err);
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
        text: `Oferta aceita! WaitlistEntry convertida atomicamente no Booking #${res.booking.id.slice(0, 8)} para ${res.booking.clientName}!`,
      });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status} ${err.code}] ${err.message}` : String(err);
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
        text: `SlotOffer de ${name} marcada como OFFER_EXPIRED → Evento WaitlistOfferExpiredDomainEvent repassou a vaga em cascata para o #2 da fila!`,
      });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof ApiHttpError ? `[HTTP ${err.status} ${err.code}] ${err.message}` : String(err);
      setBanner({ type: 'error', text: msg });
    }
  };

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-fuchsia-950/50 border-fuchsia-500/40 text-fuchsia-100'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-fuchsia-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button onClick={() => setBanner(null)} className="text-xs opacity-75 hover:opacity-100">
            Fechar
          </button>
        </div>
      )}

      {/* Waitlist Live Room Header & Enqueue Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-fuchsia-400" />
          Smart Waitlist Live Room — Ofertas Expiráveis (<code className="text-fuchsia-300">SlotOffer</code>) &amp;
          Cascata Automática
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Quando um agendamento é cancelado, <code className="text-fuchsia-300">OnBookingCancelledMatchWaitlistHandler</code>{' '}
          reserva os recursos por 30 minutos para o 1º candidato compatível. Se a oferta expirar sem aceite,{' '}
          <code className="text-fuchsia-300">OnWaitlistOfferExpiredCascadeHandler</code> transfere a oferta para o 2º da fila!
        </p>

        <form onSubmit={handleJoinWaitlist} className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Procedimento Desejado</label>
            <select
              value={procedureId}
              onChange={(e) => setProcedureId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            >
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome do Paciente</label>
            <input
              type="text"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">E-mail</label>
            <input
              type="email"
              required
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Prioridade (VIP requer ENTERPRISE)</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="STANDARD">STANDARD (FIFO)</option>
              <option value="VIP">VIP (Fura-fila Enterprise)</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
          >
            <PlusCircle className="w-4 h-4" />
            Entrar na Smart Waitlist
          </button>
        </form>
      </div>

      {/* Live Queue Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">
          Fila de Espera Ordenada (Prioridade VIP + FIFO <code>createdAt</code>)
        </h3>

        {waitlist.length === 0 ? (
          <div className="text-xs text-slate-400 py-6 text-center">
            Nenhum candidato na Smart Waitlist neste Workspace.
          </div>
        ) : (
          <div className="space-y-3">
            {waitlist.map((w, index) => {
              const procName = procedures.find((p) => p.id === w.procedureId)?.name ?? w.procedureId;
              return (
                <div
                  key={w.id}
                  className={`rounded-xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    w.status === 'OFFERED'
                      ? 'bg-fuchsia-950/30 border-fuchsia-500/60'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-slate-500">#{index + 1}</span>
                      <span className="text-sm font-semibold text-white">{w.clientName}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${WAITLIST_BADGE[w.status]}`}>
                        {w.status}
                      </span>
                      {w.priority === 'VIP' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Flame className="w-3 h-3" /> VIP
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-300">
                      Procedimento: <strong>{procName}</strong> • Janela desejada:{' '}
                      <span className="font-mono text-slate-400">
                        {w.desiredStartAt.slice(0, 10)} ({w.desiredStartAt.slice(11, 16)}–{w.desiredEndAt.slice(11, 16)} UTC)
                      </span>
                    </div>

                    {w.activeOffer && (
                      <div className="mt-2 bg-fuchsia-950/60 border border-fuchsia-500/40 rounded-lg p-2.5 text-xs text-fuchsia-200 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-fuchsia-400" />
                          Oferta Ativa Exclusiva (<code className="font-mono">SlotOffer</code>):{' '}
                          {w.activeOffer.slotStartAt.slice(11, 16)} – {w.activeOffer.slotEndAt.slice(11, 16)} UTC
                        </div>
                        <div className="text-[11px] font-mono text-fuchsia-300">
                          Expira em: {w.activeOffer.expiresAt.slice(11, 19)} UTC • Recursos pré-reservados:{' '}
                          {w.activeOffer.reservedResourceIds.length}
                        </div>
                      </div>
                    )}

                    {w.claimedBookingId && (
                      <div className="text-xs text-emerald-400 font-mono">
                        ✓ Convertida no Booking #{w.claimedBookingId.slice(0, 8)}
                      </div>
                    )}
                  </div>

                  {/* Interactive Simulation Buttons for OFFERED entries */}
                  {w.status === 'OFFERED' && (
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        onClick={() => void handleClaimOffer(w.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Simular Aceite do Cliente (Claim)
                      </button>

                      <button
                        onClick={() => void handleForceExpireCascade(w.id, w.clientName)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow"
                      >
                        <TimerOff className="w-4 h-4" />
                        Forçar Expiração da Oferta <ArrowRight className="w-3.5 h-3.5" /> Cascata p/ #2
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
