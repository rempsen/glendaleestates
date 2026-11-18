import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";

// Define all custom properties needed for BMD Materials sync
const customProperties = [
  {
    name: "bmd_unit_number",
    label: "Unit Number",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "The unit number for the buyer's property"
  },
  {
    name: "bmd_unit_type",
    label: "Unit Type",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "The type of unit (e.g., A, B, C)"
  },
  {
    name: "bmd_possession_date",
    label: "Possession Date",
    type: "date",
    fieldType: "date",
    groupName: "contactinformation",
    description: "Estimated possession date"
  },
  {
    name: "bmd_has_stairs",
    label: "Has Stairs",
    type: "enumeration",
    fieldType: "select",
    groupName: "contactinformation",
    description: "Whether the unit has stairs",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" }
    ]
  },
  {
    name: "bmd_lvp_selection",
    label: "LVP Flooring Selection",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Main floor luxury vinyl plank colour selection"
  },
  {
    name: "bmd_lvp_comments",
    label: "LVP Flooring Comments",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Comments about LVP flooring selection"
  },
  {
    name: "bmd_bathroom_tile",
    label: "Bathroom Tile Selection",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Bathroom SPC tile colour selection"
  },
  {
    name: "bmd_bathroom_tile_comments",
    label: "Bathroom Tile Comments",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Comments about bathroom tile selection"
  },
  {
    name: "bmd_backsplash",
    label: "Backsplash Orientation",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Kitchen backsplash orientation"
  },
  {
    name: "bmd_bedroom_flooring",
    label: "Bedroom Flooring Choice",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Bedroom flooring selection (carpet or LVP)"
  },
  {
    name: "bmd_bedroom_carpet",
    label: "Bedroom Carpet Colour",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Bedroom carpet colour selection"
  },
  {
    name: "bmd_bedroom_lvp",
    label: "Bedroom LVP Colour",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Bedroom LVP colour selection"
  },
  {
    name: "bmd_bedroom_lvp_same_as_main",
    label: "Bedroom LVP Same As Main",
    type: "enumeration",
    fieldType: "select",
    groupName: "contactinformation",
    description: "Whether bedroom LVP is same colour as main floor",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" }
    ]
  },
  {
    name: "bmd_stair_carpet",
    label: "Stair Carpet Colour",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Stair carpet colour selection"
  },
  {
    name: "bmd_additional_windows",
    label: "Additional Windows Qty",
    type: "number",
    fieldType: "number",
    groupName: "contactinformation",
    description: "Number of additional window coverings requested"
  },
  {
    name: "bmd_patio_doors",
    label: "Patio Doors Qty",
    type: "number",
    fieldType: "number",
    groupName: "contactinformation",
    description: "Number of patio door coverings requested"
  },
  {
    name: "bmd_window_total",
    label: "Window Coverings Total",
    type: "number",
    fieldType: "number",
    groupName: "contactinformation",
    description: "Window covering add-ons subtotal (before GST)"
  },
  {
    name: "bmd_window_comments",
    label: "Window Coverings Comments",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Comments about window covering selections"
  },
  {
    name: "bmd_submission_status",
    label: "Submission Status",
    type: "enumeration",
    fieldType: "select",
    groupName: "contactinformation",
    description: "Status of the buyer's selection submission",
    options: [
      { label: "Submitted", value: "submitted" },
      { label: "Reviewed", value: "reviewed" },
      { label: "Completed", value: "completed" },
      { label: "Draft", value: "draft" }
    ]
  },
  {
    name: "bmd_submission_date",
    label: "Submission Date",
    type: "datetime",
    fieldType: "date",
    groupName: "contactinformation",
    description: "Date when the selection was submitted"
  },
  {
    name: "bmd_hardwood_upgrade",
    label: "Hardwood Upgrade",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Whether buyer selected hardwood flooring upgrade (Yes/No)"
  },
  {
    name: "bmd_tile_upgrade",
    label: "Porcelain Tile Upgrade",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Whether buyer selected porcelain tile upgrade (Yes/No)"
  },
  {
    name: "bmd_heated_floor_bathrooms",
    label: "Heated Floor Bathrooms",
    type: "number",
    fieldType: "number",
    groupName: "contactinformation",
    description: "Number of bathrooms with heated floor upgrade"
  },
  {
    name: "bmd_area_upgrades",
    label: "Area Upgrades Summary",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Summary of room-by-room upgrade selections"
  },
  {
    name: "bmd_upgrade_floor_selection",
    label: "Upgrade Floor Selection",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Which floor was selected for upgrades (1 or 2)"
  },
  {
    name: "bmd_upgrade_interests",
    label: "Upgrade Interests",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Additional upgrade interests and notes from buyer"
  },
  {
    name: "bmd_backsplash_grout",
    label: "Backsplash Grout Color",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Custom backsplash grout color selection"
  },
  {
    name: "bmd_backsplash_grout_comments",
    label: "Backsplash Grout Comments",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Comments about backsplash grout selection"
  },
  {
    name: "bmd_sales_comments",
    label: "Sales Comments",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Admin/sales comments on the submission"
  },
  {
    name: "bmd_upgrade_comments",
    label: "Upgrade Pricing Summary Comments",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Buyer comments from the Upgrade Pricing Summary step"
  },
  {
    name: "bmd_upgrade_interests_notes",
    label: "Upgrade Interests Notes",
    type: "string",
    fieldType: "textarea",
    groupName: "contactinformation",
    description: "Buyer notes from the Upgrade Interests step"
  },
  {
    name: "bmd_pdf_url",
    label: "Submission PDF URL",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "URL to the submission PDF document in HubSpot Files"
  },
  {
    name: "glendale_estates_buyer",
    label: "Glendale Estates Buyer",
    type: "enumeration",
    fieldType: "select",
    groupName: "contactinformation",
    description: "Whether this contact is a Glendale Estates buyer",
    options: [
      { label: "Yes", value: "Yes" },
      { label: "No", value: "No" }
    ]
  }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const hubspotApiKey = Deno.env.get('HUBSPOT_API_KEY');
  
  if (!hubspotApiKey) {
    return new Response(
      JSON.stringify({ error: 'HUBSPOT_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const results: { property: string; status: string; error?: string }[] = [];

  for (const prop of customProperties) {
    try {
      console.log(`Creating property: ${prop.name}`);
      
      const body: Record<string, unknown> = {
        name: prop.name,
        label: prop.label,
        type: prop.type,
        fieldType: prop.fieldType,
        groupName: prop.groupName,
        description: prop.description,
      };

      // Add options for enumeration type
      if (prop.type === 'enumeration' && prop.options) {
        body.options = prop.options;
      }

      const response = await fetch(
        'https://api.hubapi.com/crm/v3/properties/contacts',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hubspotApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (response.ok) {
        results.push({ property: prop.name, status: 'created' });
        console.log(`Created property: ${prop.name}`);
      } else {
        const errorData = await response.json();
        
        // Property might already exist
        if (errorData.category === 'CONFLICT' || errorData.message?.includes('already exists')) {
          results.push({ property: prop.name, status: 'already_exists' });
          console.log(`Property already exists: ${prop.name}`);
        } else {
          results.push({ 
            property: prop.name, 
            status: 'error', 
            error: errorData.message || JSON.stringify(errorData)
          });
          console.error(`Error creating ${prop.name}:`, errorData);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({ property: prop.name, status: 'error', error: errorMessage });
      console.error(`Exception creating ${prop.name}:`, error);
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const existing = results.filter(r => r.status === 'already_exists').length;
  const errors = results.filter(r => r.status === 'error').length;

  return new Response(
    JSON.stringify({ 
      success: true,
      summary: {
        created,
        already_exists: existing,
        errors
      },
      details: results 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
