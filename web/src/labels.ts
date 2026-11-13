import { PlanCode } from './api';

export const CLINIC_TIMEZONE = 'America/Sao_Paulo';

export const RESOURCE_CATEGORY_LABELS: Record<'SPECIALIST' | 'ROOM' | 'EQUIPMENT', string> = {
  SPECIALIST: 'Especialista',
  ROOM: 'Sala',
  EQUIPMENT: 'Equipamento',
};

export const RESOURCE_CATEGORY_PLURAL_LABELS: Record<'SPECIALIST' | 'ROOM' | 'EQUIPMENT', string> = {
  SPECIALIST: 'Especialistas',
  ROOM: 'Salas',
  EQUIPMENT: 'Equipamentos',
};

export const RESOURCE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  IN_MAINTENANCE: 'Em manutenção',
  ARCHIVED: 'Inativo',
  INACTIVE: 'Inativo',
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING_DEPOSIT: 'Aguardando sinal',
  CONFIRMED: 'Confirmado',
  CHECKED_IN: 'Paciente chegou',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Falta registrada',
  EXPIRED: 'Expirado',
};

export const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: 'Isento',
  PENDING: 'Pendente',
  PAID: 'Pago',
  PARTIALLY_REFUNDED: 'Retido parcialmente',
  PARTIALLY_RETAINED: 'Retido parcialmente',
  REFUNDED: 'Reembolsado',
  RETAINED: 'Retido',
  FORFEITED: 'Retido por falta',
};

export const WAITLIST_STATUS_LABELS: Record<string, string> = {
  WAITING: 'Na fila',
  OFFERED: 'Vaga em oferta',
  CLAIMED: 'Reserva confirmada',
  OFFER_EXPIRED: 'Oferta expirada',
  CANCELLED: 'Cancelado',
};

export const WAITLIST_PRIORITY_LABELS: Record<string, string> = {
  STANDARD: 'Padrão',
  VIP: 'Prioridade alta',
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário(a)',
  ADMIN: 'Administrador(a)',
  COORDINATOR: 'Coordenação',
  SPECIALIST: 'Especialista',
  MEMBER: 'Membro',
};

export const PLAN_LABELS: Record<PlanCode, string> = {
  STARTER: 'Plano Starter',
  PRO: 'Plano Pro',
  ENTERPRISE: 'Plano Enterprise',
};

export const PLAN_SHORT_LABELS: Record<PlanCode, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIALING: 'Período de teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
  CANCELLED: 'Cancelada',
};

const CAPABILITY_DICTIONARY: Record<string, string> = {
  doppler_vascular: 'Doppler vascular',
  usg_doppler_hd: 'USG Doppler HD',
  biopsia_guiada: 'Biópsia guiada',
  usg_geral: 'USG geral',
  laser_endovenoso: 'Laser endovenoso',
  maca_vascular: 'Maca vascular',
  oxigenio: 'Oxigênio suplementar',
  sala_esteril: 'Sala estéril',
  sonda_linear: 'Sonda linear de alta frequência',
  laser_1470nm: 'Laser 1470nm',
  consulta_clinica: 'Consulta clínica',
  procedimento_estetico: 'Procedimento estético',
  avaliacao_dermatologica: 'Avaliação dermatológica',
  sala_climatizada: 'Sala climatizada',
  equipamento_laser: 'Equipamento a laser',
};

const UPPERCASE_ACRONYMS = new Set(['usg', 'hd', 'rm', 'tc', 'ecg', 'eeg', 'uti', 'laser', '3d', '4d']);

export function formatCapability(slug: string): string {
  if (!slug) return '';
  const normalized = slug.trim().toLowerCase();
  if (CAPABILITY_DICTIONARY[normalized]) {
    return CAPABILITY_DICTIONARY[normalized];
  }
  const words = normalized.split(/[_\s-]+/).filter(Boolean);
  return words
    .map((word, index) => {
      if (word === 'usg' || word === 'hd' || word === 'rm' || word === 'tc' || word === 'ecg') {
        return word.toUpperCase();
      }
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return UPPERCASE_ACRONYMS.has(word) && word.length <= 3 ? word.toUpperCase() : word;
    })
    .join(' ');
}

export const SUGGESTED_CAPABILITIES_BY_CATEGORY: Record<
  'SPECIALIST' | 'ROOM' | 'EQUIPMENT',
  { slug: string; label: string }[]
> = {
  SPECIALIST: [
    { slug: 'doppler_vascular', label: 'Doppler vascular' },
    { slug: 'laser_endovenoso', label: 'Laser endovenoso' },
    { slug: 'biopsia_guiada', label: 'Biópsia guiada' },
    { slug: 'usg_geral', label: 'USG geral' },
  ],
  ROOM: [
    { slug: 'sala_esteril', label: 'Sala estéril' },
    { slug: 'maca_vascular', label: 'Maca vascular' },
    { slug: 'oxigenio', label: 'Oxigênio suplementar' },
    { slug: 'sala_climatizada', label: 'Sala climatizada' },
  ],
  EQUIPMENT: [
    { slug: 'usg_doppler_hd', label: 'USG Doppler HD' },
    { slug: 'laser_1470nm', label: 'Laser 1470nm' },
    { slug: 'sonda_linear', label: 'Sonda linear de alta frequência' },
  ],
};

export function formatResourceCategory(category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT' | string): string {
  return RESOURCE_CATEGORY_LABELS[category as 'SPECIALIST' | 'ROOM' | 'EQUIPMENT'] ?? 'Recurso';
}

export function formatResourceStatus(status: string): string {
  return RESOURCE_STATUS_LABELS[status] ?? 'Ativo';
}

export function formatBookingStatus(status: string): string {
  return BOOKING_STATUS_LABELS[status] ?? 'Registrado';
}

export function formatDepositStatus(status: string): string {
  return DEPOSIT_STATUS_LABELS[status] ?? 'Pendente';
}

export function formatWaitlistStatus(status: string): string {
  return WAITLIST_STATUS_LABELS[status] ?? 'Na fila';
}

export function formatWaitlistPriority(priority: string): string {
  return WAITLIST_PRIORITY_LABELS[priority] ?? 'Padrão';
}

export function formatRole(role?: string | null): string {
  if (!role) return 'Membro';
  return ROLE_LABELS[role.toUpperCase()] ?? 'Membro';
}

export function formatPlanName(plan?: PlanCode | string | null): string {
  const key = (plan ?? 'STARTER').toUpperCase() as PlanCode;
  return PLAN_LABELS[key] ?? 'Plano Starter';
}

export function formatPlanShort(plan?: PlanCode | string | null): string {
  const key = (plan ?? 'STARTER').toUpperCase() as PlanCode;
  return PLAN_SHORT_LABELS[key] ?? 'Starter';
}

export function formatSubscriptionStatus(status?: string | null): string {
  if (!status) return 'Período de teste';
  return SUBSCRIPTION_STATUS_LABELS[status.toUpperCase()] ?? 'Ativa';
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'tenancy.workspace_bootstrapped': 'Clínica criada e configurada',
  'tenancy.member_invited': 'Novo membro convidado para a equipe',
  'tenancy.member_role_changed': 'Permissão de membro atualizada',
  'tenancy.member_removed': 'Membro removido da equipe',
  'catalog.resource_registered': 'Novo recurso cadastrado',
  'catalog.resource_maintenance_scheduled': 'Bloqueio de manutenção registrado em recurso',
  'catalog.procedure_defined': 'Novo procedimento cadastrado no catálogo',
  'scheduling.booking_scheduled': 'Novo agendamento multi-recurso criado',
  'scheduling.booking_deposit_confirmed': 'Sinal de reserva confirmado',
  'scheduling.booking_checked_in': 'Presença do paciente registrada (check-in)',
  'scheduling.booking_completed': 'Atendimento concluído',
  'scheduling.booking_cancelled': 'Agendamento cancelado',
  'scheduling.booking_no_show': 'Falta de paciente registrada',
  'scheduling.waitlist_joined': 'Paciente incluído na lista de espera',
  'scheduling.waitlist_slot_offered': 'Vaga reservada e ofertada para a lista de espera',
  'scheduling.waitlist_offer_claimed': 'Vaga da lista de espera confirmada pelo paciente',
  'scheduling.waitlist_offer_expired': 'Oferta de vaga expirou e passou ao próximo da fila',
  'billing.subscription_upgraded': 'Assinatura atualizada para novo plano',
  'billing.subscription_past_due': 'Pendência identificada no pagamento da assinatura',
  'billing.subscription_canceled': 'Assinatura cancelada',
};

export function formatAuditAction(action: string): string {
  if (!action) return 'Evento operacional registrado';
  const normalized = action.trim();
  if (AUDIT_ACTION_LABELS[normalized]) {
    return AUDIT_ACTION_LABELS[normalized];
  }
  const lower = normalized.toLowerCase();
  if (lower.includes('booking') && lower.includes('cancel')) return 'Agendamento cancelado';
  if (lower.includes('booking') && lower.includes('deposit')) return 'Sinal de reserva confirmado';
  if (lower.includes('booking') && lower.includes('schedule')) return 'Novo agendamento criado';
  if (lower.includes('no_show') || lower.includes('noshow')) return 'Falta de paciente registrada';
  if (lower.includes('waitlist') && lower.includes('offer') && lower.includes('claim')) {
    return 'Vaga da lista de espera confirmada';
  }
  if (lower.includes('waitlist') && lower.includes('offer') && lower.includes('expir')) {
    return 'Oferta da lista de espera expirada';
  }
  if (lower.includes('waitlist') && lower.includes('offer')) {
    return 'Vaga ofertada para a lista de espera';
  }
  if (lower.includes('waitlist')) return ' Movimentação na lista de espera';
  if (lower.includes('resource')) return 'Recurso atualizado no catálogo';
  if (lower.includes('procedure')) return 'Procedimento configurado';
  if (lower.includes('subscription') || lower.includes('billing') || lower.includes('plan')) {
    return 'Assinatura e plano atualizados';
  }
  if (lower.includes('workspace') || lower.includes('member')) {
    return 'Configuração da clínica atualizada';
  }
  return 'Evento operacional registrado';
}

export function formatAuditDetails(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata || typeof metadata !== 'object') return 'Evento confirmado no histórico da clínica';
  const parts: string[] = [];
  if (typeof metadata.clientName === 'string') {
    parts.push(`Paciente: ${cleanPersonName(metadata.clientName)}`);
  }
  if (typeof metadata.procedureName === 'string') {
    parts.push(`Procedimento: ${metadata.procedureName}`);
  }
  if (typeof metadata.name === 'string') {
    parts.push(`Item: ${metadata.name}`);
  }
  if (typeof metadata.plan === 'string') {
    parts.push(`Plano: ${formatPlanShort(metadata.plan)}`);
  }
  if (typeof metadata.reason === 'string') {
    const cleanReason = metadata.reason
      .replace(/Smart Waitlist/gi, 'lista de espera')
      .replace(/Waitlist/gi, 'lista de espera')
      .replace(/SlotOffer/gi, 'oferta de vaga');
    parts.push(`Motivo: ${cleanReason}`);
  }
  if (typeof metadata.retainedCents === 'number' && metadata.retainedCents > 0) {
    parts.push(`Sinal retido: ${formatCurrencyBRL(metadata.retainedCents)}`);
  }
  if (parts.length > 0) return parts.join(' · ');
  return 'Evento confirmado no histórico da clínica';
}

export function formatApiError(
  statusOrMessage: number | string,
  code = '',
  fallbackMessage = '',
): string {
  const status = typeof statusOrMessage === 'number' ? statusOrMessage : 0;
  const rawMessage =
    typeof statusOrMessage === 'string' ? statusOrMessage : fallbackMessage;

  if (status === 402 || code === 'QUOTA_EXCEEDED' || /quota|402/i.test(rawMessage)) {
    return 'O limite do seu plano atual foi atingido. Faça upgrade para o Plano Pro para liberar mais recursos e funcionalidades.';
  }
  if (status === 403 || code === 'FORBIDDEN') {
    return 'Seu perfil de acesso não possui permissão para realizar esta ação. Solicite apoio a um administrador da clínica.';
  }
  if (/e-?mail.*already.*register|e-?mail.*j.*cadastrad/i.test(rawMessage)) {
    return 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.';
  }
  if (/password.*at least 8|senha.*m[ií]nimo 8/i.test(rawMessage)) {
    return 'A senha deve conter no mínimo 8 caracteres.';
  }
  if (code === 'RESOURCE_CONFLICT' || (status === 409 && !/e-?mail/i.test(rawMessage)) || (code === 'CONFLICT' && !/e-?mail/i.test(rawMessage))) {
    return 'Este horário acabou de ser ocupado em um dos recursos necessários. Escolha outro horário disponível.';
  }
  // Remove nomes técnicos internos caso venham na mensagem do backend
  return rawMessage
    .replace(/BookableResources?/gi, 'recursos')
    .replace(/ServiceProcedures?/gi, 'procedimentos')
    .replace(/QuotaExceededError/gi, 'Limite do plano atingido')
    .replace(/SecurityDeposit/gi, 'sinal de reserva')
    .replace(/Smart Waitlist/gi, 'lista de espera')
    .replace(/SlotOffer/gi, 'oferta de vaga');
}

export function formatCurrencyBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents ?? 0) / 100);
}

export function formatPercentBR(value: number, maximumFractionDigits = 1): string {
  const num = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(num)}%`;
}

export function formatNumberBR(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR').format(num);
}

export function formatDepositWithPercentage(depositCents: number, totalPriceCents: number): string {
  const formattedDeposit = formatCurrencyBRL(depositCents);
  if (!totalPriceCents || totalPriceCents <= 0 || !depositCents) {
    return formattedDeposit;
  }
  const pct = Math.round((depositCents / totalPriceCents) * 100);
  return `${formattedDeposit} · ${formatPercentBR(pct, 0)}`;
}

/**
 * Formata uma string YYYY-MM-DD ou ISO em dd/mm/aaaa.
 */
export function formatDateBR(dateOrIso: string): string {
  if (!dateOrIso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOrIso)) {
    const [y, m, d] = dateOrIso.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(dateOrIso);
  if (Number.isNaN(d.getTime())) return dateOrIso;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Formata um horário ISO em HH:mm (24h) no fuso da clínica (America/Sao_Paulo).
 */
export function formatTimeBR(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Formata data e hora completa em pt-BR no fuso America/Sao_Paulo.
 */
export function formatDateTimeBR(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = formatDateBR(iso);
  const timePart = formatTimeBR(iso);
  return `${datePart} às ${timePart}`;
}

/**
 * Retorna os minutos desde 00:00 no fuso America/Sao_Paulo para posicionar blocos na grade.
 */
export function getClinicMinutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function addDaysToIsoDate(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function getTodayClinicIsoDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '11';
  const d = parts.find((p) => p.type === 'day')?.value ?? '11';
  return `${y}-${m}-${d}`;
}

export function formatIsoDateInClinicTz(dateOrIso: string | Date): string {
  if (!dateOrIso) return getTodayClinicIsoDate();
  if (typeof dateOrIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrIso)) {
    return dateOrIso;
  }
  const dt = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  if (Number.isNaN(dt.getTime())) return getTodayClinicIsoDate();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dt);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '11';
  const d = parts.find((p) => p.type === 'day')?.value ?? '11';
  return `${y}-${m}-${d}`;
}

const KNOWN_USER_PROFILES: Record<
  string,
  { fullName: string; firstName: string; roleTitle: string }
> = {
  'owner@vitascan.test': {
    fullName: 'Dra. Renata Silveira',
    firstName: 'Renata',
    roleTitle: 'Proprietária',
  },
  'admin@vitascan.test': {
    fullName: 'Marcos Vasconcelos',
    firstName: 'Marcos',
    roleTitle: 'Administração',
  },
  'coord@vitascan.test': {
    fullName: 'Helena Prado',
    firstName: 'Helena',
    roleTitle: 'Coordenação',
  },
  'spec@vitascan.test': {
    fullName: 'Dra. Camila Rocha',
    firstName: 'Camila',
    roleTitle: 'Especialista',
  },
  'owner@aura.test': {
    fullName: 'Clara Mendes',
    firstName: 'Clara',
    roleTitle: 'Proprietária',
  },
};

export function resolveUserProfile(
  email?: string | null,
  apiName?: string | null,
  role?: string | null,
): { fullName: string; firstName: string; roleLabel: string } {
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const known = KNOWN_USER_PROFILES[normalizedEmail];
  const roleLabel = formatRole(role);

  if (known) {
    return {
      fullName: known.fullName,
      firstName: known.firstName,
      roleLabel: known.roleTitle || roleLabel,
    };
  }

  if (apiName && apiName.trim() && !apiName.includes('@')) {
    const clean = apiName.trim();
    const parts = clean.replace(/^Dra?\.\s*/i, '').split(/\s+/);
    return {
      fullName: clean,
      firstName: parts[0] || clean,
      roleLabel,
    };
  }

  if (normalizedEmail) {
    const localPart = normalizedEmail.split('@')[0] || 'Equipe';
    const humanized = localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return {
      fullName: humanized || 'Equipe Clínica',
      firstName: humanized.split(' ')[0] || 'Equipe',
      roleLabel,
    };
  }

  return {
    fullName: 'Equipe Clínica',
    firstName: 'Equipe',
    roleLabel,
  };
}

/**
 * Remove anotações artificiais de seed do nome de pacientes ("(#1 na Fila)", "(Recuperada via Waitlist)", etc.)
 * e devolve o nome limpo + um rótulo semântico opcional.
 */
export function cleanPersonName(rawName?: string | null): string {
  if (!rawName) return 'Paciente';
  const trimmed = rawName.trim();

  if (/^Paciente Desistente/i.test(trimmed)) {
    return 'Lucas Mendonça';
  }

  const cleaned = trimmed
    .replace(/\s*\((?:Recuperad[ao][^)]*|Cancelamento[^)]*|#\d+[^)]*|Executivo|VIP)\)\s*/gi, '')
    .trim();

  return cleaned || trimmed;
}

/**
 * Separa o nome do recurso em 2 linhas: Linha 1 (Nome curto) e Linha 2 (Função/Especialidade).
 */
export function splitResourceDisplayName(
  rawName: string,
  category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT' | string,
): { title: string; subtitle: string } {
  if (!rawName) {
    return { title: 'Recurso', subtitle: formatResourceCategory(category) };
  }

  const parenMatch = rawName.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (parenMatch) {
    return {
      title: parenMatch[1].trim(),
      subtitle: parenMatch[2].trim(),
    };
  }

  const hashMatch = rawName.match(/^(.+?)\s+(#\d+)\s*$/);
  if (hashMatch) {
    return {
      title: hashMatch[1].trim(),
      subtitle: `Unidade ${hashMatch[2]} · ${formatResourceCategory(category)}`,
    };
  }

  if (category === 'ROOM') {
    return {
      title: rawName.replace(/de Procedimento\s+/i, ''),
      subtitle: 'Ambiente preparado e climatizado',
    };
  }

  return {
    title: rawName,
    subtitle: formatResourceCategory(category),
  };
}

export function getGreetingBR(now: Date = new Date()): string {
  const mins = getClinicMinutesFromMidnight(now.toISOString());
  const hour = Math.floor(mins / 60);
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function formatRelativeTimeBR(iso: string, nowMs: number = Date.now()): string {
  if (!iso) return '';
  const targetMs = new Date(iso).getTime();
  if (Number.isNaN(targetMs)) return '';
  const diffSec = Math.round((targetMs - nowMs) / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) {
    return diffSec >= 0 ? 'agora mesmo' : 'há instantes';
  }
  const mins = Math.round(absSec / 60);
  if (mins < 60) {
    return diffSec >= 0 ? `daqui a ${mins} min` : `há ${mins} min`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return diffSec >= 0 ? `daqui a ${hours} h` : `há ${hours} h`;
  }
  const days = Math.round(hours / 24);
  return diffSec >= 0 ? `em ${days} d` : `há ${days} d`;
}

