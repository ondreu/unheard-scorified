import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class DevGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    if (process.env['NODE_ENV'] !== 'development') {
      throw new ForbiddenException('Dev tools are only available in development mode');
    }
    return true;
  }
}
