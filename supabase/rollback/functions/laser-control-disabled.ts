import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export default {
  fetch(){
    return Response.json(
      {error:"laser_control_rolled_back"},
      {
        status:410,
        headers:{
          "Cache-Control":"no-store, max-age=0",
          "X-Content-Type-Options":"nosniff"
        }
      }
    );
  }
};
