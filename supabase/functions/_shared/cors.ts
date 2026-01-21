// Shared CORS configuration for edge functions
// Restricts CORS to application domains only

const ALLOWED_ORIGINS = [
  'https://glendaleestates.lovable.app',
  'https://id-preview--451d344e-78b6-4641-b6ef-cc909ef041ed.lovable.app',
  // Allow all lovable.app preview subdomains
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  
  // Check if origin is allowed
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || 
    origin.endsWith('.lovable.app') ||
    origin.includes('localhost');
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// For backwards compatibility - static headers for internal/cron calls
export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://glendaleestates.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
