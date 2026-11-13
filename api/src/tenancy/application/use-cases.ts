import { createHash, randomBytes } from 'node:crypto';
import { AuthTokenService, Clock, DomainEventDispatcher, PasswordHasher, UnitOfWork } from '../../shared/application/ports';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/domain/errors';
import { User } from '../domain/entities/User';
import { Workspace } from '../domain/aggregates/Workspace';
import { WorkspaceSlug } from '../domain/value-objects/WorkspaceSlug';
import { IWorkspaceRepository } from '../domain/repositories/IWorkspaceRepository';
import { IEmailGateway, IUserRepository } from './ports';
import { ISubscriptionRepository } from '../../billing/domain/repositories/ISubscriptionRepository';
import { Subscription } from '../../billing/domain/aggregates/Subscription';
import { Role } from '../domain/events/tenancy-events';

interface Deps {
  uow: UnitOfWork;
  dispatcher: DomainEventDispatcher;
  clock: Clock;
  users: IUserRepository;
  workspaces: IWorkspaceRepository;
  subscriptions: ISubscriptionRepository;
  hasher: PasswordHasher;
  tokens: AuthTokenService;
  emails: IEmailGateway;
}

export class BootstrapWorkspaceOnSignupUseCase {
  constructor(private readonly d: Pick<Deps, 'uow' | 'dispatcher' | 'clock' | 'users' | 'workspaces' | 'subscriptions' | 'hasher' | 'tokens'>) {}

  async execute(input: { email: string; name: string; password: string; workspaceName: string }) {
    const { d } = this;
    if (!input.password || input.password.length < 8) throw new ValidationError('Password must have at least 8 chars');
    if (await d.users.findByEmail(input.email.trim().toLowerCase())) throw new ConflictError('E-mail already registered');
    const now = d.clock.now();
    const passwordHash = await d.hasher.hash(input.password);
    const user = User.create({ email: input.email, name: input.name, passwordHash, now });

    let slug = WorkspaceSlug.fromName(input.workspaceName);
    if (await d.workspaces.slugExists(slug.value)) {
      slug = WorkspaceSlug.create(`${slug.value.slice(0, 50)}-${randomBytes(3).toString('hex')}`);
    }
    const workspace = Workspace.create({ name: input.workspaceName, slug, ownerId: user.id.value, now });
    const subscription = Subscription.startTrial({ tenantId: workspace.id, now });

    const events = await d.uow.run(async () => {
      await d.users.save(user);
      await d.workspaces.save(workspace);
      await d.subscriptions.save(subscription);
      return [...workspace.pullDomainEvents(), ...subscription.pullDomainEvents()];
    });
    await d.dispatcher.dispatch(events);
    return { userId: user.id.value, workspaceId: workspace.id.value, token: d.tokens.sign(user.id.value) };
  }
}

export class LoginUseCase {
  constructor(private readonly d: Pick<Deps, 'users' | 'hasher' | 'tokens'>) {}
  async execute(input: { email: string; password: string }) {
    const user = await this.d.users.findByEmail(input.email.trim().toLowerCase());
    if (!user || !(await this.d.hasher.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid credentials');
    }
    return { userId: user.id.value, name: user.name, email: user.email, token: this.d.tokens.sign(user.id.value) };
  }
}

export class RequestPasswordResetUseCase {
  constructor(
    private readonly d: {
      users: IUserRepository;
      emails: IEmailGateway;
      clock: Clock;
      appBaseUrl?: string;
    },
  ) {}

  async execute(input: { email: string }): Promise<{ message: string; resetUrl?: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.d.users.findByEmail(email);
    // Anti-enumeration: Return generic success response even if email is not found
    if (!user) {
      return {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    }

    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(this.d.clock.now().getTime() + 60 * 60 * 1000); // 1 hour

    user.requestPasswordReset(tokenHash, expiresAt);
    await this.d.users.save(user);

    const baseUrl = this.d.appBaseUrl ?? 'http://localhost:18174';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    await this.d.emails.sendPasswordResetEmail({
      toEmail: user.email,
      userName: user.name,
      resetToken,
      resetUrl,
      expiresAt,
    });

    return {
      message: 'If an account exists with this email, a password reset link has been sent.',
      resetUrl,
    };
  }
}

export class ResetPasswordUseCase {
  constructor(
    private readonly d: {
      users: IUserRepository;
      hasher: PasswordHasher;
      clock: Clock;
    },
  ) {}

  async execute(input: { token: string; password: string }): Promise<{ success: boolean; message: string }> {
    if (!input.token || input.token.trim().length === 0) {
      throw new ValidationError('Reset token is required');
    }
    if (!input.password || input.password.length < 8) {
      throw new ValidationError('Password must have at least 8 chars');
    }

    const tokenHash = createHash('sha256').update(input.token.trim()).digest('hex');
    const user = await this.d.users.findByResetTokenHash(tokenHash);
    if (!user) {
      throw new ValidationError('Invalid or expired password reset token');
    }

    const now = this.d.clock.now();
    const newPasswordHash = await this.d.hasher.hash(input.password);
    user.resetPassword(newPasswordHash, tokenHash, now);
    await this.d.users.save(user);

    return { success: true, message: 'Password has been successfully reset. You can now login with your new password.' };
  }
}

function assertCanManageRole(actorRole: Role, ...roles: Role[]) {
  if (actorRole === 'SPECIALIST' || actorRole === 'COORDINATOR') {
    throw new ForbiddenError(`${actorRole} cannot manage workspace members`);
  }
  if (actorRole === 'ADMIN' && roles.includes('OWNER')) {
    throw new ForbiddenError('Only an OWNER can grant or revoke the OWNER role');
  }
}

export class InviteWorkspaceMemberUseCase {
  constructor(private readonly d: Pick<Deps, 'uow' | 'dispatcher' | 'clock' | 'users' | 'workspaces'>) {}
  async execute(input: { tenantId: string; actorId: string; actorRole: Role; email: string; role: Role }) {
    assertCanManageRole(input.actorRole, input.role);
    const ws = await this.d.workspaces.findById(input.tenantId);
    if (!ws) throw new NotFoundError('Workspace not found');
    const user = await this.d.users.findByEmail(input.email.trim().toLowerCase());
    if (!user) throw new NotFoundError('No registered user with this e-mail; ask them to sign up first');
    ws.addMember(input.actorId, user.id.value, input.role, this.d.clock.now());
    const events = await this.d.uow.run(async () => {
      await this.d.workspaces.save(ws);
      return ws.pullDomainEvents();
    });
    await this.d.dispatcher.dispatch(events);
    return { userId: user.id.value, role: input.role };
  }
}

export class ChangeMemberRoleUseCase {
  constructor(private readonly d: Pick<Deps, 'uow' | 'dispatcher' | 'clock' | 'workspaces'>) {}
  async execute(input: { tenantId: string; actorId: string; actorRole: Role; userId: string; role: Role }) {
    const ws = await this.d.workspaces.findById(input.tenantId);
    if (!ws) throw new NotFoundError('Workspace not found');
    const current = ws.roleOf(input.userId);
    if (!current) throw new NotFoundError('Member not found in this workspace');
    assertCanManageRole(input.actorRole, input.role, current);
    ws.changeMemberRole(input.actorId, input.userId, input.role, this.d.clock.now());
    const events = await this.d.uow.run(async () => {
      await this.d.workspaces.save(ws);
      return ws.pullDomainEvents();
    });
    await this.d.dispatcher.dispatch(events);
  }
}

export class RemoveWorkspaceMemberUseCase {
  constructor(private readonly d: Pick<Deps, 'uow' | 'dispatcher' | 'clock' | 'workspaces'>) {}
  async execute(input: { tenantId: string; actorId: string; actorRole: Role; userId: string }) {
    const ws = await this.d.workspaces.findById(input.tenantId);
    if (!ws) throw new NotFoundError('Workspace not found');
    const current = ws.roleOf(input.userId);
    if (!current) throw new NotFoundError('Member not found in this workspace');
    assertCanManageRole(input.actorRole, current);
    ws.removeMember(input.actorId, input.userId, this.d.clock.now());
    const events = await this.d.uow.run(async () => {
      await this.d.workspaces.save(ws);
      return ws.pullDomainEvents();
    });
    await this.d.dispatcher.dispatch(events);
  }
}

const TIPOS_PERMITIDOS_FOTO = [
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/gif',
  'image/webp',
];
const EXTENSOES_PERMITIDAS_FOTO = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

export class GetPerfilUseCase {
  constructor(
    private readonly d: {
      users: IUserRepository;
      perfis: import('./ports').IPerfilRepository;
    },
  ) {}

  async execute(input: { userId: string; actorId?: string }) {
    const user = await this.d.users.findById(input.userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');
    const perfil = await this.d.perfis.findByUsuarioId(input.userId);
    const ehDono = input.actorId ? input.actorId === input.userId : true;
    return {
      userId: user.id.value,
      nome: user.name,
      email: user.email,
      bio: perfil?.bio || '',
      fotoKey: perfil?.fotoKey || null,
      fotoUrl: perfil?.fotoKey ? `/api/perfil/${user.id.value}/foto` : null,
      ehDono,
    };
  }
}

export class UpdatePerfilUseCase {
  constructor(
    private readonly d: {
      users: IUserRepository;
      perfis: import('./ports').IPerfilRepository;
      uploadDocument: (key: string, buffer: Buffer, mimetype: string) => Promise<{ key: string; size: number }>;
    },
  ) {}

  async execute(input: {
    userId: string;
    actorId: string;
    bio?: string;
    file?: { originalname: string; mimetype: string; buffer: Buffer; size: number };
  }) {
    if (input.actorId !== input.userId) {
      throw new ForbiddenError('Você não tem permissão para editar o perfil de outro usuário.');
    }
    const user = await this.d.users.findById(input.userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');

    const bio = (input.bio ?? '').trim().slice(0, 500);
    let fotoKeyNova: string | undefined = undefined;

    if (input.file) {
      const ext = input.file.originalname.split('.').pop()?.toLowerCase() || '';
      const isMimeOk = TIPOS_PERMITIDOS_FOTO.includes((input.file.mimetype || '').toLowerCase());
      const isExtOk = EXTENSOES_PERMITIDAS_FOTO.includes(ext);

      if (!isMimeOk && !isExtOk) {
        throw new ValidationError('Tipo de arquivo inválido. Envie JPEG, PNG, GIF ou WebP.');
      }
      if (input.file.size > 5 * 1024 * 1024) {
        throw new ValidationError('Tamanho do arquivo excede o limite máximo de 5 MB.');
      }
      const finalExt = isExtOk ? ext : 'jpg';
      fotoKeyNova = `usuario-${input.userId}/${randomBytes(16).toString('hex')}.${finalExt}`;
      const safeMime = isMimeOk ? input.file.mimetype : `image/${finalExt === 'jpg' ? 'jpeg' : finalExt}`;
      await this.d.uploadDocument(fotoKeyNova, input.file.buffer, safeMime);
    }

    await this.d.perfis.save({
      usuarioId: input.userId,
      bio,
      ...(fotoKeyNova !== undefined ? { fotoKey: fotoKeyNova } : {}),
    });

    return {
      ok: true,
      message: 'Perfil atualizado com sucesso!',
      userId: input.userId,
      bio,
      fotoUrl: fotoKeyNova ? `/api/perfil/${input.userId}/foto` : undefined,
    };
  }
}
