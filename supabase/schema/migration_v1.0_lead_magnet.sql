-- Migration V1.0 — parcours Lead Magnet (co-conception, revue R&D, offre, échantillons).
-- Backend cible : projet Supabase existant du client (yyobodalwtsqdyrqwkjk).
-- Additive uniquement : les tables sensor_test_* du banc interne ne sont pas touchées.
-- Aucun accès anon, aucune autoattribution de rôle, search_path figé.

begin;

create schema if not exists lead;
revoke all on schema lead from public;
grant usage on schema lead to authenticated, service_role;

-- Rôles staff provisionnés côté serveur uniquement.
do $$ begin
  create type lead.staff_role as enum ('rnd', 'sales', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists lead.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role lead.staff_role not null,
  created_at timestamptz not null default now()
);
grant select on lead.staff_members to authenticated;
grant all on lead.staff_members to service_role;
alter table lead.staff_members enable row level security;
create policy staff_read_self on lead.staff_members
  for select to authenticated using (user_id = auth.uid());
-- Aucune policy insert/update/delete : provisionnement par service_role seulement.

create or replace function lead.has_staff_role(_user_id uuid, _role lead.staff_role)
returns boolean language sql stable security definer set search_path = lead, public as $$
  select exists (select 1 from lead.staff_members where user_id = _user_id and role = _role);
$$;

create or replace function lead.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = lead, public as $$
  select exists (select 1 from lead.staff_members where user_id = _user_id);
$$;

-- Dossiers de conception.
create table if not exists lead.design_dossiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  current_revision integer not null default 1 check (current_revision >= 1),
  nda_status text not null default 'requested'
    check (nda_status in ('not_required','requested','prepared','awaiting_signatures','in_force'))
);

create table if not exists lead.design_collaborators (
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (dossier_id, user_id)
);

create or replace function lead.can_read_dossier(_dossier uuid)
returns boolean language sql stable security definer set search_path = lead, public as $$
  select exists (
    select 1 from lead.design_dossiers d
    where d.id = _dossier
      and (d.owner_id = auth.uid()
        or exists (select 1 from lead.design_collaborators c
                   where c.dossier_id = d.id and c.user_id = auth.uid()))
  ) or lead.is_staff(auth.uid());
$$;

-- Instantanés immuables soumis à la revue.
create table if not exists lead.design_revisions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  revision integer not null check (revision >= 1),
  snapshot jsonb not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references auth.users(id),
  consents jsonb not null default '[]'::jsonb,
  transferred_files jsonb not null default '[]'::jsonb,
  unique (dossier_id, revision)
);

create table if not exists lead.design_reviews (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  revision_id uuid not null references lead.design_revisions(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  scope text not null,
  conditions text not null default '',
  verdict text not null check (verdict in ('validated','variant_proposed','more_info')),
  published boolean not null default false,
  client_message text,
  superseded_by uuid references lead.design_reviews(id) on delete set null
);

-- Notes internes Standex : jamais lisibles par le client.
create table if not exists lead.internal_notes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  body text not null
);

create table if not exists lead.offers (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  review_id uuid not null references lead.design_reviews(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  currency text not null,
  tiers jsonb not null,
  moq integer not null check (moq > 0),
  nre_tooling_cost numeric,
  incoterm text not null,
  lead_time_weeks integer,
  valid_until date not null
);

create table if not exists lead.sample_requests (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  part_number text not null,
  quantity integer not null check (quantity > 0),
  route text not null check (route in ('distributors','standex_direct','manual_review')),
  status text not null default 'requested'
    check (status in ('requested','confirmed','shipped','received','closed')),
  feedback text
);

create table if not exists lead.nda_proofs (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  template_sha256 text not null,
  document_sha256 text not null,
  verified_at timestamptz not null,
  verified_by uuid not null references auth.users(id)
);

grant select, insert, update on lead.design_dossiers to authenticated;
grant select on lead.design_collaborators to authenticated;
grant select, insert on lead.design_revisions to authenticated;
grant select on lead.design_reviews to authenticated;
grant select, insert on lead.sample_requests to authenticated;
grant select on lead.offers to authenticated;
grant select on lead.nda_proofs to authenticated;
grant all on lead.design_dossiers, lead.design_collaborators, lead.design_revisions,
  lead.design_reviews, lead.internal_notes, lead.offers, lead.sample_requests,
  lead.nda_proofs to service_role;

alter table lead.design_dossiers enable row level security;
alter table lead.design_collaborators enable row level security;
alter table lead.design_revisions enable row level security;
alter table lead.design_reviews enable row level security;
alter table lead.internal_notes enable row level security;
alter table lead.offers enable row level security;
alter table lead.sample_requests enable row level security;
alter table lead.nda_proofs enable row level security;

create policy dossier_read on lead.design_dossiers for select to authenticated
  using (lead.can_read_dossier(id));
create policy dossier_insert on lead.design_dossiers for insert to authenticated
  with check (owner_id = auth.uid());
create policy dossier_update on lead.design_dossiers for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy collaborators_read on lead.design_collaborators for select to authenticated
  using (user_id = auth.uid() or lead.can_read_dossier(dossier_id));

create policy revisions_read on lead.design_revisions for select to authenticated
  using (lead.can_read_dossier(dossier_id));
create policy revisions_insert on lead.design_revisions for insert to authenticated
  with check (submitted_by = auth.uid() and lead.can_read_dossier(dossier_id));

-- Le client ne voit que les retours explicitement publiés ; la R&D voit tout.
create policy reviews_read_client on lead.design_reviews for select to authenticated
  using ((published and lead.can_read_dossier(dossier_id)) or lead.is_staff(auth.uid()));
create policy reviews_write_staff on lead.design_reviews for all to authenticated
  using (lead.has_staff_role(auth.uid(), 'rnd') or lead.has_staff_role(auth.uid(), 'admin'))
  with check (author_id = auth.uid()
    and (lead.has_staff_role(auth.uid(), 'rnd') or lead.has_staff_role(auth.uid(), 'admin')));

create policy notes_staff_only on lead.internal_notes for all to authenticated
  using (lead.is_staff(auth.uid())) with check (author_id = auth.uid() and lead.is_staff(auth.uid()));

create policy offers_read on lead.offers for select to authenticated
  using (lead.can_read_dossier(dossier_id));
create policy offers_write_sales on lead.offers for all to authenticated
  using (lead.has_staff_role(auth.uid(), 'sales') or lead.has_staff_role(auth.uid(), 'admin'))
  with check (author_id = auth.uid()
    and (lead.has_staff_role(auth.uid(), 'sales') or lead.has_staff_role(auth.uid(), 'admin'))
    and exists (select 1 from lead.design_reviews r
                where r.id = review_id and r.verdict = 'validated'));

create policy samples_read on lead.sample_requests for select to authenticated
  using (lead.can_read_dossier(dossier_id));
create policy samples_insert on lead.sample_requests for insert to authenticated
  with check (requested_by = auth.uid() and lead.can_read_dossier(dossier_id));

create policy nda_read on lead.nda_proofs for select to authenticated
  using (lead.can_read_dossier(dossier_id));
-- Les preuves NDA sont écrites par le serveur uniquement (service_role).

-- Bucket privé pour les fichiers explicitement transmis.
insert into storage.buckets (id, name, public)
values ('lead-design-files', 'lead-design-files', false)
on conflict (id) do nothing;

commit;
