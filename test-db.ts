import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
async function run() {
  const { data: roles, error: rolesErr } = await supabase.from('user_roles').select('*').eq('role', 'worker');
  console.log('Roles:', roles, rolesErr);
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('id, name, lat, lng');
  console.log('Profiles:', profiles, profErr);
}
run();
