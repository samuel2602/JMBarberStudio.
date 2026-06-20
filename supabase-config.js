const SUPABASE_URL = "https://nkmrggngghqkabakwzqz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JN7H7sZnkjbWLQLJLx892g_cH4FvFri";

window.BARBER_CREDENTIALS = {
  phone: "",
  password: ""
};

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
