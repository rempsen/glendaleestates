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
  hardwood_upgrade_selected: boolean;
  bathroom_tile_selected: boolean;
  heated_floor_bathrooms: number;
  status: string;
  created_at: string;
}

Deno.serve(async (req) => {
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
    // Use HubSpot's idProperty search to find existing contact by email
    // This is more reliable than the search endpoint for recently created contacts
    let existingContactId: string | null = null;
    
    try {
      const lookupResponse = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(submission.email)}?idProperty=email`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${hubspotApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (lookupResponse.ok) {
        const existingContact = await lookupResponse.json();
        existingContactId = existingContact.id;
        console.log('Found existing HubSpot contact by email lookup:', existingContactId);
      } else if (lookupResponse.status === 404) {
        console.log('No existing contact found for email:', submission.email);
      } else {
        const lookupError = await lookupResponse.text();
        console.log('Email lookup returned status', lookupResponse.status, ':', lookupError);
      }
    } catch (lookupErr) {
      console.log('Email lookup error (will try to create):', lookupErr);
    }

    // Prepare contact properties using BMD custom field names
    const contactProperties: Record<string, string> = {
      email: submission.email,
      firstname: submission.first_name,
      lastname: submission.last_name,
      phone: submission.phone_number || '',
      // BMD custom properties (created via setup-hubspot-properties function)
      bmd_unit_number: submission.unit_number,
      bmd_unit_type: submission.unit_type || '',
      bmd_lvp_selection: submission.lvp_colour || '',
      bmd_bathroom_tile: submission.spc_tile_colour || '',
      bmd_backsplash: submission.backsplash_orientation || '',
      bmd_bedroom_flooring: submission.bedroom_flooring_choice || '',
      bmd_additional_windows: String(submission.additional_windows_qty || 0),
      bmd_patio_doors: String(submission.patio_doors_qty || 0),
      bmd_window_total: String(submission.window_total || 0),
      bmd_hardwood_upgrade: submission.hardwood_upgrade_selected ? 'Yes' : 'No',
      bmd_tile_upgrade: submission.bathroom_tile_selected ? 'Yes' : 'No',
      bmd_heated_floor_bathrooms: String(submission.heated_floor_bathrooms || 0),
      bmd_submission_status: submission.status,
    };

    // Add possession date if provided (needs special formatting for HubSpot date field)
    if (submission.estimated_possession_date) {
      contactProperties.bmd_possession_date = submission.estimated_possession_date;
    }

    // Add submission date (convert to Unix timestamp in milliseconds for HubSpot)
    if (submission.created_at) {
      contactProperties.bmd_submission_date = String(new Date(submission.created_at).getTime());
    }

    let hubspotResponse;
    let contactId: string | null = existingContactId;

    if (existingContactId) {
      // Update existing contact
      console.log('Updating existing HubSpot contact:', existingContactId);
      
      hubspotResponse = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${existingContactId}`,
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
      
      // Handle CONFLICT error - contact already exists, extract ID and update
      if (errorData.category === 'CONFLICT' && errorData.message?.includes('Existing ID:')) {
        const match = errorData.message.match(/Existing ID:\s*(\d+)/);
        if (match && match[1]) {
          contactId = match[1];
          console.log('Contact exists, updating with ID:', contactId);
          
          // Retry as an update
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
          
          if (!hubspotResponse.ok) {
            const updateError = await hubspotResponse.json();
            console.error('Update after conflict failed:', JSON.stringify(updateError));
            
            // If update fails due to property issues, try with basic properties
            if (updateError.message?.includes('property') || updateError.category === 'VALIDATION_ERROR') {
              console.log('Retrying update with basic properties only');
              const basicProperties = {
                email: submission.email,
                firstname: submission.first_name,
                lastname: submission.last_name,
                phone: submission.phone_number || '',
              };
              
              hubspotResponse = await fetch(
                `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Authorization': `Bearer ${hubspotApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ properties: basicProperties }),
                }
              );
              
              if (!hubspotResponse.ok) {
                const retryError = await hubspotResponse.json();
                throw new Error(`HubSpot API error: ${JSON.stringify(retryError)}`);
              }
            } else {
              throw new Error(`HubSpot API error: ${JSON.stringify(updateError)}`);
            }
          }
        } else {
          throw new Error(`HubSpot API error: ${JSON.stringify(errorData)}`);
        }
      }
      // If custom properties don't exist, try with just basic properties
      else if (errorData.message?.includes('property') || errorData.category === 'VALIDATION_ERROR') {
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