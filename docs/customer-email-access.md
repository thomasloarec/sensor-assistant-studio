# Customer accounts and email access — Standex deployment guide

Status: implemented behind disabled-by-default flags. Production deployment, SMTP delivery and live database configuration have not been verified. The connected Supabase account currently exposes a different project; access to Sensor Studio remains outstanding.

## Customer experience

1. Visitors complete the design journey without signing in.
2. At submission, existing business/contact information is reused. A private pending snapshot is saved before requesting an email. Auth creates an account if needed; no password or separate registration form is required.
3. The customer opens the email and selects **Access my projects**. This confirmation protects single-use links against mail scanners. Verification authenticates the email owner; the pending project is then submitted through the existing validation pipeline.
4. Returning customers select **I already have a project**, enter their email and request a link. Existing users may choose **Use an existing password**. New customers are not asked to create a password; password management is outside this release.
5. The first confirmed submission populates a private contact profile to prefill empty fields on later projects. Historical submitted contact snapshots are not rewritten.

This customer workspace supports project continuity. It grants no staff role and creates no marketing subscription. Name, company and phone remain business information from the questionnaire. Email verification proves mailbox control, not employment or authority. Shared mailboxes share account access.

**NDA exception:** projects requiring an NDA retain the authenticated NDA workflow. The anonymous pending path cannot bypass an NDA or transfer an NDA-protected model. Account creation is explicitly available before that protected workflow.

## Data and authorization

- Pending submissions, profiles, rate counters and verified-event markers live in private `lead` tables with RLS. Neither `anon` nor `authenticated` can read them directly or invoke the privileged command boundary.
- The same-origin `/api/customer-access` endpoint uses a server secret. Account operations validate the bearer token with Supabase Auth and require a confirmed, non-anonymous user. SQL independently checks the verified user's email. Caller-supplied user IDs are ignored.
- Pending writes require an unguessable receipt, stored as a SHA-256 digest. Content is sealed after first save. Entering someone else's email does not grant access to their projects.
- Claiming creates the dossier, revision, profile and verified-event marker transactionally. Repeated claims return the original result. Existing Auth IDs and ownership are preserved; historical projects are never reassigned by matching contact email.
- Optional models are private, self-contained GLB files, at most 30 MiB. A scoped, non-overwriting signed grant uploads directly to Storage. The server downloads the stored object and verifies structure, size and SHA-256. No anonymous download grant is issued. Existing ownership rules govern access after confirmation.
- Pending submissions expire no later than 24 hours after reservation and no later than 24 hours after consent. File preparation can shorten the remaining window. Resending an email does not extend it. Expired submissions require resubmission from a local draft/export.
- Existing browser session persistence remains. Standex should review script injection prevention, dependencies, Content Security Policy and shared-device sign-out. This release does not migrate sessions to server-only cookies.

## Hosting configuration

Use Standex-owned Supabase and email-provider accounts. Frontend and server must target the same project. Store secrets in the hosting secret manager; never prefix a secret with `VITE_`.

| Variable | Location | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Build | Approved project's API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build | Public browser key; existing legacy anon-key fallback remains supported |
| `VITE_CUSTOMER_EMAIL_ACCESS_ENABLED` | Build | `true` enables the public journey and email-first screen |
| `STANDEX_SUPABASE_URL` | Server | Same project's HTTPS URL; no new endpoint fallback |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Same project's public key for Auth |
| `standex_supabase_secret_key` or `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Privileged backend key, never exposed to browsers |
| `STANDEX_SITE_URL` | Server | Approved HTTPS origin without a path; redirects and Origin validation |
| `CUSTOMER_RATE_LIMIT_SECRET` | Server secret | Independent random secret, at least 32 characters, for hashed counter keys |
| `CUSTOMER_EMAIL_ACCESS_ENABLED` | Server | `true` enables the configured endpoint |
| `CUSTOMER_TRUSTED_IP_HEADER` | Server, optional | Only a header overwritten by the trusted hosting proxy, removing caller values |
| `STANDEX_TESTER_EMAILS` | Server | Approved internal AI testers, comma-separated; public signup grants no tester access |

The host must run the application's TanStack Start server entry with Node crypto and Storage downloads. Static-only hosting is insufficient. Incomplete server configuration returns unavailable and sends no email.

## Supabase Auth and email setup

1. Enable email authentication and new email users. Keep **Confirm email** enabled. Disable anonymous sign-in for this flow; never auto-confirm customers through an admin API.
2. Set Auth Site URL to the approved HTTPS site. Allow `/account` redirects including its `pending` query parameter. Use only approved origins and narrowly scoped patterns; verify query matching in staging. Never use a universal redirect wildcard.
3. Configure custom SMTP with an official Standex sender/provider account. Complete domain verification and SPF/DKIM/DMARC with IT. Check provider quotas, Supabase Auth limits and corporate mail-security rewriting.
4. Install `supabase/email-templates/customer-magic-link.html` for both **Magic Link** and **Confirm signup**. Preserve `{{ .RedirectTo }}` and the token-hash fragment. Default homepage redirects do not implement this confirmation flow.
5. Set and record token expiry; 15 minutes is a suggested starting point for validation. This is independent of the pending project lifetime. Test single use, expiration and resend against the actual configuration.
6. Disable click tracking on authentication links. The page removes the token fragment from the displayed URL and waits for the explicit confirmation button before `verifyOtp`.
7. Test external and Standex mailboxes with approved test accounts, including mail scanning. No real email delivery test is included in the local evidence.

Login/resend responses intentionally do not reveal whether an account exists. Submission can report saved data with an email-request failure. Provider diagnostics are not exposed. Configure delivery-failure alerts in the email provider/Supabase.

## Rollout and acceptance

1. Inspect the target database, migrations, security advisors, private Storage bucket and Auth settings. Confirm the reviewed lead schema through version 1.11 exists. Take a recoverable backup.
2. Apply `supabase/migrations/20261103140450_customer_email_access.sql` to staging through the approved migration process. It records lead schema version 1.12. Do not blindly replay historical `supabase/schema` scripts.
3. Configure server/build variables, SMTP, templates and redirects. Keep production flags disabled until acceptance passes.
4. Run the local checks below. In staging, test with two mailboxes: submit while signed out; receive/confirm; reopen by link; existing-password login; expired/reused links; resend; two projects for one email; cross-account denial; model unreadable before confirmation and owner-only after; unchanged NDA flow; customer denied staff/internal AI access.
5. Run security advisors after migration. Verify the RPC is denied to anonymous and ordinary customer tokens. Confirm server secrets are absent from browser assets, responses and logs.
6. Deploy the tested application and enable both flags. Monitor Auth failures, delivery, pending age, Storage growth, cleanup failures and HTTP 429/503 responses.

```sh
bun test tests/ --timeout 30000
bunx tsgo --noEmit
bun run build
```

Local database tests use PGlite with actual prerequisite submission functions and the new migration. They cover authorization, ownership, replay, consent/hash validation, expiry and cleanup. HTTP tests inject Auth/Storage dependencies. These do not replace real Supabase, SMTP and proxy acceptance tests.

## Retention and cleanup

Schedule `bun tools/customer-access-cleanup.ts --execute` in the trusted environment, for example hourly. Without `--execute`, it is a read-only dry run. Each run handles at most 100 expired unclaimed submissions; repeat until below 100 when clearing a backlog. No scheduler is installed by this change.

Cleanup waits two additional hours after expiry so outstanding signed upload grants expire. It locks and marks candidates before deleting Storage objects, then database rows; a claim cannot race deletion. Failed Storage deletion retains rows for retry. Claimed projects are excluded. With an hourly healthy job and no backlog, unclaimed data is generally removed within 27 hours of reservation. Backups/provider logs follow separate policies.

Claimed data, duplicate pending snapshots, profiles, event markers and unconfirmed Auth users are not purged by this job. Standex must define their retention and account-deletion process, including files/backups. Rate-counter windows older than two days are removed during execution. Tool output contains counts, not emails or contents.

## Abuse protection

Shared fixed-hour limits apply across server instances: 200 requests globally, 8 per normalized email, 20 file reservations globally, optionally 30 per trusted client IP. These include preparation/verification and account actions, not only emails. Counter keys are HMAC digests. Conservative global caps can affect legitimate bursts.

Review caps against expected traffic and configure edge rate limiting/bot controls. Application counters are not a denial-of-service guarantee. CAPTCHA token handling is not implemented: enabling Auth CAPTCHA alone would break requests. Keep the Storage bucket private with a 30 MiB limit and approved GLB MIME type.

## Other handover dependencies

- **Quickbase:** `lead.customer_verified_events` records a stable pending/dossier/revision identity after verification. This is an integration marker, not a working connector, delivery queue or complete feed of later revisions. A Standex-owned integration must define mapping, idempotency, retries, permissions and coverage of existing authenticated submissions. Never export pending entries as verified leads.
- **Management workspace:** this change does not remove it. The separate Beta-label change is independent; enabling customer access does not deploy that change.
- **Paid AI:** account creation and email verification do not call Claude/ChatGPT. Verified customers cannot invoke internal experimental AI unless separately allowlisted. External report translation is blocked server-side while its switch is false. Production AI still needs an official Standex provider account, documented model/purpose, budget, data-transfer approval and secret rotation. Personal credentials are not a production dependency to retain.
- **Service ownership:** assign Standex owners for Supabase, hosting, source/deployment access, DNS/domain, transactional email, future Quickbase credentials and paid AI subscriptions.

## Rollback

Disable the frontend flag and rebuild; disable the server flag. Existing password authentication and tester-gated journey remain as before. Preserve the additive migration and customer data. Continue cleanup with a trusted maintenance configuration; the utility also requires its server feature flag. Pending links cannot complete while disabled: provide a support/resubmission route.

## Official references

- [Passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Signed upload URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)
