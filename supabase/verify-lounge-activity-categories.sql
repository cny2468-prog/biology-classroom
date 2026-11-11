-- Exercise real row permissions and persistence without retaining test rows or points.
begin;
select set_config('test.category_teacher',(select id::text from public.profiles where role='teacher' limit 1),true);
select set_config('test.category_student',(select id::text from public.profiles where role='student' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.category_teacher'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.category_teacher'),true);
set local role authenticated;

with inserted as (
  insert into public.lounge_activity_categories(title,teacher_id)
  values ('Category permission verification '||gen_random_uuid(),auth.uid()) returning id
) select set_config('test.category_id',id::text,true) from inserted;

do $$ begin
  update public.lounge_activity_categories set title='Renamed verification '||gen_random_uuid()
    where id=current_setting('test.category_id')::uuid;
  if not found then raise exception 'Teacher cannot rename category'; end if;
  begin
    insert into public.lounge_activity_categories(title,teacher_id) values ('   ',auth.uid());
    raise exception 'Blank title accepted';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.category_student'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.category_student'),true);

do $$ begin
  if not exists(select 1 from public.lounge_activity_categories where id=current_setting('test.category_id')::uuid) then
    raise exception 'Student cannot read category';
  end if;
  begin
    insert into public.lounge_activity_categories(title,teacher_id) values ('Student forbidden category',auth.uid());
    raise exception 'Student can create category';
  exception when insufficient_privilege then null; end;
  update public.lounge_activity_categories set title='Student forbidden rename'
    where id=current_setting('test.category_id')::uuid;
  if found then raise exception 'Student can rename category'; end if;
  insert into public.lounge_posts(author_id,category,title,body,activity_category_id)
    values(auth.uid(),'activity','Verification activity','Rollback-only test',current_setting('test.category_id')::uuid);
  if not exists(select 1 from public.lounge_posts where author_id=auth.uid() and activity_category_id=current_setting('test.category_id')::uuid) then
    raise exception 'Student post category was not retained';
  end if;
  begin
    insert into public.lounge_posts(author_id,category,title,body,activity_category_id)
      values(auth.uid(),'activity','Invalid category','Rollback-only test',gen_random_uuid());
    raise exception 'Nonexistent category accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.lounge_posts(author_id,category,title,body,activity_category_id)
      values(auth.uid(),'article','Wrong type','Rollback-only test',current_setting('test.category_id')::uuid);
    raise exception 'Activity category accepted for article';
  exception when check_violation then null; end;
end $$;

reset role;
rollback;
select jsonb_build_object('teacher_create_rename',true,'student_read_and_post',true,'student_management_denied',true,'invalid_categories_denied',true,'test_data_rolled_back',true) as checks;
