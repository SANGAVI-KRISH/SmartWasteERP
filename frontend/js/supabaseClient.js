import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://bjxhqocyjztullmkhqpm.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqeGhxb2N5anp0dWxsbWtocXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MDk2NzcsImV4cCI6MjA4NjQ4NTY3N30.JsLJBarQPG8MWLBOE-C4Z2Jr-ibahaBMNHl2QqnCwm8"
);
