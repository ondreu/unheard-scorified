import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Minimální tvar requestu, na kterém guard pracuje (bez závislosti na fastify typech). */
export interface AuthedRequest {
  headers: { authorization?: string };
  user?: { accountId: string; username: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Chybí Bearer token');
    }
    const payload = this.auth.verifyAccessToken(header.slice('Bearer '.length));
    req.user = { accountId: payload.sub, username: payload.username };
    return true;
  }
}
