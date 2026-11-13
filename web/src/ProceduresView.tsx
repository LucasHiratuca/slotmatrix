import React, { useState } from 'react';
import { apiRequest, ApiHttpError, ServiceProcedureDto } from './api';
import {
  formatCapability,
  formatCurrencyBRL,
  formatDepositWithPercentage,
  formatResourceCategory,
} from './labels';
import {
  AlertCircle,
  Box,
  CalendarPlus,
  Clock,
  Plus,
  ShieldCheck,
  Stethoscope,
  Wrench,
  X,
} from 'lucide-react';

interface ProceduresViewProps {
  procedures: ServiceProcedureDto[];
  canManageProcedures?: boolean;
  onRefresh?: () => Promise<void>;
  onScheduleProcedure?: (procedureId: string) => void;
}

const CATEGORY_STYLE: Record<
  'SPECIALIST' | 'ROOM' | 'EQUIPMENT',
  {
    icon: React.ReactNode;
    barClass: string;
    prepClass: string;
    cleanupClass: string;
    textClass: string;
  }
> = {
  SPECIALIST: {
    icon: <Stethoscope className="w-3.5 h-3.5 text-[var(--res-specialist-text)]" />,
    barClass: 'bg-[var(--res-specialist-bar)] border-[var(--res-specialist-border)]',
    prepClass: 'bg-[var(--res-specialist-bg)] border-[var(--res-specialist-border)]',
    cleanupClass: 'bg-cleanup-stripes border-[var(--cleanup-border)]',
    textClass: 'text-[var(--res-specialist-text)]',
  },
  ROOM: {
    icon: <Box className="w-3.5 h-3.5 text-[var(--res-room-text)]" />,
    barClass: 'bg-[var(--res-room-bar)] border-[var(--res-room-border)]',
    prepClass: 'bg-[var(--res-room-bg)] border-[var(--res-room-border)]',
    cleanupClass: 'bg-cleanup-stripes border-[var(--cleanup-border)]',
    textClass: 'text-[var(--res-room-text)]',
  },
  EQUIPMENT: {
    icon: <Wrench className="w-3.5 h-3.5 text-[var(--res-equipment-text)]" />,
    barClass: 'bg-[var(--res-equipment-bar)] border-[var(--res-equipment-border)]',
    prepClass: 'bg-[var(--res-equipment-bg)] border-[var(--res-equipment-border)]',
    cleanupClass: 'bg-cleanup-stripes border-[var(--cleanup-border)]',
    textClass: 'text-[var(--res-equipment-text)]',
  },
};

export const ProceduresView: React.FC<ProceduresViewProps> = ({
  procedures,
  canManageProcedures = true,
  onRefresh,
  onScheduleProcedure,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(40);
  const [priceBRL, setPriceBRL] = useState('350');
  const [depositPercent, setDepositPercent] = useState(0);
  const [hasSpecialist, setHasSpecialist] = useState(true);
  const [hasRoom, setHasRoom] = useState(true);
  const [roomCleanupMinutes, setRoomCleanupMinutes] = useState(15);
  const [hasEquipment, setHasEquipment] = useState(true);
  const [equipmentCleanupMinutes, setEquipmentCleanupMinutes] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenModal = () => {
    setName('');
    setDurationMinutes(40);
    setPriceBRL('350');
    setDepositPercent(0);
    setHasSpecialist(true);
    setHasRoom(true);
    setRoomCleanupMinutes(15);
    setHasEquipment(true);
    setEquipmentCleanupMinutes(10);
    setError(null);
    setIsModalOpen(true);
  };

  const handleCreateProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Informe o nome do procedimento.');
      return;
    }

    if (!hasSpecialist && !hasRoom && !hasEquipment) {
      setError('O procedimento precisa de pelo menos um recurso (Especialista, Sala ou Equipamento).');
      return;
    }

    const cleanPrice = parseFloat(priceBRL.replace(/\./g, '').replace(',', '.')) || 0;
    const priceCents = Math.round(cleanPrice * 100);
    const depositCents = Math.round((priceCents * depositPercent) / 100);

    const requirements: any[] = [];
    if (hasSpecialist) {
      requirements.push({
        category: 'SPECIALIST',
        requiredCapabilities: [],
        prepMinutes: 0,
        cleanupMinutes: 0,
      });
    }
    if (hasRoom) {
      requirements.push({
        category: 'ROOM',
        requiredCapabilities: [],
        prepMinutes: 0,
        cleanupMinutes: Number(roomCleanupMinutes) || 0,
      });
    }
    if (hasEquipment) {
      requirements.push({
        category: 'EQUIPMENT',
        requiredCapabilities: [],
        prepMinutes: 0,
        cleanupMinutes: Number(equipmentCleanupMinutes) || 0,
      });
    }

    try {
      setIsSubmitting(true);
      await apiRequest('/procedures', {
        method: 'POST',
        body: {
          name: name.trim(),
          durationMinutes: Number(durationMinutes),
          priceCents,
          depositCents,
          currency: 'BRL',
          requirements,
        },
      });
      await onRefresh?.();
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao cadastrar o procedimento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Procedimentos</h1>
          <p className="text-xs text-ink-secondary mt-0.5">
            Catálogo de procedimentos clínicos, valores, sinal de reserva e recursos exigidos simultaneamente.
          </p>
        </div>

        {canManageProcedures && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-hover transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Novo procedimento
          </button>
        )}
      </div>

      {procedures.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-xl p-8 text-center text-xs text-ink-secondary flex flex-col items-center gap-3">
          <p>Nenhum procedimento cadastrado nesta clínica.</p>
          {canManageProcedures && (
            <button
              type="button"
              onClick={handleOpenModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-hover transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Cadastrar primeiro procedimento
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {procedures.map((proc) => {
            const maxPrep = Math.max(0, ...proc.requirements.map((r) => r.prepMinutes));
            const maxCleanup = Math.max(0, ...proc.requirements.map((r) => r.cleanupMinutes));
            const totalAxisMinutes = Math.max(1, maxPrep + proc.durationMinutes + maxCleanup);

            return (
              <article
                key={proc.id}
                className="bg-surface border border-border-subtle rounded-xl p-5 flex flex-col justify-between gap-5 shadow-xs"
              >
                {/* Cabeçalho do procedimento */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-ink-primary">{proc.name}</h2>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-ink-secondary tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-ink-muted" />
                          Atendimento: {proc.durationMinutes} min
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-ink-primary">
                          <ShieldCheck className="w-3.5 h-3.5 text-brand" />
                          Sinal de reserva: {formatDepositWithPercentage(proc.depositCents, proc.priceCents)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-base font-bold text-ink-primary">
                        {formatCurrencyBRL(proc.priceCents)}
                      </div>
                      <div className="text-xs text-ink-secondary">Valor total</div>
                    </div>
                  </div>

                  {/* Requisitos de recursos simultâneos com barras de tempo */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider">
                      Recursos e tempos exigidos simultaneamente
                    </div>

                    {proc.requirements.map((req, idx) => {
                      const style = CATEGORY_STYLE[req.category];
                      const categoryLabel = formatResourceCategory(req.category);

                      const leftSpacerPct = (req.prepMinutes / totalAxisMinutes) * 100;
                      const prepPct = (req.prepMinutes / totalAxisMinutes) * 100;
                      const servicePct = (proc.durationMinutes / totalAxisMinutes) * 100;
                      const cleanupPct = (req.cleanupMinutes / totalAxisMinutes) * 100;

                      const timeParts: string[] = [];
                      if (req.prepMinutes > 0) timeParts.push(`Preparo ${req.prepMinutes}m`);
                      timeParts.push(`Atend. ${proc.durationMinutes}m`);
                      if (req.cleanupMinutes > 0) timeParts.push(`Esterilização ${req.cleanupMinutes}m`);

                      return (
                        <div key={idx} className="space-y-1 text-xs">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-ink-primary">
                              {style.icon}
                              <span>{categoryLabel}</span>
                              <div className="flex flex-wrap gap-1 ml-1">
                                {req.requiredCapabilities.map((cap) => (
                                  <span
                                    key={cap}
                                    className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-ink-secondary text-xs"
                                  >
                                    {formatCapability(cap)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className="text-ink-secondary tabular-nums">
                              {categoryLabel}: {timeParts.join(' · ')}
                            </span>
                          </div>

                          {/* Barra proporcional: Preparo | Atendimento | Limpeza */}
                          <div className="w-full h-5 bg-sunken rounded-md overflow-hidden flex items-stretch border border-border-subtle">
                            {leftSpacerPct > 0 && <div style={{ width: `${leftSpacerPct}%` }} />}
                            {req.prepMinutes > 0 && (
                              <div
                                style={{ width: `${prepPct}%` }}
                                title={`Preparo: ${req.prepMinutes} min`}
                                className={`h-full border-r ${style.prepClass} flex items-center justify-center text-xs text-ink-primary tabular-nums px-1 overflow-hidden`}
                              >
                                {req.prepMinutes}m
                              </div>
                            )}
                            <div
                              style={{ width: `${servicePct}%` }}
                              title={`Atendimento: ${proc.durationMinutes} min`}
                              className={`h-full ${style.barClass} flex items-center justify-center text-xs font-medium text-white tabular-nums px-2 overflow-hidden`}
                            >
                              Atendimento ({proc.durationMinutes} min)
                            </div>
                            {req.cleanupMinutes > 0 && (
                              <div
                                style={{ width: `${cleanupPct}%` }}
                                title={`Limpeza e esterilização: ${req.cleanupMinutes} min`}
                                className={`h-full border-l ${style.cleanupClass} flex items-center justify-center text-xs text-ink-secondary tabular-nums px-1.5 overflow-hidden whitespace-nowrap`}
                              >
                                {cleanupPct >= 22 ? `Limpeza ${req.cleanupMinutes}m` : `+${req.cleanupMinutes}m`}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {onScheduleProcedure && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onScheduleProcedure(proc.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-canvas hover:bg-sunken text-ink-primary border border-border-subtle transition"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-brand" />
                      Agendar este procedimento
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro de Procedimento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-lg shadow-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-canvas">
              <div>
                <h2 className="text-base font-semibold text-ink-primary">Novo Procedimento Clínico</h2>
                <p className="text-xs text-ink-secondary">
                  Cadastre o serviço, duração e requisitos de alocação simultânea.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-sunken transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProcedure} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-[var(--alert-error-bg)] border border-[var(--alert-error-border)] rounded-lg text-xs text-[var(--alert-error-text)] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Nome do Procedimento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sessão Laser 1470nm, Consulta Especializada"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-lg text-ink-primary focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink-primary mb-1">
                    Duração do Atendimento (minutos) *
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={480}
                    step={5}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-lg text-ink-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-primary mb-1">
                    Valor Total (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="350,00"
                    value={priceBRL}
                    onChange={(e) => setPriceBRL(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-lg text-ink-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-primary mb-1">
                  Sinal de Reserva Obrigatório
                </label>
                <select
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-lg text-ink-primary focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value={0}>Sem sinal (0% — padrão Starter)</option>
                  <option value={10}>10% de sinal</option>
                  <option value={20}>20% de sinal (recomendado Pro/Enterprise)</option>
                  <option value={30}>30% de sinal</option>
                </select>
              </div>

              <div className="pt-2 border-t border-border-subtle space-y-3">
                <span className="text-xs font-medium text-ink-primary block">
                  Recursos Exigidos Simultaneamente
                </span>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border-subtle bg-canvas hover:bg-sunken/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasSpecialist}
                      onChange={(e) => setHasSpecialist(e.target.checked)}
                      className="rounded text-brand"
                    />
                    <Stethoscope className="w-4 h-4 text-[var(--res-specialist-text)]" />
                    <span className="text-xs text-ink-primary font-medium">
                      Exige 1 Especialista (Médico / Profissional)
                    </span>
                  </label>

                  <div className="p-2.5 rounded-lg border border-border-subtle bg-canvas space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasRoom}
                        onChange={(e) => setHasRoom(e.target.checked)}
                        className="rounded text-brand"
                      />
                      <Box className="w-4 h-4 text-[var(--res-room-text)]" />
                      <span className="text-xs text-ink-primary font-medium">
                        Exige 1 Sala de Atendimento
                      </span>
                    </label>
                    {hasRoom && (
                      <div className="pl-6 pt-1 flex items-center gap-2">
                        <span className="text-xs text-ink-secondary">Tempo de esterilização pós-atendimento:</span>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          step={5}
                          value={roomCleanupMinutes}
                          onChange={(e) => setRoomCleanupMinutes(Number(e.target.value))}
                          className="w-16 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-center text-ink-primary"
                        />
                        <span className="text-xs text-ink-secondary">minutos</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border-subtle bg-canvas space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasEquipment}
                        onChange={(e) => setHasEquipment(e.target.checked)}
                        className="rounded text-brand"
                      />
                      <Wrench className="w-4 h-4 text-[var(--res-equipment-text)]" />
                      <span className="text-xs text-ink-primary font-medium">
                        Exige 1 Equipamento Clínico
                      </span>
                    </label>
                    {hasEquipment && (
                      <div className="pl-6 pt-1 flex items-center gap-2">
                        <span className="text-xs text-ink-secondary">Tempo de limpeza do equipamento:</span>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          step={5}
                          value={equipmentCleanupMinutes}
                          onChange={(e) => setEquipmentCleanupMinutes(Number(e.target.value))}
                          className="w-16 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-center text-ink-primary"
                        />
                        <span className="text-xs text-ink-secondary">minutos</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border-subtle flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-sunken transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-hover transition disabled:opacity-50 shadow-xs"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Procedimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
