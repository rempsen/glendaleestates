// Admin-only: AI summary of a buyer's upgrade requests and recent changes
// (incl. lower-level stair carpet/underpad add-ons) for quick staff review.
import { generateResponse, GatewayError } from 'npm:@lovable.dev/ai-gateway@0.1.13';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const rest = async (path: string) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
  if (!r.ok) throw new Error(`DB ${r.status}`);
  return r.json();
};

// Only selection/pricing fields go to the model — no admin/sales notes.
const FIELDS = [
  'unit_number', 'unit_type', 'status', 'created_at', 'updated_at', 'has_stairs', 'lvp_colour', 'spc_tile_colour',
  'backsplash_orientation', 'backsplash_grout_enabled', 'backsplash_grout_color', 'stair_upgrade_type',
  'stair_lvp_upgrade_selected', 'stair_premium_carpet_selected', 'premium_underpad_stairs', 'stair_carpet_colour',
  'bedroom_flooring_choice', 'bedroom_carpet_colour', 'premium_carpet_bedroom', 'premium_underpad_bedroom',
  'additional_windows_qty', 'patio_doors_qty', 'automated_windows_qty', 'bathroom_tile_selected',
  'heated_floor_bathrooms', 'custom_tiled_shower', 'hardwood_upgrade_selected', 'area_upgrades', 'custom_pricing',
  'upgrade_interests', 'upgrade_comments', 'upgrade_interests_notes', 'lvp_comments', 'spc_tile_comments', 'window_comments',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SRK, Authorization: auth } });
    if (!u.ok) return json({ error: 'Unauthorized' }, 401);
    const user = await u.json();
    const roles = await rest(`user_roles?select=role&user_id=eq.${user.id}&role=eq.admin`);
    if (!roles.length) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.submissionId === 'string' ? body.submissionId : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'submissionId is required' }, 400);

    const [rows, logs] = await Promise.all([
      rest(`buyer_selections?select=${FIELDS.join(',')}&id=eq.${id}`),
      rest(`submission_audit_logs?select=created_at,changed_by_email,change_summary,changes&submission_id=eq.${id}&order=created_at.desc&limit=25`),
    ]);
    if (!rows.length) return json({ error: 'Not found' }, 404);

    const prompt = `You help condo finishing staff review buyer upgrade requests.
Summarize for staff in plain, concise English (no emojis):
1. "New / recent requests" — changes from the change log, newest first, with dates. Clearly call out any buyer-added lower-level stair carpet or underpad upgrade (stairs from main level to basement/lower level).
2. "Current upgrades" — short bullet list of every upgrade currently selected (flooring area upgrades with product/colour, bathroom, shower, heated floors, backsplash/grout, stairs, window coverings, office custom line items and office prices).
3. "Needs staff attention" — anything unclear, conflicting, missing a colour, or mentioned only in comments.
Do not invent prices; only mention prices that appear in the data (office prices are GST-exclusive). Use short bullets under each heading.

SELECTION RECORD:
${JSON.stringify(rows[0])}

CHANGE LOG (newest first):
${JSON.stringify(logs)}`;

    const res = await generateResponse({
      model: 'openai/gpt-6-astra',
      input: prompt,
      reasoning: { effort: 'low' },
    });
    // deno-lint-ignore no-explicit-any
    const r = res as any;
    let text: string = r.output_text || '';
    if (!text && Array.isArray(r.output)) {
      for (const item of r.output) for (const c of item?.content || []) if (c?.type === 'output_text') text += c.text;
    }
    return json({ summary: text.trim(), generatedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof GatewayError) {
      const status = e.httpStatus === 429 ? 429 : e.httpStatus === 402 ? 402 : 502;
      const msg = status === 429 ? 'AI is busy right now, please try again shortly.'
        : status === 402 ? 'AI credits are used up for this workspace.' : 'AI summary failed.';
      console.error('gateway error', e.code, e.ids);
      return json({ error: msg }, status);
    }
    console.error(e);
    return json({ error: 'Could not build summary' }, 500);
  }
});
