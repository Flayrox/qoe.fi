# `@qoe/auth`

**Role:** Manages the Role-Based Access Control (RBAC) declarations, user sessions, and transactional email triggers for security events.

## File Exhaustive Listing
- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/current-user.ts`
- `src/mailer.ts`
- `src/permissions.ts`
- `src/roles.ts`

## Key Function Signatures
```typescript
// permissions.ts
export function can(userRole: Role | null, action: Action): boolean;
export function require(userRole: Role | null, action: Action): void;

// roles.ts
export function hasRoleLevel(userRole: Role | null, required: Role): boolean;
export function isSuperadmin(userRole: Role | null): boolean;
export function isCreator(userRole: Role | null): boolean;
```
