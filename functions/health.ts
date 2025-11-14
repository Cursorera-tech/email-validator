export async function onRequestGet() {
  return new Response(
    JSON.stringify({ 
      status: 'ok', 
      message: 'Email validator server is running' 
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    }
  )
}

