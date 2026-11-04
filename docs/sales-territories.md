# Sales territories, city routing and portraits

Sensor Studio's Business directory now manages sales coverage and portraits. A directory person is a business identity; assigning territories does not create an account, grant a staff role or grant access to customer dossiers.

## Administrator workflow

Open `/standex/admin`, then the person's actions → **Photo and territories**.

- Select a country and assign the whole country, or enable **Manage this country by region** and select regions.
- The selection shows each current owner. Review the before/after table, then explicitly confirm.
- Splitting a country keeps every unselected region with the previous country owner. A whole-country transfer replaces regional assignments; all owners are shown in the review.
- Regions have one owner. The server locks a single country row and checks its version. An old confirmation is rejected and must be reviewed again after reloading.
- Removing coverage shows unassigned regions. Transfer/remove territories before deactivating a salesperson or changing their business role.
- Upload a JPEG/PNG/WebP portrait up to 2 MiB, replace it, or remove the manual choice. Uploads are resized to at most 512 pixels and re-encoded as WebP. Only administrators may upload or delete portrait objects. Portraits are intentionally public: they are displayed to prospects.
- Save a person's HTTPS booking URL. The customer opens that person's booking page; Sensor Studio does not create Outlook calendar events.

## Geography and submission

Country codes use ISO country identifiers. Subdivision identifiers use **GeoNames ADM1**, consistently for both regions and cities; they must not be confused with ISO 3166-2. France uses its current metropolitan administrative regions; Germany uses its 16 Länder. Overseas territories have their own geographic country entries (for example GP and RE). This is not a postcode-based or custom sales-district system.

The country-scoped search returns populated places with their region and district code. A prospect explicitly selects a result; homonymous cities in different regions remain separate. Changing the city or country clears its previous identifier and region. Search supports normalized names and alternative names from the reference.

New snapshots retain `siteCityId`, `siteRegionCode`, and `siteRegionName` in addition to the existing city and country. At revision insertion the database validates the city against its imported reference and records the geographic sales route. A client cannot attach an arbitrary region to a city.

Whole-country ownership can route a free-text city. Regional ownership requires a recognized selected city. Unknown, ambiguous, uncovered or unimported places stay unassigned for manual follow-up; the application never invents a region or chooses a salesperson arbitrarily. The form allows submission in this case so a lookup issue does not lose a lead. The customer receives an honest follow-up message, with no simulated appointment confirmation.

Existing snapshots remain readable and unchanged. Geographic routing is stored in `lead.sales_routes` and projected as the CRM's suggested contact. Explicit CRM owners and dossier permissions are unchanged. The booking card uses current territory configuration; a later territory transfer can therefore change the contact offered when that card is reopened.

## Installation on the existing Supabase project

1. Confirm the target project and back it up using the organization's normal process. Prerequisites: Lead 1.2, CRM 1.8 and `20260917110421_feedback_20260917_site_location.sql`.
2. Apply `supabase/migrations/20261104085232_sales_territories.sql` once. It adds reference, territory, profile and route tables; admin-checked RPCs; portrait storage rules; and a revision trigger. Public RPC wrappers are invokers, implementations are in the private schema, and direct table access remains revoked. No real salesperson assignments are seeded.
3. Generate reference imports, for example:

   ```sh
   node scripts/geography-data.mjs FR DE CH US CA
   ```

   The script downloads each country's complete GeoNames file and includes active populated places, including small settlements. No API key or third-party request containing a prospect's city is needed at runtime. It writes SQL and a timestamp/SHA-256 manifest under `tmp/geography/` (not tracked).
4. In the target PostgreSQL database, import `countries.sql`, then `regions.sql`, then every numbered SQL file for each country. Import that country's `*-complete.sql` **last and only if all its numbered files succeeded**. With `psql`, use `-v ON_ERROR_STOP=1` and the database connection supplied through your organization's secret management. Never put a privileged database password or service key into a `VITE_*` variable. The completion marker controls the UI's readiness message. All countries can be imported with the same command; the list is an explicit deployment choice.
5. Deploy the application against that same Supabase project. No new browser environment variable is required. Assign actual territories in the admin, upload approved portraits and configure each booking URL.
6. Verify with non-production identities: whole-country assignment, split, transfer, stale confirmation, duplicate city names, missing coverage, portrait replacement and a real booking through the configured service. No test should send a real invitation without an agreed test recipient.

Reference data: [GeoNames downloads](https://download.geonames.org/export/dump/) and [licence/terms](https://www.geonames.org/export/), CC BY 4.0. The form includes attribution. The script does not bundle the large city datasets into the browser or source repository. New geographic boundaries should be reviewed before importing refreshed data: existing region ownership is not silently rewritten. Old portrait objects are retained when a choice is removed/replaced; an operator can remove unreferenced objects under an agreed retention policy.

## Microsoft photo fallback

Display order is **admin photo → synchronized Microsoft photo → initials**. A missing or broken image also falls through to the next source. Changing the account linked to a directory person clears the previous Microsoft photo reference.

Microsoft photo synchronization is **not activated by this change**. A Bookings URL alone cannot supply a profile photo. During Microsoft 365 integration, IT can use Microsoft Graph's [`GET /me/photo/$value` or `/users/{id}/photo/$value`](https://learn.microsoft.com/en-us/graph/api/profilephoto-get?view=graph-rest-1.0) with the required permissions and tenant approval. For the connected user's own photo, delegated `User.Read` is supported; directory-wide access should use the least privilege supported by the endpoint and the organization's policy. Treat a 404 as no photo.

The server-side synchronizer must bind a verified Microsoft identity to the already-linked Sensor Studio user, resize/re-encode the returned image, write a new object into `sales-portraits`, and set only `microsoft_photo_path` and `microsoft_user_id` in `lead.sales_profiles`. The latter is the linked **Sensor Studio auth user UUID**, not a Microsoft object ID. Keep Microsoft tenant/object IDs in the verified identity system. Increment the profile version when synchronizing. Never overwrite `photo_path`; never derive identity from a display name or trust a client-supplied Microsoft identifier. Browser clients have no write API for Microsoft photo fields. Tokens and application secrets remain server-side.

## Verification commands

```sh
bun test tests/
bun test scripts/territory-ui.test.tsx
bun scripts/i18n-inventory.ts --json
bunx tsc --noEmit
bun run build
```

The UI test runs separately so its adapter mocks cannot contaminate the main suite. PostgreSQL tests apply the real migration on top of the existing Lead/CRM migrations with real `anon`/`authenticated` roles.

## Existing project rollout — 4 November 2026

The migration and reference data were applied to the existing Sensor Studio database. Imported: France (13 metropolitan regions, 81,464 populated places) and Germany (16 Länder, 82,351 populated places), plus the worldwide country/ADM1 reference. Other countries require their city import before regional routing can resolve a prospect. No commercial assignments, portraits or booking links were seeded.

Switzerland was subsequently enabled on the same day: all 26 cantons have populated-place coverage, with 13,189 places imported using `node scripts/geography-data.mjs CH`. Source SHA-256: `2264a3dfed7e43a8913132f7905235a8bea8dad85e1db678170eed798c0cecba`. Live anonymous searches verified Lausanne → CH.VD, Genève → CH.GE, Zürich → CH.ZH, Lugano → CH.TI and Sion → CH.VS. Alternative names are searchable; displayed reference names can use another Swiss language or English. No Swiss commercial assignments were created. Existing regional split/transfer rules apply to cantons without any application redeployment.

Validation: 2,235 main-suite tests and 3 isolated interface tests passed; TypeScript and the production build passed. Live anonymous lookups verified city-to-region resolution and denied access to the internal CRM projection. Local browser checks covered the region-transfer review and homonymous city selection. The authenticated production admin still needs the administrator's normal account to configure actual coverage.
