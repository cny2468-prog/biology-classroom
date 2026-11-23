begin;

-- The author can edit only the text of a nested reply.
grant update (body), delete on public.answer_replies to authenticated;
drop policy if exists answer_replies_owner_update on public.answer_replies;
create policy answer_replies_owner_update on public.answer_replies
for update to authenticated
using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists answer_replies_owner_delete on public.answer_replies;
create policy answer_replies_owner_delete on public.answer_replies
for delete to authenticated using (author_id = auth.uid());

-- Existing foreign keys cascade to nested replies and helpful votes.
grant delete on public.answers to authenticated;
drop policy if exists answers_owner_delete on public.answers;
create policy answers_owner_delete on public.answers
for delete to authenticated using (author_id = auth.uid());

notify pgrst, 'reload schema';
commit;
