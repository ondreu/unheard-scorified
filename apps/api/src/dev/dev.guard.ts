import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

interface DevRequest {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class DevGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const devSecret = process.env['DEV_SECRET'];

    if (devSecret) {
      // Staging/production: require matching X-Dev-Secret header.
      const req = ctx.switchToHttp().getRequest<DevRequest>();
      const header = req.headers['x-dev-secret'];
      if (header !== devSecret) {
        throw new ForbiddenException('Invalid dev secret');
      }
      return true;
    }

    // Fallback: allow in development without a secret.
    if (process.env['NODE_ENV'] !== 'development') {
      throw new ForbiddenException('Dev tools are only available in development mode');
    }
    return true;
  }
}
