import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { loadConfig } from '../config/config';

/** Minimální tvar Fastify reply potřebný pro cookie operace. */
interface CookieReply {
  setCookie(name: string, value: string, options?: Record<string, unknown>): CookieReply;
  clearCookie(name: string, options?: Record<string, unknown>): CookieReply;
  status(code: number): CookieReply;
}

/** Minimální tvar Fastify request potřebný pro čtení cookies. */
interface CookieRequest {
  cookies?: Record<string, string | undefined>;
}
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

export interface AuthResponse {
  accessToken: string;
  user: { accountId: string; username: string };
}

const COOKIE_NAME = 'refresh_token';
const config = loadConfig();

/** Nastaví httpOnly refresh token cookie na odpovědi. */
function setRefreshCookie(res: CookieReply, token: string): void {
  void res.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    // 30 dní v sekundách (reflektuje REFRESH_TOKEN_TTL).
    maxAge: 30 * 24 * 60 * 60,
  });
}

/** Vymaže refresh token cookie. */
function clearRefreshCookie(res: CookieReply): void {
  void res.clearCookie(COOKIE_NAME, { path: '/' });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: CookieReply,
  ): Promise<AuthResponse> {
    const tokens = await this.auth.register(dto.username, dto.password, dto.email);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: CookieReply,
  ): Promise<AuthResponse> {
    const tokens = await this.auth.login(dto.username, dto.password);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: CookieRequest,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: CookieReply,
  ): Promise<AuthResponse> {
    // Cookie je primární zdroj; fallback na body pro API klienty a testy.
    const token = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME] ?? dto.refreshToken;
    if (!token) {
      res.status(HttpStatus.UNAUTHORIZED);
      throw new Error('No refresh token');
    }
    const tokens = await this.auth.refresh(token);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: CookieRequest,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: CookieReply,
  ): Promise<void> {
    const token = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME] ?? dto.refreshToken;
    if (token) await this.auth.revokeRefreshJti(token);
    clearRefreshCookie(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { accountId: string; username: string }): {
    accountId: string;
    username: string;
  } {
    return user;
  }
}
