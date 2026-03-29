# School Management System

NestJS backend for a school management system with:

- PostgreSQL for persisted users, roles, permissions, and frontend route grants
- Redis-backed refresh sessions
- HttpOnly cookie authentication with JWT access and refresh tokens
- Seeded system roles, frontend route access, and a default system admin
- Docker and Docker Compose for local infrastructure

## Stack

- NestJS 11
- TypeORM
- PostgreSQL 16
- Redis 7
- JWT cookie authentication

## Quick Start

1. Copy `.env.example` to `.env`
2. Review the cookie, JWT, and admin credentials in `.env`
3. Start the stack:

```bash
npm install
copy .env.example .env
npm run docker:up
```

The API will be available at `http://localhost:3000`.

In local development with `NODE_ENV=development`, the backend uses the individual `DB_*` and `REDIS_*` settings so Docker Compose can talk to the local Postgres and Redis containers. In `staging` or `production`, set `DATABASE_URL` to your Neon connection string and either `REDIS_URL` or the Upstash REST credentials and the backend will switch automatically.

For TLS-enabled managed Redis providers such as Upstash, prefer a `rediss://` URL. If your provider gives you a `redis://...` URL plus a separate TLS flag, keep the URL and set `REDIS_TLS=true`.

If you are using Upstash REST credentials instead of the Redis socket connection, set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The auth session store only needs `SET`, `GET`, and `DEL`, so those credentials are sufficient.

The API now applies:

- a consistent JSON error envelope with `x-request-id` for easier debugging
- global rate limiting plus stricter limits on `register`, `login`, and `refresh`
- `Cache-Control: no-store` by default for auth-sensitive endpoints
- Redis-backed caching for `GET /auth/roles`

Swagger UI will be available at:

- `http://localhost:3000/docs`
- `http://localhost:3000/docs-json`

## Frontend Integration

The backend is configured for cookie-based auth. Your frontend should:

- send requests with credentials enabled
- never read auth cookies directly in JavaScript
- use `/auth/me` or `/auth/access` to determine the current user and allowed frontend routes

Browser example:

```ts
fetch('http://localhost:3000/auth/me', {
  credentials: 'include',
});
```

Allowed frontend origins are configured by `FRONTEND_ORIGINS`.

## Seeded Data

On startup the app seeds these roles into PostgreSQL:

- `SYSTEM_ADMIN`
- `PRINCIPAL`
- `CLASS_TEACHER`
- `STUDENT`

It also seeds default frontend route grants for each role and creates a default system admin account from `.env` if that email does not already exist.

Default admin values:

- Email: `admin@school.local`
- Password: `Admin@12345`

## Cookie Auth Flow

The backend uses two HttpOnly cookies:

- access token cookie: short-lived JWT used on protected requests
- refresh token cookie: long-lived JWT used only to mint a new access token

The refresh token is rotated and its hashed value is stored in Redis. Logging out removes the active refresh session from Redis and clears the cookies.

## Auth API

### `POST /auth/register`

Public registration endpoint. By default it creates a `STUDENT` account, sets auth cookies, and returns the authenticated user payload.

Example:

```json
{
  "name": "Jane Student",
  "email": "jane.student@example.com",
  "password": "StrongPass123"
}
```

Response:

```json
{
  "authenticated": true,
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresIn": 604800,
  "user": {
    "id": "uuid",
    "name": "Jane Student",
    "email": "jane.student@example.com",
    "status": "ACTIVE",
    "role": {
      "id": "uuid",
      "code": "STUDENT",
      "name": "Student",
      "level": 20,
      "permissions": [
        {
          "action": "READ",
          "resource": "self"
        }
      ],
      "frontendRoutes": [
        {
          "id": "uuid",
          "key": "dashboard",
          "path": "/dashboard",
          "label": "Dashboard",
          "description": "Main dashboard landing page",
          "category": "core",
          "sortOrder": 10
        }
      ]
    },
    "createdById": null,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### `POST /auth/login`

Validates credentials, sets HttpOnly cookies, and returns the authenticated user payload.

### `POST /auth/refresh`

Reads the refresh token from the HttpOnly cookie, rotates both JWTs, updates Redis, and sets fresh cookies.

### `POST /auth/logout`

Clears the auth cookies and invalidates the Redis-backed refresh session.

### `GET /auth/me`

Protected endpoint. Returns the current authenticated user, including role and granted frontend routes.

### `GET /auth/access`

Protected endpoint. Returns:

- current user
- current role
- frontend routes granted to that role

This is the cleanest endpoint for frontend route guards.

### `GET /auth/roles`

Returns all roles from PostgreSQL, including permissions and granted frontend routes.

### `POST /auth/users`

Protected endpoint for creating principals, teachers, students, or other managed users according to role hierarchy.

Example:

```json
{
  "name": "Mr. Sharma",
  "email": "teacher@example.com",
  "password": "StrongPass123",
  "roleCode": "CLASS_TEACHER"
}
```

### `PATCH /auth/users/:userId/role`

Protected endpoint for changing a user's role, subject to the same hierarchy checks.

Example:

```json
{
  "roleCode": "PRINCIPAL"
}
```

## Frontend Route Grants

Frontend routes are now stored in PostgreSQL and attached to roles. The backend seeds default route grants such as:

- `SYSTEM_ADMIN`: dashboard, profile, admin pages, principal pages, academic pages
- `PRINCIPAL`: dashboard, profile, principal pages, student directory
- `CLASS_TEACHER`: dashboard, profile, classroom pages, attendance pages
- `STUDENT`: dashboard, profile, student portal pages

Your frontend should use `/auth/access` or `/auth/me` and only allow navigation to routes included in `user.role.frontendRoutes`.

## Validation

```bash
npx tsc --noEmit -p tsconfig.json
npm run build
npm run lint
npm test
```
