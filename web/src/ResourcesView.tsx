import React, { useState } from 'react';
import {
  ApiHttpError,
  apiRequest,
  BookableResourceDto,
  PlanCode,
} from './api';
import {
  formatApiError,
  formatCapability,
  formatPlanName,
  formatResourceCategory,
  formatResourceStatus,
  RESOURCE_CATEGORY_PLURAL_LABELS,
  SUGGESTED_CAPABILITIES_BY_CATEGORY,
} from './labels';
import {
  AlertCircle,
  ArrowUpRight,
  Box,
  Check,
  Plus,
  Stethoscope,
  Wrench,
  X,
} from 'lucide-react';

interface ResourcesViewProps {
  token: string;
  workspaceId: string;
  resources: BookableResourceDto[];
  activeResources: number;
  maxActiveResources: number | null;
  isAtQuotaLimit: boolean;
  plan: PlanCode;
  canManageResources: boolean;
  onRefresh: () => Promise<void>;
  onNavigateToBilling: () => void;
}

const CATEGORY_OPTIONS: {
  value: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
  label: string;
  icon: React.ReactNode;
  badgeClass: string;
}[] = [
  {
    value: 'SPECIALIST',
    label: 'Especialista',
    icon: <Stethoscope className="w-4 h-4 text-[var(--res-specialist-text)]" />,
    badgeClass:
      'bg-[var(--res-specialist-bg)] text-[var(--res-specialist-text)] border-[var(--res-specialist-border)]',
  },
  {
    value: 'ROOM',
    label: 'Sala',
    icon: <Box className="w-4 h-4 text-[var(--res-room-text)]" />,
    badgeClass:
      'bg-[var(--res-room-bg)] text-[var(--res-room-text)] border-[var(--res-room-border)]',
  },
  {
    value: 'EQUIPMENT',
    label: 'Equipamento',
    icon: <Wrench className="w-4 h-4 text-[var(--res-equipment-text)]" />,
    badgeClass:
      'bg-[var(--res-equipment-bg)] text-[var(--res-equipment-text)] border-[var(--res-equipment-border)]',
  },
];

function labelToCapabilitySlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  token,
  workspaceId,
  resources,
  activeResources,
  maxActiveResources,
  isAtQuotaLimit,
  plan,
  canManageResources,
  onRefresh,
  onNavigateToBilling,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bypassUpgradeNotice, setBypassUpgradeNotice] = useState(false);
  const [resName, setResName] = useState('');
  const [resCategory, setResCategory] = useState<'SPECIALIST' | 'ROOM' | 'EQUIPMENT'>('EQUIPMENT');
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [capInput, setCapInput] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{ status: number; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openNewResourceDrawer = () => {
    setResName('');
    setResCategory('EQUIPMENT');
    setSelectedCaps([]);
    setCapInput('');
    setFieldError(null);
    setApiError(null);
    setBypassUpgradeNotice(false);
    setDrawerOpen(true);
  };

  const handleAddCapFromInput = () => {
    const slug = labelToCapabilitySlug(capInput);
    if (!slug) return;
    if (!selectedCaps.includes(slug)) {
      setSelectedCaps((prev) => [...prev, slug]);
    }
    setCapInput('');
  };

  const handleToggleSuggestedCap = (slug: string) => {
    setSelectedCaps((prev) =>
      prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug],
    );
  };

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setApiError(null);

    const trimmedName = resName.trim();
    if (trimmedName.length < 2) {
      setFieldError('Informe um nome com pelo menos 2 caracteres para identificar o recurso.');
      return;
    }

    const finalCaps = [...selectedCaps];
    if (capInput.trim()) {
      const extraSlug = labelToCapabilitySlug(capInput);
      if (extraSlug && !finalCaps.includes(extraSlug)) {
        finalCaps.push(extraSlug);
      }
    }
    if (finalCaps.length === 0) {
      setFieldError('Adicione pelo menos uma competência ao recurso.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<BookableResourceDto>('/resources', {
        method: 'POST',
        token,
        workspaceId,
        body: {
          name: trimmedName,
          category: resCategory,
          capabilities: finalCaps,
        },
      });
      setDrawerOpen(false);
      await onRefresh();
    } catch (err) {
      if (err instanceof ApiHttpError) {
        setApiError({
          status: err.status,
          message: formatApiError(err.status, err.code, err.message),
        });
      } else {
        setApiError({
          status: 500,
          message: 'Não foi possível salvar o recurso agora. Tente novamente.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const suggestions = SUGGESTED_CAPABILITIES_BY_CATEGORY[resCategory];

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Recursos</h1>
          <p className="text-xs text-ink-secondary mt-0.5 tabular-nums">
            Especialistas, salas e equipamentos disponíveis para agendamento ({activeResources} de{' '}
            {maxActiveResources ?? 'ilimitados'} ativos no {formatPlanName(plan)}).
          </p>
        </div>

        <button
          type="button"
          onClick={openNewResourceDrawer}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Novo recurso
        </button>
      </div>

      {/* Grupos de recursos */}
      <div className="space-y-6">
        {(['SPECIALIST', 'ROOM', 'EQUIPMENT'] as const).map((cat) => {
          const groupItems = resources.filter((r) => r.category === cat);
          const meta = CATEGORY_OPTIONS.find((c) => c.value === cat)!;
          return (
            <section
              key={cat}
              className="bg-surface border border-border-subtle rounded-xl overflow-hidden shadow-xs"
            >
              <div className="px-4 py-3 bg-canvas border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {meta.icon}
                  <h2 className="text-sm font-semibold text-ink-primary">
                    {RESOURCE_CATEGORY_PLURAL_LABELS[cat]}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-sunken text-ink-secondary border border-border-subtle tabular-nums">
                    {groupItems.length}
                  </span>
                </div>
              </div>

              {groupItems.length === 0 ? (
                <div className="p-5 text-xs text-ink-secondary">
                  Nenhum item cadastrado nesta categoria.
                </div>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {groupItems.map((res) => (
                    <div
                      key={res.id}
                      className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-sunken/40 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-medium text-ink-primary">{res.name}</span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded border ${
                              res.status === 'ACTIVE'
                                ? 'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border-[var(--status-confirmed-border)]'
                                : 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)] border-[var(--status-pending-border)]'
                            }`}
                          >
                            {formatResourceStatus(res.status)}
                          </span>
                        </div>
                        <div className="text-xs text-ink-secondary">
                          Tipo: {formatResourceCategory(res.category)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {res.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="px-2.5 py-1 text-xs rounded-md bg-canvas text-ink-secondary border border-border-subtle"
                          >
                            {formatCapability(cap)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Drawer lateral para Novo recurso */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Novo recurso"
        >
          <div className="w-full max-w-md bg-surface border-l border-border-subtle h-full flex flex-col justify-between p-6 overflow-y-auto shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                <div>
                  <h2 className="text-base font-semibold text-ink-primary">Novo recurso</h2>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Adicione um especialista, sala ou equipamento à agenda da clínica.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Fechar painel"
                  className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-sunken"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Se o plano atingiu o limite e o usuário ainda não optou por prosseguir, exibe painel de upgrade */}
              {isAtQuotaLimit && !bypassUpgradeNotice ? (
                <div
                  data-testid="quota-upgrade-panel"
                  className="bg-canvas border border-[var(--status-pending-border)] rounded-xl p-5 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-[var(--status-pending-text)] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-ink-primary tabular-nums">
                        Limite do {formatPlanName(plan)} atingido ({activeResources} de {maxActiveResources} recursos)
                      </h3>
                      <p className="text-xs text-ink-secondary leading-relaxed">
                        Sua clínica já utiliza todos os recursos incluídos no plano atual. Com o{' '}
                        <strong className="text-ink-primary">Plano Pro</strong>, você libera:
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2 text-xs text-ink-secondary pl-1">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[var(--status-confirmed-text)] shrink-0" />
                      <span>Ampliação imediata do limite de recursos ativos</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[var(--status-confirmed-text)] shrink-0" />
                      <span>Lista de espera automática com ofertas temporizadas</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[var(--status-confirmed-text)] shrink-0" />
                      <span>Sinal de reserva e portal de agendamento online</span>
                    </li>
                  </ul>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDrawerOpen(false);
                        onNavigateToBilling();
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white transition"
                    >
                      Ver planos e fazer upgrade
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBypassUpgradeNotice(true)}
                      className="w-full py-2 px-3 rounded-lg text-xs text-ink-secondary hover:text-ink-primary transition"
                    >
                      Preencher formulário mesmo assim
                    </button>
                  </div>
                </div>
              ) : (
                <form id="new-resource-form" onSubmit={handleCreateResource} className="space-y-5">
                  {!canManageResources && (
                    <div className="p-3 rounded-lg bg-[var(--status-pending-bg)] border border-[var(--status-pending-border)] text-xs text-[var(--status-pending-text)]">
                      Apenas perfis de administração ou proprietário podem cadastrar novos recursos.
                    </div>
                  )}

                  {apiError && (
                    <div
                      role="alert"
                      data-testid="resource-submit-error"
                      className="p-3.5 rounded-xl bg-[var(--status-noshow-bg)] border border-[var(--status-noshow-border)] flex items-start gap-2.5 text-xs text-[var(--status-noshow-text)]"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-semibold">
                          {apiError.status === 402
                            ? 'Limite de recursos do plano atingido'
                            : 'Não foi possível cadastrar o recurso'}
                        </div>
                        <p>{apiError.message}</p>
                        {apiError.status === 402 && (
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerOpen(false);
                              onNavigateToBilling();
                            }}
                            className="inline-flex items-center gap-1 mt-1 font-semibold text-brand underline"
                          >
                            Ir para Plano e cobrança
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {fieldError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-[var(--status-noshow-bg)] border border-[var(--status-noshow-border)] text-xs text-[var(--status-noshow-text)]"
                    >
                      {fieldError}
                    </div>
                  )}

                  {/* Controle segmentado de Tipo de Recurso */}
                  <div>
                    <label className="block text-xs font-medium text-ink-primary mb-2">
                      Tipo de recurso
                    </label>
                    <div className="grid grid-cols-3 gap-2 p-1 bg-canvas border border-border-subtle rounded-xl">
                      {CATEGORY_OPTIONS.map((opt) => {
                        const active = resCategory === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setResCategory(opt.value)}
                            className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition ${
                              active
                                ? 'bg-surface text-ink-primary shadow-2xs border border-border-subtle'
                                : 'text-ink-secondary hover:text-ink-primary'
                            }`}
                          >
                            {opt.icon}
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nome do Recurso */}
                  <div>
                    <label htmlFor="resource-name-input" className="block text-xs font-medium text-ink-primary mb-1.5">
                      Nome do recurso
                    </label>
                    <input
                      id="resource-name-input"
                      type="text"
                      value={resName}
                      onChange={(e) => setResName(e.target.value)}
                      placeholder={
                        resCategory === 'SPECIALIST'
                          ? 'Ex.: Dra. Helena Costa'
                          : resCategory === 'ROOM'
                          ? 'Ex.: Sala de Procedimento 03'
                          : 'Ex.: Ultrassom Portátil 03'
                      }
                      className="w-full bg-canvas border border-border-subtle focus:border-brand rounded-lg px-3 py-2 text-xs text-ink-primary focus:outline-none"
                    />
                  </div>

                  {/* Competências com tags e sugestões */}
                  <div className="space-y-2.5">
                    <label htmlFor="capability-tag-input" className="block text-xs font-medium text-ink-primary">
                      Competências
                    </label>

                    {selectedCaps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCaps.map((cap) => (
                          <span
                            key={cap}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-[var(--brand-subtle)] text-brand border border-brand/30"
                          >
                            {formatCapability(cap)}
                            <button
                              type="button"
                              onClick={() => handleToggleSuggestedCap(cap)}
                              aria-label={`Remover ${formatCapability(cap)}`}
                              className="text-brand hover:opacity-75"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        id="capability-tag-input"
                        type="text"
                        value={capInput}
                        onChange={(e) => setCapInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddCapFromInput();
                          }
                        }}
                        placeholder="Ex.: Doppler vascular"
                        className="flex-1 bg-canvas border border-border-subtle focus:border-brand rounded-lg px-3 py-2 text-xs text-ink-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCapFromInput}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-sunken hover:bg-border-subtle text-ink-primary border border-border-subtle"
                      >
                        Adicionar
                      </button>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs text-ink-secondary">Sugestões rápidas para este tipo:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((sug) => {
                          const isSelected = selectedCaps.includes(sug.slug);
                          return (
                            <button
                              key={sug.slug}
                              type="button"
                              onClick={() => handleToggleSuggestedCap(sug.slug)}
                              className={`px-2.5 py-1 rounded-md text-xs border transition ${
                                isSelected
                                  ? 'bg-[var(--brand-subtle)] border-brand/50 text-brand font-medium'
                                  : 'bg-canvas border-border-subtle text-ink-secondary hover:text-ink-primary'
                              }`}
                            >
                              {isSelected ? '✓ ' : '+ '}
                              {sug.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {(!isAtQuotaLimit || bypassUpgradeNotice) && (
              <div className="flex items-center justify-end gap-2.5 border-t border-border-subtle pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-ink-secondary hover:text-ink-primary bg-sunken hover:bg-border-subtle"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="new-resource-form"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 text-white transition"
                >
                  {submitting ? 'Salvando...' : 'Salvar recurso'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
