export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID, X-Admin-Password',
  'Access-Control-Max-Age': '86400'
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  })
}

export function successResponse(data) {
  return jsonResponse({
    success: true,
    data
  })
}

export function errorResponse(message, status = 400) {
  return jsonResponse({
    success: false,
    error: message
  }, status)
}

