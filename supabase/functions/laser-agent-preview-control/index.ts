import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(()=>Response.json(
  {error:"touch_control_retired"},
  {status:410,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}
));
