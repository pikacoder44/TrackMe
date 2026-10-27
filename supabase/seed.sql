-- seed.sql
-- Test data for TrackMe: 2 organizations, 1 owner, 1 manager, 2 employees, plus sample projects & work sessions

-- Fixed UUIDs for predictable testing and seeding
DO $$
DECLARE
  org_acme_id CONSTANT UUID := '11111111-1111-4111-a111-111111111111';
  org_globex_id CONSTANT UUID := '22222222-2222-4222-a222-222222222222';

  user_owner_id CONSTANT UUID := 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  user_manager_id CONSTANT UUID := 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  user_emp1_id CONSTANT UUID := 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  user_emp2_id CONSTANT UUID := 'dddddddd-dddd-4ddd-dddd-dddddddddddd';

  project_alpha_id CONSTANT UUID := '33333333-3333-4333-a333-333333333333';
  project_beta_id CONSTANT UUID := '44444444-4444-4444-a444-444444444444';
  project_globex_id CONSTANT UUID := '55555555-5555-4555-a555-555555555555';

  session_emp1_id CONSTANT UUID := '66666666-6666-4666-a666-666666666666';
  session_emp2_id CONSTANT UUID := '77777777-7777-4777-a777-777777777777';
BEGIN
  -- 1. Create auth users (if auth.users exists in local Supabase environment)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (user_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@acme.com', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alice Owner"}', now(), now()),
    (user_manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@acme.com', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bob Manager"}', now(), now()),
    (user_emp1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev1@acme.com', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Charlie Dev"}', now(), now()),
    (user_emp2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'designer@acme.com', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Diana Designer"}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- 2. Ensure Profiles exist
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES
    (user_owner_id, 'owner@acme.com', 'Alice Owner', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice'),
    (user_manager_id, 'manager@acme.com', 'Bob Manager', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob'),
    (user_emp1_id, 'dev1@acme.com', 'Charlie Dev', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie'),
    (user_emp2_id, 'designer@acme.com', 'Diana Designer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana')
  ON CONFLICT (id) DO UPDATE 
  SET full_name = EXCLUDED.full_name,
      avatar_url = EXCLUDED.avatar_url;

  -- 3. Organizations
  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (org_acme_id, 'Acme Technologies', 'acme-tech'),
    (org_globex_id, 'Globex Corporation', 'globex-corp')
  ON CONFLICT (id) DO NOTHING;

  -- 4. Organization Members
  -- Acme Tech team: Alice (owner), Bob (manager), Charlie (employee), Diana (employee)
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (org_acme_id, user_owner_id, 'owner'),
    (org_acme_id, user_manager_id, 'manager'),
    (org_acme_id, user_emp1_id, 'employee'),
    (org_acme_id, user_emp2_id, 'employee'),
    -- Alice also owns Globex Corporation
    (org_globex_id, user_owner_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET role = EXCLUDED.role;

  -- 5. Projects
  INSERT INTO public.projects (id, organization_id, name, description, is_active)
  VALUES
    (project_alpha_id, org_acme_id, 'Core Platform Redesign', 'Revamping core web platform UI and microservices', true),
    (project_beta_id, org_acme_id, 'Mobile App Companion', 'React Native tracker app for iOS & Android', true),
    (project_globex_id, org_globex_id, 'Logistics Engine', 'Fleet tracking and inventory system', true)
  ON CONFLICT (id) DO NOTHING;

  -- 6. Work Sessions
  INSERT INTO public.work_sessions (id, organization_id, user_id, project_id, status, started_at, notes)
  VALUES
    (session_emp1_id, org_acme_id, user_emp1_id, project_alpha_id, 'active', now() - interval '2 hours', 'Developing Supabase SSR client integration'),
    (session_emp2_id, org_acme_id, user_emp2_id, project_alpha_id, 'paused', now() - interval '4 hours', 'Designing dashboard widgets')
  ON CONFLICT (id) DO NOTHING;

  -- 7. Time Entries
  INSERT INTO public.time_entries (organization_id, session_id, user_id, project_id, entry_type, approval_status, started_at, ended_at, duration_seconds, description)
  VALUES
    (org_acme_id, session_emp1_id, user_emp1_id, project_alpha_id, 'automatic', 'pending', now() - interval '2 hours', NULL, 7200, 'Frontend architecture setup'),
    (org_acme_id, session_emp2_id, user_emp2_id, project_alpha_id, 'automatic', 'approved', now() - interval '4 hours', now() - interval '1 hour', 10800, 'Figma mockups and design token export')
  ON CONFLICT DO NOTHING;

  -- 8. Activity Events
  INSERT INTO public.activity_events (organization_id, session_id, user_id, event_type, payload, recorded_at)
  VALUES
    (org_acme_id, session_emp1_id, user_emp1_id, 'app_focus', '{"app": "VS Code", "title": "00001_initial_schema.sql"}'::jsonb, now() - interval '1 hour'),
    (org_acme_id, session_emp2_id, user_emp2_id, 'app_focus', '{"app": "Figma", "title": "Design System 2.0"}'::jsonb, now() - interval '2 hours')
  ON CONFLICT DO NOTHING;

END $$;
