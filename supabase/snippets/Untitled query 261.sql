update auth.users
set encrypted_password = crypt('1111', gen_salt('bf'))
where email = 'aion@test.com';