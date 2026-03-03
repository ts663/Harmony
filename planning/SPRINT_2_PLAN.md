# Backend Development Sprint Plan — March 2–13, 2026

## Context
Harmony is a search-engine-indexable chat app (Discord-like clone). The frontend exists with mock in-memory services. This sprint wires up a real backend with PostgreSQL, Redis, Prisma, and tRPC/REST APIs, then integrates the frontend. Two dev specs must have full backend support: **Guest Public Channel View** and **Channel Visibility Toggle**.

## Team
5 developers: acabrera04, Aiden-Barrera, AvanishKulkarni, declanblanc, FardeenI

## Tech Stack (from dev specs)
- Node.js 20 LTS + TypeScript 5.3+
- PostgreSQL 16+ with Prisma 5.8+
- Redis 7.2+ for caching
- tRPC 10.45+ (authenticated internal APIs)
- REST (public unauthenticated APIs)
- Zod 3.22+ for validation
- JWT for auth, bcrypt for passwords

---

## Issues (27 total)

> **Note:** Every backend service/module issue (#3–#18) must include minimum tests verifying the module's API works for the happy path. Check test code into GitHub alongside the implementation.

### 🏗️ FOUNDATION — Week 1 (March 2–6)

**1. Backend Project Scaffold & Dev Environment**
- Set up Node.js backend (Express + tRPC), TypeScript config, project structure
- Docker Compose for PostgreSQL + Redis local dev
- Shared types package or import from frontend types
- Dev server with hot reload (ts-node-dev or tsx)
- Set up Jest testing framework with TypeScript support (ts-jest)
- Update CI workflow (.github/workflows/ci.yml) — add backend job: install, lint, build, test (parallel with existing frontend job)
- Labels: backend, setup, prerequisite, week-1
- Assignee: acabrera04
- Due: March 3

**2. Database Schema & Prisma Migrations**
- Define Prisma schema: users, servers, channels, messages, attachments, visibility_audit_log
- Create visibility_enum (PUBLIC_INDEXABLE, PUBLIC_NO_INDEX, PRIVATE)
- All indexes from dev specs (partial indexes, composite indexes)
- Initial migration
- Labels: backend, setup, prerequisite, week-1
- Assignee: declanblanc
- Due: March 4
- Depends on: #1

**3. Authentication System — JWT Register/Login/Logout**
- POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
- JWT token generation + refresh tokens
- bcrypt password hashing
- Auth middleware for protected routes
- Zod input validation
- Labels: backend, feature, prerequisite, week-1
- Assignee: Aiden-Barrera
- Due: March 5
- Depends on: #1, #2

**4. User Service & API**
- User CRUD via tRPC: getUser, updateUser, getCurrentUser
- Public profile flag (public_profile boolean)
- User status management (online/idle/dnd/offline)
- Labels: backend, feature, week-1
- Assignee: FardeenI
- Due: March 5
- Depends on: #2

**5. Server Service & API**
- Server CRUD via tRPC: getServers, getServer(slug), createServer, updateServer, deleteServer
- Auto-slug generation from name
- Member count tracking
- Owner relationship to users
- is_public flag for server-level publicity
- Labels: backend, feature, week-1
- Assignee: AvanishKulkarni
- Due: March 5
- Depends on: #2

**6. Channel Service & API**
- Channel CRUD via tRPC: getChannels(serverId), getChannel(slug), createChannel, updateChannel, deleteChannel
- Visibility enum (PUBLIC_INDEXABLE, PUBLIC_NO_INDEX, PRIVATE)
- Position ordering, slug uniqueness per server
- Default channel creation on server create
- Labels: backend, feature, week-1
- Assignee: declanblanc
- Due: March 6
- Depends on: #2, #5

**7. Message Service & API**
- Message CRUD via tRPC: getMessages(channelId, pagination), sendMessage, editMessage, deleteMessage (soft delete)
- Cursor-based pagination (20 per page default, configurable)
- Author snapshot embedding
- Attachment metadata support
- Labels: backend, feature, week-1
- Assignee: FardeenI
- Due: March 6
- Depends on: #2, #6

**8. Role-Based Permission & Authorization System**
- Permission service: checkPermission(userId, serverId, action)
- Roles: owner, admin, moderator, member, guest
- Permission matrix (who can CRUD servers, channels, messages, settings)
- tRPC middleware for route-level authorization
- Labels: backend, feature, prerequisite, week-1
- Assignee: Aiden-Barrera
- Due: March 6
- Depends on: #3, #4

**9. Server Membership Service**
- Join/leave server, member listing
- Role assignment per server (owner, admin, moderator, member)
- Member count sync
- getServerMembers(serverId) with role info
- Labels: backend, feature, week-1
- Assignee: AvanishKulkarni
- Due: March 6
- Depends on: #4, #5

**10. Database Seed Data**
- Port existing mock data (users, servers, channels, messages) to Prisma seed script
- Match existing frontend mock IDs/slugs for backward compatibility
- Include test users with different roles
- Labels: backend, setup, week-1
- Assignee: acabrera04
- Due: March 6
- Depends on: #2

---

### 🔐 FEATURE: Channel Visibility Toggle — Week 2 (March 9–11)

**11. Channel Visibility Toggle Service**
- ChannelVisibilityService: updateVisibility(channelId, newVisibility)
- State machine validation (all transitions valid per spec)
- Permission check: only server owner/admin can toggle
- Update indexed_at timestamp when toggling to PUBLIC_INDEXABLE
- Clear indexed_at when going PRIVATE
- Emit VISIBILITY_CHANGED event
- Labels: backend, feature, week-2
- Assignee: declanblanc
- Due: March 10
- Depends on: #6, #8

**12. Visibility Audit Log Service**
- AuditLogService: logVisibilityChange(channelId, actorId, oldValue, newValue, ipAddress)
- AuditLogRepository with pagination
- getVisibilityAuditLog(channelId, { limit, offset, startDate })
- Store IP address and user agent for compliance
- 7-year retention policy notation in schema
- Labels: backend, feature, week-2
- Assignee: Aiden-Barrera
- Due: March 10
- Depends on: #11

**13. Sitemap & SEO Data Endpoints**
- GET /sitemap/{serverSlug}.xml — dynamic sitemap of PUBLIC_INDEXABLE channels
- GET /robots.txt — allow crawling of /c/ routes
- IndexingService: addToSitemap, removeFromSitemap
- Update sitemap on visibility change events
- Labels: backend, feature, week-2
- Assignee: AvanishKulkarni
- Due: March 11
- Depends on: #11

---

### 👁️ FEATURE: Guest Public Channel View — Week 2 (March 9–11)

**14. Public REST API — Channel & Server Endpoints**
- GET /api/public/servers/{serverSlug} → PublicServerDTO
- GET /api/public/servers/{serverSlug}/channels → PublicChannelDTO[]
- GET /api/public/channels/{channelId}/messages → paginated PublicMessageDTO[]
- GET /api/public/channels/{channelId}/messages/{messageId} → single PublicMessageDTO
- No auth required, visibility check on every request
- Labels: backend, feature, week-2
- Assignee: FardeenI
- Due: March 10
- Depends on: #5, #6, #7

**15. Redis Caching Layer**
- Cache middleware for public API responses
- Key patterns from spec: channel:{id}:visibility (3600s), channel:msgs:{id}:page:{page} (60s), server:{id}:info (300s)
- Cache invalidation on mutations (write-through)
- Stale-while-revalidate pattern
- Labels: backend, feature, week-2
- Assignee: AvanishKulkarni
- Due: March 11
- Depends on: #1

**16. Rate Limiting Middleware**
- Token bucket rate limiting
- Human users: 100 req/min per IP
- Verified bots (Googlebot, Bingbot): 1000 req/min
- 429 Too Many Requests with Retry-After header
- Bot detection via User-Agent
- Labels: backend, feature, week-2
- Assignee: Aiden-Barrera
- Due: March 11
- Depends on: #1

**17. Event Bus — Redis Pub/Sub for Cross-Service Events**
- VISIBILITY_CHANGED event publishing and subscribing
- MESSAGE_CREATED / MESSAGE_EDITED / MESSAGE_DELETED events
- Cache invalidation triggered by events
- Decouple services via event-driven architecture
- Labels: backend, feature, week-2
- Assignee: acabrera04
- Due: March 11
- Depends on: #15

**18. Attachment Service & File Storage**
- Attachment metadata CRUD (create, list by message)
- File upload endpoint with local filesystem storage for dev
- Content-type and size validation
- URL generation for serving attachments
- Wire into message service for attachment embedding
- Labels: backend, feature, week-2
- Assignee: FardeenI
- Due: March 11
- Depends on: #7

---

### 🔌 FRONTEND-BACKEND INTEGRATION — Week 2 (March 10–13)

**19. Frontend Integration — Authentication**
- Replace mock authService with real API calls
- JWT token storage (httpOnly cookies)
- Auto-refresh token logic
- Update AuthContext to use real endpoints (login, register, logout, getCurrentUser, updateCurrentUser)
- Wire UserSettingsPage profile editing (displayName, status) + logout flow
- Redirect flows on 401
- Labels: backend, integration, week-2
- Assignee: Aiden-Barrera
- Due: March 12
- Depends on: #3

**20. Frontend Integration — Servers & Channels**
- Replace mock serverService + channelService with real tRPC/API calls
- Update ALL server actions: createServerAction, saveServerSettings, deleteServerAction, saveChannelSettings, createChannelAction
- Wire server member list display
- Handle loading/error states properly
- Labels: backend, integration, week-2
- Assignee: declanblanc
- Due: March 12
- Depends on: #5, #6

**21. Frontend Integration — Messages**
- Replace mock messageService with real tRPC/API calls
- Wire cursor-based pagination to real API
- Wire sendMessage + deleteMessage
- Handle optimistic updates for message send
- Labels: backend, integration, week-2
- Assignee: FardeenI
- Due: March 12
- Depends on: #7

**22. Frontend Integration — Guest Public Channel View**
- Wire /c/{serverSlug}/{channelSlug} route to public REST API
- Wire isChannelGuestAccessible() for post-logout redirect logic
- Proper error handling: 403 (private) → login prompt, 404 → not found
- Cache-Control + X-Robots-Tag headers from API responses
- SEO metadata from real backend data
- Labels: backend, integration, week-2
- Assignee: acabrera04
- Due: March 13
- Depends on: #14

**23. Frontend Integration — Channel Visibility Toggle**
- Wire ChannelSettingsPage visibility section to real tRPC API
- Implement confirmation dialog for visibility changes
- Display audit log from real backend
- Handle optimistic updates + error rollback
- Labels: backend, integration, week-2
- Assignee: AvanishKulkarni
- Due: March 13
- Depends on: #11, #12, #20

---

### 🧹 QUALITY & POLISH — Week 2 (March 12–13)

**24. API Input Validation & Error Handling**
- Zod schemas for all tRPC + REST inputs
- Consistent error response format (code, message, details)
- 400/401/403/404/429/500 error handling
- Input sanitization for all user-provided strings
- Labels: backend, feature, week-2
- Assignee: acabrera04
- Due: March 12
- Depends on: #3, #14

**25. Next.js Auth Middleware — Server-Side Route Protection**
- Add Next.js middleware to protect /settings/* and /channels/* routes server-side
- Verify JWT from httpOnly cookie before rendering protected pages
- Redirect unauthenticated users to /auth/login immediately (no client-side spinner)
- Redirect non-admin users away from /settings/* routes
- Fixes GitHub issue #71 (3–4s spinner delay before redirect)
- Labels: backend, feature, week-2
- Assignee: declanblanc
- Due: March 13
- Depends on: #3, #19

---

### 📄 P4 DELIVERABLES — Documentation (March 9–13)

**26. P4 Deliverables — Dev Spec Update & Architecture Document**
- Update dev-spec-channel-visibility-toggle.md and dev-spec-guest-public-channel-view.md to reflect unified backend
- Create unified backend architecture document with text description + Mermaid diagram
- Justify design choices (PostgreSQL, Redis, tRPC+REST split, etc.) for a senior architect audience
- Per-module specification (P4 items 1–8): features, internal architecture + Mermaid, data abstraction, stable storage + schemas, API definition, class/method/field list with visibility, class hierarchy Mermaid diagram
- Include rendered Mermaid diagram screenshots in repo
- *(P4 Deliverables #1 + #2: Update Dev Specs + Specify the Backend)*
- Labels: backend, documentation, week-2
- Assignee: acabrera04
- Due: March 11
- Depends on: #1

**27. Backend README — Setup & Operations Guide**
- Create README.md in backend directory targeting SRE audience
- List every dependency on external library, framework, technology, or service
- Describe what databases are created, read from, and written to
- Document how to install, startup, stop, and reset the backend services and data storage
- Include Docker Compose usage, environment variables, migration commands, seed commands
- Written after implementation is complete so it reflects what was actually built
- *(P4 Deliverable #2: Wrap-Up item 4)*
- Labels: backend, documentation, week-2
- Assignee: AvanishKulkarni
- Due: March 13
- Depends on: #1, #2, #3, #6, #7

---

## Assignment Summary

| Developer | Issues | Focus Area |
|-----------|--------|------------|
| acabrera04 | #1, #10, #17, #22, #24, #26 | Scaffold, seeds, event bus, guest FE, validation, P4 docs |
| Aiden-Barrera | #3, #8, #12, #16, #19 | Auth, permissions, audit log, rate limiting, auth FE integration |
| AvanishKulkarni | #5, #9, #13, #15, #23, #27 | Servers, membership, SEO/sitemap, caching, visibility FE, README |
| declanblanc | #2, #6, #11, #20, #25 | DB schema, channels, visibility, server/channel FE, auth middleware |
| FardeenI | #4, #7, #14, #18, #21 | Users, messages, public API, attachments, message FE integration |

## Dependency Graph (simplified)
```
#1 Scaffold ─┬─► #2 DB Schema ─┬─► #4 Users ──► #8 Permissions ──► #11 Visibility Toggle ──► #12 Audit Log
             │                  ├─► #5 Servers ──► #6 Channels ──► #7 Messages              ──► #13 SEO
             │                  ├─► #9 Membership                                             ──► #14 Public API
             │                  └─► #10 Seeds                                                 ──► #18 Attachments
             ├─► #15 Redis Cache ──► #17 Event Bus
             ├─► #16 Rate Limiting
             ├─► #26 P4 Docs (Dev Specs + Architecture)
             └─► #3 Auth ──► #19 FE Auth Integration
                            ──► #20 FE Server/Channel Integration
                            ──► #21 FE Message Integration
                            ──► #22 FE Guest View Integration
                            ──► #23 FE Visibility Integration
                            ──► #24 Validation
                            ──► #25 Auth Middleware
                            ──► #27 Backend README (after #1,#2,#3,#6,#7)
```
