# TODO: Third-Party Auth Modifications

## Pending Tasks
- [x] Modify OAuth callback routes to set custom cookies indicating third-party auth
  - [x] Google callback: src/app/api/auth/callback/google/route.ts
  - [x] Facebook callback: src/app/api/auth/callback/facebook/route.ts
  - [x] GitHub callback: src/app/api/auth/callback/github/route.ts
- [x] Update users/update route to conditionally require current password based on passwordHash existence
  - [x] src/app/api/users/update/route.ts
- [x] Modify PasswordDialog to hide current password field for users without passwords
  - [x] src/app/(main)/settings/PasswordDialog.tsx
- [ ] Test OAuth flows, password updates, and data encryption
- [ ] Ensure security: secure cookies, proper encryption
