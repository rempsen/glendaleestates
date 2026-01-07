import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BuyerSelection {
  id: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  estimated_possession_date: string | null;
  lvp_colour: string | null;
  spc_tile_colour: string | null;
  backsplash_orientation: string | null;
  bedroom_flooring_choice: string | null;
  additional_windows_qty: number;
  patio_doors_qty: number;
  window_total: number;
  status: string;
  created_at: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const hubspotApiKey = Deno.env.get('HUBSPOT_API_KEY');
  
  if (!hubspotApiKey) {
    console.error('HUBSPOT_API_KEY is not configured');
    return new Response(
      JSON.stringify({ error: 'HubSpot API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const submission: BuyerSelection = await req.json();
    console.log('Syncing submission to HubSpot:', submission.email);

    // First, search for existing contact by email
    const searchResponse = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hubspotApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: submission.email,
            }],
          }],
        }),
      }
    );

    const searchData = await searchResponse.json();
    console.log('HubSpot search result:', JSON.stringify(searchData));

    // Prepare contact properties
    const contactProperties = {
      email: submission.email,
      firstname: submission.first_name,
      lastname: submission.last_name,
      phone: submission.phone_number || '',
      // Custom properties - these should be created in HubSpot first
      unit_number: submission.unit_number,
      unit_type: submission.unit_type || '',
      possession_date: submission.estimated_possession_date || '',
      lvp_selection: submission.lvp_colour || '',
      bathroom_tile: submission.spc_tile_colour || '',
      backsplash: submission.backsplash_orientation || '',
      bedroom_flooring: submission.bedroom_flooring_choice || '',
      additional_windows: String(submission.additional_windows_qty || 0),
      patio_doors: String(submission.patio_doors_qty || 0),
      window_total: String(submission.window_total || 0),
      submission_status: submission.status,
      submission_date: submission.created_at,
    };

    let hubspotResponse;
    let contactId: string | null = null;

    if (searchData.total > 0) {
      // Update existing contact
      contactId = searchData.results[0].id;
      console.log('Updating existing HubSpot contact:', contactId);
      
      hubspotResponse = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${hubspotApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: contactProperties }),
        }
      );
    } else {
      // Create new contact
      console.log('Creating new HubSpot contact');
      
      hubspotResponse = await fetch(
        'https://api.hubapi.com/crm/v3/objects/contacts',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hubspotApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: contactProperties }),
        }
      );
    }

    if (!hubspotResponse.ok) {
      const errorData = await hubspotResponse.json();
      console.error('HubSpot API error:', JSON.stringify(errorData));
      
      // If custom properties don't exist, try with just basic properties
      if (errorData.message?.includes('property') || errorData.category === 'VALIDATION_ERROR') {
        console.log('Retrying with basic properties only');
        
        const basicProperties = {
          email: submission.email,
          firstname: submission.first_name,
          lastname: submission.last_name,
          phone: submission.phone_number || '',
        };

        const retryUrl = contactId 
          ? `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`
          : 'https://api.hubapi.com/crm/v3/objects/contacts';
        
        hubspotResponse = await fetch(retryUrl, {
          method: contactId ? 'PATCH' : 'POST',
          headers: {
            'Authorization': `Bearer ${hubspotApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: basicProperties }),
        });

        if (!hubspotResponse.ok) {
          const retryError = await hubspotResponse.json();
          throw new Error(`HubSpot API error: ${JSON.stringify(retryError)}`);
        }
      } else {
        throw new Error(`HubSpot API error: ${JSON.stringify(errorData)}`);
      }
    }

    const result = await hubspotResponse.json();
    console.log('HubSpot sync successful:', result.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        contactId: result.id,
        action: contactId ? 'updated' : 'created'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error syncing to HubSpot:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
