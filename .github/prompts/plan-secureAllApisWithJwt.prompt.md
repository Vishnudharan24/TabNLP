## Plan: Secure APIs with JWT

Introduce JWT authentication at the API layer with centralized settings, reusable auth dependencies, and Mongo-backed user/revocation storage. This secures all current endpoints with minimal disruption by keeping business logic unchanged, while allowing phased rollout for existing `/test/*` routes to avoid breaking current workflows.

### Steps
1. Centralize auth config in [config/settings.py](config/settings.py) with `Settings` and JWT env fields.
2. Add JWT primitives in [security/jwt_auth.py](security/jwt_auth.py): `create_access_token()`, `decode_token()`, `verify_jwt_claims()`.
3. Add password utilities in [security/passwords.py](security/passwords.py): `hash_password()` and `verify_password()`.
4. Extend persistence in [db/db_store.py](db/db_store.py) for `users_collection` and revoked-token `jti` checks.
5. Enforce auth dependencies in [main.py](main.py) using `get_current_principal()` and route-level `require_roles(...)`.
6. Roll out safely with temporary `/test/*` bypass flag, then remove after client migration.

### Further Considerations
1. Token model: Option A access-only / Option B access+refresh rotation / Option C opaque refresh store.
2. Crypto choice: Option A HS256 shared secret / Option B RS256 keypair with `kid` rotation.
3. Migration policy: Option A secure all routes immediately / Option B phase `/test/*` later / Option C env-based gradual enforcement.

Please review this draft and share your A/B/C choices so I can refine it.

Option A
