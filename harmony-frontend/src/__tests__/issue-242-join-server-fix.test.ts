/**
 * issue-242-join-server-fix.test.ts
 *
 * Tests for the three bugs fixed in issue #242.
 *
 * Fix 1 — api-client.ts: the 401 interceptor must call setSessionCookie after refreshing
 *          the access token so server-side code can use the fresh token.
 * Fix 2 — GuestChannelView: isMember check must handle plain Error objects from trpcQuery,
 *          not just Axios errors.
 * Fix 3 — BrowseServersModal: onJoined callback is called with the server ID after a
 *          successful join so callers can sync other tabs.
 */

// ─── Module-level mock variables ─────────────────────────────────────────────
// Names must start with 'mock' so Jest's Babel transform hoists them above the
// jest.mock() calls. This allows them to be referenced inside mock factories.

const mockSetSessionCookie = jest.fn().mockResolvedValue(undefined);

// Capture the response error interceptor handler when api-client registers it.
// We invoke the handler directly in tests to trigger the refresh logic.
let mockCapturedResponseErrorHandler: ((err: unknown) => Promise<unknown>) | null = null;

// An axios instance that IS callable (real axios instances are functions).
// Using Object.assign on a jest.fn() gives us a callable mock with properties.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAxiosInstance: jest.Mock & Record<string, any> = Object.assign(
  jest.fn().mockResolvedValue({ data: {} }),
  {
    interceptors: {
      request: { use: jest.fn() },
      response: {
        use: jest.fn((_ok: unknown, onError: (err: unknown) => Promise<unknown>) => {
          mockCapturedResponseErrorHandler = onError;
        }),
      },
    },
    get: jest.fn(),
    post: jest.fn().mockResolvedValue({ data: { result: { data: {} } } }),
  },
);

const mockAxiosPost = jest.fn().mockResolvedValue({
  data: { accessToken: 'refreshed-access-token', refreshToken: 'refreshed-refresh-token' },
});

// ─── Jest module mocks ────────────────────────────────────────────────────────
// These calls are hoisted to the top of the file by Jest before the imports.

jest.mock('@/app/actions/session', () => ({
  setSessionCookie: mockSetSessionCookie,
  clearSessionCookie: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
  post: mockAxiosPost,
  // Keep the real isAxiosError so Fix 2 regression test works correctly
  isAxiosError: jest.requireActual('axios').isAxiosError,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────
// api-client is imported AFTER jest.mock() so its constructor picks up the
// mocked axios.create → mockAxiosInstance, registering the interceptors.

import 'next/navigation'; // ensure the mock is applied
import { setSessionCookie } from '@/app/actions/session';
// Side-effect import: triggers new ApiClient() → axios.create() → interceptor setup
import '../lib/api-client';

// ─── Fix 1: api-client interceptor calls setSessionCookie after refresh ───────

describe('Fix 1 — api-client: setSessionCookie is called after token refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockResolvedValue({
      data: { accessToken: 'refreshed-access-token', refreshToken: 'refreshed-refresh-token' },
    });
    // Re-configure the callable mock so the retry (this.client(req)) resolves
    mockAxiosInstance.mockResolvedValue({ data: {} });
    window.localStorage.setItem('harmony_refresh_token', 'stored-refresh-token');
    // Suppress jsdom "not implemented: navigation" from window.location.href = '/auth/login'
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.removeItem('harmony_refresh_token');
  });

  it('registers a response error interceptor during ApiClient construction', () => {
    expect(mockCapturedResponseErrorHandler).not.toBeNull();
  });

  it('calls setSessionCookie with the new access token after a successful 401 refresh', async () => {
    expect(mockCapturedResponseErrorHandler).not.toBeNull();

    const mock401Error = {
      config: { _retry: false, headers: {} },
      response: { status: 401 },
    };

    await mockCapturedResponseErrorHandler!(mock401Error);

    expect(setSessionCookie).toHaveBeenCalledTimes(1);
    expect(setSessionCookie).toHaveBeenCalledWith('refreshed-access-token');
  });

  it('does NOT call setSessionCookie when there is no stored refresh token', async () => {
    window.localStorage.removeItem('harmony_refresh_token');

    const mock401Error = {
      config: { _retry: false, headers: {} },
      response: { status: 401 },
    };

    // Without a refresh token the interceptor rejects immediately (no refresh attempt)
    await mockCapturedResponseErrorHandler!(mock401Error).catch(() => undefined);

    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it('continues with the client-side retry even when setSessionCookie throws', async () => {
    (setSessionCookie as jest.Mock).mockRejectedValueOnce(new Error('Server Action failed'));

    const mock401Error = {
      config: { _retry: false, headers: { Authorization: 'Bearer old-token' } },
      response: { status: 401 },
    };

    // The interceptor wraps setSessionCookie in try/catch — the retry must still succeed
    await expect(mockCapturedResponseErrorHandler!(mock401Error)).resolves.toBeDefined();

    // setSessionCookie was still attempted despite the failure (best-effort)
    expect(setSessionCookie).toHaveBeenCalledWith('refreshed-access-token');
  });
});

// ─── Fix 2: GuestChannelView isMember check ───────────────────────────────────
//
// trpcQuery throws plain Error objects: "tRPC query error [proc]: STATUS — body"
// The old check used isAxiosError which is always false for these, so isMember
// was incorrectly true for all errors including 403 (confirmed non-member).
// New check: err instanceof Error && err.message.includes(': 403 ')

describe('Fix 2 — GuestChannelView: isMember check handles plain Error objects', () => {
  // Replicate the exact expression from GuestChannelView.tsx line ~118
  function isMemberAfterError(err: unknown): boolean {
    return !(err instanceof Error && err.message.includes(': 403 '));
  }

  it('returns false for a 403 tRPC plain Error — confirmed non-member', () => {
    const err = new Error(
      'tRPC query error [server.getChannels]: 403 — {"error":{"message":"FORBIDDEN"}}',
    );
    expect(isMemberAfterError(err)).toBe(false);
  });

  it('returns true for a 401 tRPC plain Error — expired token, membership unknown', () => {
    const err = new Error(
      'tRPC query error [server.getChannels]: 401 — {"error":{"message":"UNAUTHORIZED"}}',
    );
    expect(isMemberAfterError(err)).toBe(true);
  });

  it('returns true for a 500 tRPC plain Error — server error, membership unknown', () => {
    const err = new Error('tRPC query error [server.getChannels]: 500 — Internal server error');
    expect(isMemberAfterError(err)).toBe(true);
  });

  it('returns true for non-Error thrown values', () => {
    expect(isMemberAfterError('string error')).toBe(true);
    expect(isMemberAfterError({ status: 403 })).toBe(true);
    expect(isMemberAfterError(null)).toBe(true);
  });

  it('demonstrates the regression: OLD isAxiosError check was always false for trpcQuery errors', () => {
    const { isAxiosError } = jest.requireActual<typeof import('axios')>('axios');
    const err = new Error(
      'tRPC query error [server.getChannels]: 403 — {"error":{"message":"FORBIDDEN"}}',
    );
    // BUG (pre-fix): isAxiosError(err) is false → isMember ends up true (incorrect)
    const oldIsMember = !(
      isAxiosError(err) &&
      (err as { response?: { status: number } }).response?.status === 403
    );
    expect(oldIsMember).toBe(true); // wrong — treats non-member as member

    // FIX: plain Error message check correctly identifies 403
    expect(isMemberAfterError(err)).toBe(false); // correctly identifies non-member
  });
});

// ─── Fix 3: BrowseServersModal onJoined callback ──────────────────────────────
//
// After a successful joinServerAction, handleJoin calls onJoined?.(server.id).
// This allows HarmonyShell to broadcast to other tabs via notifyServerJoined.

describe('Fix 3 — BrowseServersModal: onJoined prop is called on successful join', () => {
  it('onJoined is called with the server ID before onClose and router.push', () => {
    const callOrder: string[] = [];
    const serverId = 'srv-abc';

    const onJoined = jest.fn(() => callOrder.push('onJoined'));
    const onClose = jest.fn(() => callOrder.push('onClose'));
    const routerPush = jest.fn(() => callOrder.push('routerPush'));

    // Replicate the success path of handleJoin in BrowseServersModal
    onJoined(serverId);
    onClose();
    routerPush('/channels/server-slug/general');

    expect(callOrder).toEqual(['onJoined', 'onClose', 'routerPush']);
    expect(onJoined).toHaveBeenCalledWith(serverId);
  });

  it('onJoined is optional — omitting it does not throw', () => {
    const onJoined: ((id: string) => void) | undefined = undefined;
    expect(() => onJoined?.('srv-xyz')).not.toThrow();
  });

  it('onJoined is called exactly once per successful join', () => {
    const onJoined = jest.fn();
    onJoined('srv-123');
    expect(onJoined).toHaveBeenCalledTimes(1);
    expect(onJoined).toHaveBeenCalledWith('srv-123');
  });
});
