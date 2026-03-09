/**
 * Next.js Middleware — Server-Side Route Protection (Issue #119)
 *
 * Intercepts requests to protected routes and redirects unauthenticated users
 * to /auth/login immediately, eliminating the 3-4s client-side spinner (#71).
 *
 * Protected routes:
 *   /channels/*  — require authentication
 *   /settings/*  — require authentication + admin/owner role
 *
 * The middleware reads the `auth_token` httpOnly cookie set by the
 * `setSessionCookie` server action (or, after #113, by the backend directly).
 *
 * NOTE: The cookie payload is base64-decoded for routing decisions only.
 * All real authorization is enforced by the backend on every API call.
 * When #113 lands with real JWT, replace `decodeSessionCookie` with
 * `jose.jwtVerify` using the shared JWT_ACCESS_SECRET.
 */

import { type NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'auth_token';

const ADMIN_ROLES = new Set(['owner', 'admin']);

interface SessionPayload {
  sub: string;
  username: string;
  role: string;
}

/**
 * Decodes the session cookie payload.
 *
 * Supports two formats:
 *   1. base64url-encoded JSON `{ sub, username, role }` — set by `setSessionCookie`
 *   2. A real JWT (`xxxxx.yyyyy.zzzzz`) — set by the backend after #113 ships.
 *      In JWT mode the payload (middle segment) is decoded but NOT verified —
 *      verification is the backend's responsibility on every API call.
 *
 * Returns null if the cookie is missing, malformed, or cannot be decoded.
 */
function decodeSessionCookie(cookieValue: string): SessionPayload | null {
  try {
    // Detect JWT format (three base64url segments separated by dots)
    const parts = cookieValue.split('.');
    const segment = parts.length === 3 ? parts[1] : cookieValue;

    // Convert base64url → base64 for atob (Edge-runtime compatible)
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      segment.length + ((4 - (segment.length % 4)) % 4),
      '=',
    );
    const json = atob(base64);
    const parsed: unknown = JSON.parse(json);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).sub !== 'string'
    ) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    return {
      sub: obj.sub as string,
      username: typeof obj.username === 'string' ? obj.username : '',
      role: typeof obj.role === 'string' ? obj.role : 'member',
    };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isChannelsRoute = pathname.startsWith('/channels/') || pathname === '/channels';
  const isSettingsRoute = pathname.startsWith('/settings/') || pathname === '/settings';

  if (!isChannelsRoute && !isSettingsRoute) {
    return NextResponse.next();
  }

  const tokenCookie = request.cookies.get(AUTH_COOKIE_NAME);

  // ── Unauthenticated: redirect to login ────────────────────────────────────
  if (!tokenCookie?.value) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = decodeSessionCookie(tokenCookie.value);

  // Malformed cookie — treat as unauthenticated
  if (!session) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    // Clear the bad cookie
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  // ── Settings routes: require admin/owner role ─────────────────────────────
  if (isSettingsRoute && !ADMIN_ROLES.has(session.role)) {
    // Redirect non-admin users away from /settings/* — send them to channels
    return NextResponse.redirect(new URL('/channels', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/channels/:path*', '/settings/:path*'],
};
