-- All fixtures and point changes are rolled back. Existing content is untouched.
begin;
do $$
declare
  owners uuid[];
  class_id uuid;
  question_id uuid := gen_random_uuid();
  own_answer uuid := gen_random_uuid();
  other_answer uuid := gen_random_uuid();
  own_reply uuid := gen_random_uuid();
  other_reply uuid := gen_random_uuid();
begin
  select array_agg(id) into owners from (
    select p.id from public.profiles p
    where p.role='student' and exists(select 1 from public.enrollments e where e.student_id=p.id)
    order by p.id limit 2
  ) candidates;
  if coalesce(array_length(owners,1),0)<>2 then raise exception 'Two enrolled students are needed for the rollback test'; end if;
  select e.class_id into class_id from public.enrollments e where e.student_id=owners[1] limit 1;
  perform set_config('qna_test.owner',owners[1]::text,true);
  perform set_config('qna_test.question',question_id::text,true);
  perform set_config('qna_test.answer',own_answer::text,true);
  perform set_config('qna_test.other_answer',other_answer::text,true);
  perform set_config('qna_test.reply',own_reply::text,true);
  perform set_config('qna_test.other_reply',other_reply::text,true);
  insert into public.questions(id,class_id,author_id,title,body) values(question_id,class_id,owners[1],'QNA rollback verification','Temporary fixture; rollback required');
  insert into public.answers(id,question_id,author_id,body) values(own_answer,question_id,owners[1],'Own answer'),(other_answer,question_id,owners[2],'Other answer');
  insert into public.answer_replies(id,answer_id,author_id,body) values(own_reply,own_answer,owners[1],'Own reply'),(other_reply,own_answer,owners[2],'Other reply');
  perform set_config('request.jwt.claim.sub',owners[1]::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owners[1],'role','authenticated')::text,true);
end $$;

set local role authenticated;
do $$
declare changed integer;
begin
  update public.answer_replies set body='Edited own reply' where id=current_setting('qna_test.reply')::uuid;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Author reply update failed'; end if;

  update public.answer_replies set body='Unauthorized edit' where id=current_setting('qna_test.other_reply')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Other author reply update was allowed'; end if;

  delete from public.answer_replies where id=current_setting('qna_test.other_reply')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Other author reply deletion was allowed'; end if;

  delete from public.answers where id=current_setting('qna_test.other_answer')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Other author answer deletion was allowed'; end if;

  delete from public.answer_replies where id=current_setting('qna_test.reply')::uuid;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Author reply deletion failed'; end if;
  if not exists(select 1 from public.answers where id=current_setting('qna_test.answer')::uuid) then raise exception 'Deleting reply removed parent'; end if;

  delete from public.answers where id=current_setting('qna_test.answer')::uuid;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Author answer deletion failed'; end if;
  if exists(select 1 from public.answer_replies where answer_id=current_setting('qna_test.answer')::uuid) then raise exception 'Child reply cascade failed'; end if;
  if not exists(select 1 from public.answers where id=current_setting('qna_test.other_answer')::uuid) then raise exception 'Other answer was removed'; end if;
end $$;
reset role;
rollback;
