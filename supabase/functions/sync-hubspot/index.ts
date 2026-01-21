import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";

interface AreaUpgradeSelection {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
  heatedFloor?: boolean;
}

interface BuyerSelection {
  id: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  estimated_possession_date: string | null;
  has_stairs: boolean | null;
  lvp_colour: string | null;
  lvp_comments: string | null;
  spc_tile_colour: string | null;
  spc_tile_comments: string | null;
  backsplash_orientation: string | null;
  bedroom_flooring_choice: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_lvp_colour: string | null;
  bedroom_lvp_same_as_main: boolean | null;
  stair_carpet_colour: string | null;
  additional_windows_qty: number;
  patio_doors_qty: number;
  window_total: number;
  window_comments: string | null;
  hardwood_upgrade_selected: boolean;
  bathroom_tile_selected: boolean;
  heated_floor_bathrooms: number;
  backsplash_grout_enabled: boolean;
  backsplash_grout_color: string | null;
  backsplash_grout_comments: string | null;
  area_upgrades: AreaUpgradeSelection[] | null;
  upgrade_floor_selection: string | null;
  upgrade_interests: Record<string, boolean> | null;
  sales_comments: string | null;
  status: string;
  created_at: string;
  pdf_base64?: string;
}

// Material type display names
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  carpet: 'Premium Carpet',
  tile: 'Porcelain Tile',
};

// Area display names
const AREA_NAMES: Record<string, string> = {
  mainLiving: 'Main Living Area',
  secondBedroom: 'Second Bedroom',
  masterBedroom: 'Master Bedroom',
  secondBedroomCarpet: 'Second Bedroom Carpet',
  guestBathroom: 'Guest Bathroom',
  masterEnsuite: 'Master Ensuite',
  laundry: 'Laundry Room',
  backsplash: 'Kitchen Backsplash',
  allLvp: 'Entire Unit LVP',
};

// Format area upgrades for HubSpot display
function formatAreaUpgrades(upgrades: AreaUpgradeSelection[] | null): string {
  if (!upgrades || upgrades.length === 0) return 'None selected';
  
  return upgrades.map(u => {
    const areaName = AREA_NAMES[u.areaId] || u.areaId;
    const materialName = MATERIAL_NAMES[u.materialType] || u.materialType;
    let line = `${areaName}: ${materialName}`;
    if (u.productName) line += ` - ${u.productName}`;
    if (u.productColor) line += ` (${u.productColor})`;
    if (u.heatedFloor) line += ' [Heated Floor]';
    return line;
  }).join('; ');
}

// Format upgrade interests for HubSpot display
function formatUpgradeInterests(interests: Record<string, boolean> | null): string {
  if (!interests) return 'None';
  
  const selected = Object.entries(interests)
    .filter(([_, value]) => value)
    .map(([key, _]) => key.replace(/([A-Z])/g, ' $1').trim());
  
  return selected.length > 0 ? selected.join(', ') : 'None';
}

// Upload PDF to HubSpot Files and return URL
async function uploadPdfToHubSpot(pdfBase64: string, fileName: string, hubspotApiKey: string): Promise<string | null> {
  try {
    console.log('Uploading PDF to HubSpot Files...');
    
    // Decode base64 to binary
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create form data for file upload
    const formData = new FormData();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    formData.append('file', blob, fileName);
    formData.append('options', JSON.stringify({
      access: 'PUBLIC_NOT_INDEXABLE',
      overwrite: true,
    }));
    formData.append('folderPath', '/BMD-Submissions');

    const uploadResponse = await fetch(
      'https://api.hubapi.com/files/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hubspotApiKey}`,
        },
        body: formData,
      }
    );

    if (uploadResponse.ok) {
      const result = await uploadResponse.json();
      console.log('PDF uploaded successfully:', result.url);
      return result.url;
    } else {
      const errorText = await uploadResponse.text();
      console.error('PDF upload failed:', errorText);
      return null;
    }
  } catch (error) {
    console.error('Error uploading PDF:', error);
    return null;
  }
}

Deno.serve(async (req) => {
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

    // Upload PDF if provided
    let pdfUrl: string | null = null;
    if (submission.pdf_base64) {
      const fileName = `BMD-Selection-${submission.unit_number}-${submission.last_name}-${new Date().toISOString().split('T')[0]}.pdf`;
      pdfUrl = await uploadPdfToHubSpot(submission.pdf_base64, fileName, hubspotApiKey);
    }

    // Search for existing contact by email
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
        console.log('Found existing HubSpot contact:', existingContactId);
      } else if (lookupResponse.status === 404) {
        console.log('No existing contact found for email:', submission.email);
      } else {
        const lookupError = await lookupResponse.text();
        console.log('Email lookup returned status', lookupResponse.status, ':', lookupError);
      }
    } catch (lookupErr) {
      console.log('Email lookup error (will try to create):', lookupErr);
    }

    // Prepare contact properties - ALL fields
    const contactProperties: Record<string, string> = {
      email: submission.email,
      firstname: submission.first_name,
      lastname: submission.last_name,
      phone: submission.phone_number || '',
      // Mark as Glendale Estates Buyer
      glendale_estates_buyer: 'Yes',
      // BMD custom properties
      bmd_unit_number: submission.unit_number,
      bmd_unit_type: submission.unit_type || '',
      bmd_has_stairs: submission.has_stairs ? 'yes' : 'no',
      bmd_lvp_selection: submission.lvp_colour || '',
      bmd_lvp_comments: submission.lvp_comments || '',
      bmd_bathroom_tile: submission.spc_tile_colour || '',
      bmd_bathroom_tile_comments: submission.spc_tile_comments || '',
      bmd_backsplash: submission.backsplash_orientation || '',
      bmd_bedroom_flooring: submission.bedroom_flooring_choice || '',
      bmd_bedroom_carpet: submission.bedroom_carpet_colour || '',
      bmd_bedroom_lvp: submission.bedroom_lvp_colour || '',
      bmd_bedroom_lvp_same_as_main: submission.bedroom_lvp_same_as_main ? 'yes' : 'no',
      bmd_stair_carpet: submission.stair_carpet_colour || '',
      bmd_additional_windows: String(submission.additional_windows_qty || 0),
      bmd_patio_doors: String(submission.patio_doors_qty || 0),
      bmd_window_total: String(submission.window_total || 0),
      bmd_window_comments: submission.window_comments || '',
      bmd_hardwood_upgrade: submission.hardwood_upgrade_selected ? 'Yes' : 'No',
      bmd_tile_upgrade: submission.bathroom_tile_selected ? 'Yes' : 'No',
      bmd_heated_floor_bathrooms: String(submission.heated_floor_bathrooms || 0),
      bmd_backsplash_grout: submission.backsplash_grout_enabled ? (submission.backsplash_grout_color || 'Custom') : '',
      bmd_backsplash_grout_comments: submission.backsplash_grout_comments || '',
      bmd_area_upgrades: formatAreaUpgrades(submission.area_upgrades),
      bmd_upgrade_floor_selection: submission.upgrade_floor_selection || '',
      bmd_upgrade_interests: formatUpgradeInterests(submission.upgrade_interests),
      bmd_sales_comments: submission.sales_comments || '',
      bmd_submission_status: submission.status,
    };

    // Add possession date if provided
    if (submission.estimated_possession_date) {
      contactProperties.bmd_possession_date = submission.estimated_possession_date;
    }

    // Add submission date
    if (submission.created_at) {
      contactProperties.bmd_submission_date = String(new Date(submission.created_at).getTime());
    }

    // Add PDF URL if uploaded
    if (pdfUrl) {
      contactProperties.bmd_pdf_url = pdfUrl;
    }

    let hubspotResponse;
    let contactId: string | null = existingContactId;

    if (existingContactId) {
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
      
      // Handle CONFLICT error
      if (errorData.category === 'CONFLICT' && errorData.message?.includes('Existing ID:')) {
        const match = errorData.message.match(/Existing ID:\s*(\d+)/);
        if (match && match[1]) {
          contactId = match[1];
          console.log('Contact exists, updating with ID:', contactId);
          
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
            throw new Error(`HubSpot API error: ${JSON.stringify(updateError)}`);
          }
        } else {
          throw new Error(`HubSpot API error: ${JSON.stringify(errorData)}`);
        }
      } else if (errorData.message?.includes('property') || errorData.category === 'VALIDATION_ERROR') {
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
    const finalContactId = result.id;
    console.log('HubSpot sync successful:', finalContactId, pdfUrl ? '(with PDF)' : '');

    // Set contact as Marketing Contact
    try {
      console.log('Setting contact as Marketing Contact...');
      const marketingResponse = await fetch(
        'https://api.hubapi.com/marketing/v3/marketing-events-beta/attendance/subscriber-state/email-upsert',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hubspotApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: [{
              email: submission.email,
              marketingContactStatus: 'set_marketing'
            }]
          }),
        }
      );
      
      if (!marketingResponse.ok) {
        // Try alternate endpoint for marketing contacts
        const marketingResponse2 = await fetch(
          'https://api.hubapi.com/crm/v3/objects/contacts/batch/update',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${hubspotApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inputs: [{
                id: finalContactId,
                properties: {
                  hs_marketable_status: 'true',
                  hs_marketable_reason_id: 'FORM_SUBMISSION',
                  hs_marketable_reason_type: 'FORM_SUBMISSION'
                }
              }]
            }),
          }
        );
        
        if (marketingResponse2.ok) {
          console.log('Contact set as marketing contact via batch update');
        } else {
          console.log('Marketing contact setting skipped - may need Marketing Hub subscription');
        }
      } else {
        console.log('Contact set as Marketing Contact');
      }
    } catch (marketingErr) {
      console.log('Marketing contact setting error (non-fatal):', marketingErr);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        contactId: finalContactId,
        action: contactId ? 'updated' : 'created',
        pdfUrl: pdfUrl || null,
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
