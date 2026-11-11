-- Shared activity categories: teachers manage titles; signed-in students select them.
begin;

create table if not exists public.lounge_activity_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  teacher_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists lounge_activity_categories_title_unique
  on public.lounge_activity_categories (lower(trim(title)));

alter table public.lounge_activity_categories enable row level security;
drop policy if exists activity_categories_read on public.lounge_activity_categories;
create policy activity_categories_read on public.lounge_activity_categories
  for select to authenticated using (true);
drop policy if exists activity_categories_create on public.lounge_activity_categories;
create policy activity_categories_create on public.lounge_activity_categories
  for insert to authenticated with check (teacher_id = auth.uid() and public.is_teacher());
drop policy if exists activity_categories_edit on public.lounge_activity_categories;
create policy activity_categories_edit on public.lounge_activity_categories
  for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
grant select, insert on public.lounge_activity_categories to authenticated;
grant update (title) on public.lounge_activity_categories to authenticated;

alter table public.lounge_posts add column if not exists activity_category_id uuid
  references public.lounge_activity_categories(id);
alter table public.lounge_posts drop constraint if exists lounge_activity_category_type_check;
alter table public.lounge_posts add constraint lounge_activity_category_type_check
  check (activity_category_id is null or category = 'activity');
create index if not exists lounge_posts_activity_category_idx
  on public.lounge_posts(activity_category_id);

notify pgrst, 'reload schema';
commit;
