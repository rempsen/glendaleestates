// Lists QBO Accounts and TaxCodes for the Settings UI dropdowns.
// Admin-only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ensureFreshToken, getActiveConnection, qboQuery } from '../_shared/qboClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabase
      .from('user_roles').select('role')
      .eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let conn = await getActiveConnection(admin);
    conn = await ensureFreshToken(admin, conn);

    const [incomeRes, arRes, depRes, taxRes] = await Promise.all([
      qboQuery(conn, "SELECT Id, Name, AccountType, AccountSubType FROM Account WHERE AccountType = 'Income' MAXRESULTS 200"),
      qboQuery(conn, "SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Accounts Receivable' MAXRESULTS 50"),
      qboQuery(conn, "SELECT Id, Name, AccountType, AccountSubType FROM Account WHERE AccountType IN ('Other Current Asset','Bank') MAXRESULTS 200"),
      qboQuery(conn, "SELECT Id, Name, Description FROM TaxCode MAXRESULTS 200"),
    ]);

    return new Response(JSON.stringify({
      income_accounts: incomeRes.Account ?? [],
      ar_accounts: arRes.Account ?? [],
      deposit_accounts: depRes.Account ?? [],
      tax_codes: taxRes.TaxCode ?? [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('qbo-list-accounts error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
