// Area upgrade interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
  heatedFloor?: boolean;
}

// Area name mapping for display
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

// Material type display names
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  lvt: 'Premium LVT',
  carpet: 'Premium Carpet',
  tile: 'Porcelain Tile',
  nonstandard_lvp: 'Non Standard LVP Color',
  nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
  premium_carpet_underpad: 'Premium Underpad',
};

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BuyerSubmission {
  first_name: string;
  last_name: string;
  unit_number: string;
  unit_type: string | null;
  email: string;
  lvp_colour: string | null;
  spc_tile_colour: string | null;
  backsplash_orientation: string | null;
  bedroom_flooring_choice: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_lvp_colour: string | null;
  bedroom_lvp_same_as_main: boolean;
  has_stairs: boolean;
  stair_carpet_colour: string | null;
  stair_lvp_upgrade_selected?: boolean;
  additional_windows_qty: number;
  patio_doors_qty: number;
  area_upgrades?: AreaUpgrade[];
  upgrade_floor_selection?: string | null;
  backsplash_grout_enabled?: boolean;
  backsplash_grout_color?: string | null;
  heated_floor_bathrooms?: number;
  upgrade_interests: Record<string, boolean>;
}

/** `windowSubtotal` is the engine's pre-GST window figure (never the stale submit-time total column). */
export function generateEmailPreviewHtml(submission: BuyerSubmission, windowSubtotal: number): string {
  const firstName = submission.first_name;
  const lastName = submission.last_name;
  const unitNumber = submission.unit_number;
  const unitType = submission.unit_type;
  const lvpColour = submission.lvp_colour;
  const spcTileColour = submission.spc_tile_colour;
  const backsplashOrientation = submission.backsplash_orientation;
  const bedroomFlooringChoice = submission.bedroom_flooring_choice;
  const bedroomCarpetColour = submission.bedroom_carpet_colour;
  const bedroomLvpColour = submission.bedroom_lvp_colour;
  const bedroomLvpSameAsMain = submission.bedroom_lvp_same_as_main;
  const hasStairs = submission.has_stairs;
  const stairCarpetColour = submission.stair_carpet_colour;
  const additionalWindowsQty = submission.additional_windows_qty || 0;
  const patioDoorsQty = submission.patio_doors_qty || 0;
  const windowTotal = windowSubtotal;
  const areaUpgrades = submission.area_upgrades || [];
  const upgradeFloorSelection = submission.upgrade_floor_selection;
  const backsplashGroutEnabled = submission.backsplash_grout_enabled;
  const backsplashGroutColor = submission.backsplash_grout_color;
  const heatedFloorBathrooms = submission.heated_floor_bathrooms || 0;
  const upgradeInterests = submission.upgrade_interests || {};
  
  // Build standard selections
  const standardSelections: { label: string; value: string }[] = [];
  
  if (lvpColour) {
    standardSelections.push({ label: 'Main Floor LVP', value: lvpColour });
  }
  
  if (spcTileColour) {
    standardSelections.push({ label: 'Bathroom/Laundry Tile', value: spcTileColour });
  }
  
  if (backsplashOrientation) {
    standardSelections.push({ label: 'Kitchen Backsplash Orientation', value: backsplashOrientation });
  }
  
  if (bedroomFlooringChoice) {
    let bedroomValue = bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : 
                       bedroomFlooringChoice === 'carpet' ? 'Carpet' : bedroomFlooringChoice;
    if (bedroomFlooringChoice === 'carpet' && bedroomCarpetColour) {
      bedroomValue += ` - ${bedroomCarpetColour}`;
    } else if (bedroomFlooringChoice === 'lvp' && !bedroomLvpSameAsMain && bedroomLvpColour) {
      bedroomValue += ` - ${bedroomLvpColour}`;
    } else if (bedroomFlooringChoice === 'lvp' && bedroomLvpSameAsMain) {
      bedroomValue += ' (Same as Main Floor)';
    }
    standardSelections.push({ label: 'Bedroom Flooring', value: bedroomValue });
  }
  
  if (hasStairs) {
    if (submission.stair_lvp_upgrade_selected) {
      standardSelections.push({ label: 'Stair Flooring', value: 'LVP Upgrade with Custom Nosings ($2,160 + GST)' });
    } else if (stairCarpetColour) {
      standardSelections.push({ label: 'Stair Carpet', value: stairCarpetColour });
    }
  }

  const standardSelectionsHtml = standardSelections.length > 0 ? `
    <tr>
      <td style="background: #ffffff; padding: 0 40px 30px;">
        <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🏠 Your Standard Selections</h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          ${standardSelections.map(item => `
            <tr>
              <td style="padding: 14px 16px; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 14px; width: 40%;">${escapeHtml(item.label)}</td>
              <td style="padding: 14px 16px; border-bottom: 1px solid #f0f0f0; color: #1a1a2e; font-size: 14px; font-weight: 500;">
                ${escapeHtml(item.value)}
              </td>
            </tr>
          `).join('')}
        </table>
        <p style="margin: 12px 0 0; color: #666; font-size: 13px; text-align: center;">✓ Standard selections included with your home</p>
      </td>
    </tr>
  ` : '';

  // Window Coverings
  let windowCoveringsHtml = '';
  if (additionalWindowsQty > 0 || patioDoorsQty > 0) {
    const windowItems: { item: string; qty: number }[] = [];
    
    if (additionalWindowsQty > 0) {
      windowItems.push({ item: 'Additional Window Covering', qty: additionalWindowsQty });
    }
    if (patioDoorsQty > 0) {
      windowItems.push({ item: 'Patio Door Panel Track', qty: patioDoorsQty });
    }

    windowCoveringsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🪟 Window Covering Upgrades</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; overflow: hidden;">
            <tr style="background: #0369a1;">
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: left; font-weight: 600;">Item</th>
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: center; font-weight: 600;">Qty</th>
            </tr>
            ${windowItems.map(item => `
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid rgba(3,105,161,0.1); color: #0c4a6e; font-size: 14px;">${escapeHtml(item.item)}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid rgba(3,105,161,0.1); color: #0c4a6e; font-size: 14px; text-align: center; font-weight: 600;">${item.qty}</td>
              </tr>
            `).join('')}
            <tr style="background: #0369a1;">
              <td style="padding: 14px 16px; color: white; font-size: 15px; font-weight: 600;">Total (before GST)</td>
              <td style="padding: 14px 16px; color: #fbbf24; font-size: 18px; text-align: center; font-weight: 700;">$${windowTotal.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Area Upgrades
  let areaUpgradesHtml = '';
  if (areaUpgrades && areaUpgrades.length > 0) {
    const upgradeRows = areaUpgrades.map(upgrade => {
      const areaName = AREA_NAMES[upgrade.areaId] || upgrade.areaId;
      const materialName = MATERIAL_NAMES[upgrade.materialType] || upgrade.materialType;
      
      return `
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid rgba(147,51,234,0.1);">
            <div style="color: #581c87; font-size: 14px; font-weight: 600;">${escapeHtml(areaName)}</div>
            <div style="color: #7e22ce; font-size: 12px; margin-top: 2px;">${escapeHtml(materialName)}</div>
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid rgba(147,51,234,0.1);">
            <div style="color: #581c87; font-size: 14px;">${escapeHtml(upgrade.productName) || 'Standard'}</div>
            ${upgrade.productColor ? `<div style="color: #9333ea; font-size: 12px; margin-top: 2px;">Color: ${escapeHtml(upgrade.productColor)}</div>` : ''}
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid rgba(147,51,234,0.1); text-align: center;">
            ${upgrade.heatedFloor ? '<span style="background: #fbbf24; color: #78350f; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔥 HEATED</span>' : '<span style="color: #a1a1aa; font-size: 12px;">—</span>'}
          </td>
        </tr>
      `;
    }).join('');

    areaUpgradesHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">✨ Premium Area Upgrades</h2>
          ${upgradeFloorSelection ? `<p style="margin: 0 0 12px; color: #7e22ce; font-size: 14px; background: #faf5ff; padding: 10px 14px; border-radius: 6px;"><strong>Floor Selection:</strong> Floor ${escapeHtml(upgradeFloorSelection)}</p>` : ''}
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 12px; overflow: hidden;">
            <tr style="background: linear-gradient(135deg, #9333ea 0%, #7e22ce 100%);">
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: left; font-weight: 600;">Area</th>
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: left; font-weight: 600;">Product</th>
              <th style="padding: 12px 16px; color: white; font-size: 13px; text-align: center; font-weight: 600;">Heated</th>
            </tr>
            ${upgradeRows}
          </table>
          <p style="margin: 12px 0 0; color: #7e22ce; font-size: 13px; text-align: center;">💰 Pricing will be confirmed by our team</p>
        </td>
      </tr>
    `;
  }

  // Grout
  let groutHtml = '';
  if (backsplashGroutEnabled) {
    groutHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🎨 Custom Backsplash Grout</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 16px 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #92400e; font-size: 14px; padding: 8px 0;"><strong>Grout Color:</strong></td>
                    <td style="color: #78350f; font-size: 14px; font-weight: 600; padding: 8px 0;">${escapeHtml(backsplashGroutColor) || 'To be confirmed'}</td>
                  </tr>
                  <tr>
                    <td style="color: #92400e; font-size: 14px; padding: 8px 0;"><strong>Cost:</strong></td>
                    <td style="color: #78350f; font-size: 16px; font-weight: 700; padding: 8px 0;">$315.00 <span style="font-size: 12px; font-weight: 400;">(incl. GST)</span></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Heated Floors
  let heatedFloorsHtml = '';
  if (heatedFloorBathrooms > 0) {
    heatedFloorsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">🔥 Heated Tile Floors</h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%); border-radius: 12px;">
            <tr>
              <td style="padding: 20px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #991b1b; font-size: 14px;"><strong>Bathrooms with Heated Floors:</strong></td>
                    <td style="color: #7f1d1d; font-size: 20px; font-weight: 700; text-align: right;">${heatedFloorBathrooms} bathroom${heatedFloorBathrooms > 1 ? 's' : ''}</td>
                  </tr>
                </table>
                <p style="margin: 12px 0 0; color: #b91c1c; font-size: 13px; text-align: center;">💰 Pricing will be confirmed by our team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Upgrade Interests
  let upgradeInterestsHtml = '';
  const interests = Object.entries(upgradeInterests)
    .filter(([_, v]) => v)
    .map(([key]) => key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  
  if (interests.length > 0) {
    upgradeInterestsHtml = `
      <tr>
        <td style="background: #ffffff; padding: 0 40px 30px;">
          <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600;">💡 Additional Interests</h2>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px;">
            <p style="margin: 0; color: #166534; font-size: 14px;">You've expressed interest in learning more about:</p>
            <div style="margin-top: 12px;">
              ${interests.map(interest => `<span style="display: inline-block; background: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 6px; font-size: 13px; margin: 4px;">${escapeHtml(interest)}</span>`).join(' ')}
            </div>
            <p style="margin: 16px 0 0; color: #15803d; font-size: 13px;">Our team will reach out with more information about these options.</p>
          </div>
        </td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Updated Selection Confirmation - BMD Materials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; border-collapse: collapse;">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #2d463c 100%); padding: 30px 40px; border-radius: 16px 16px 0 0;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">BMD Materials</h1>
                    <p style="margin: 8px 0 0; color: #b4ac8c; font-size: 14px;">Premium Home Finishing Selections</p>
                  </td>
                  <td style="text-align: right;">
                    <span style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                      ✨ UPDATED
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Welcome Message -->
          <tr>
            <td style="background: #ffffff; padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 22px; font-weight: 600;">
                Updated Selection Confirmation
              </h2>
              <p style="margin: 0 0 20px; color: #666; font-size: 15px; line-height: 1.6;">
                Hello ${escapeHtml(firstName)}, this email confirms your updated selections for your home at Glendale Estates.
              </p>
              
              <!-- Unit Info Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="width: 50%;">
                          <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Unit Number</p>
                          <p style="margin: 4px 0 0; color: #1a1a2e; font-size: 24px; font-weight: 700;">${escapeHtml(unitNumber)}</p>
                        </td>
                        <td style="width: 50%;">
                          <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Unit Type</p>
                          <p style="margin: 4px 0 0; color: #1a1a2e; font-size: 18px; font-weight: 600;">${escapeHtml(unitType) || 'N/A'}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 16px;">
                          <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Buyer</p>
                          <p style="margin: 4px 0 0; color: #1a1a2e; font-size: 16px; font-weight: 600;">${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${standardSelectionsHtml}
          ${windowCoveringsHtml}
          ${areaUpgradesHtml}
          ${groutHtml}
          ${heatedFloorsHtml}
          ${upgradeInterestsHtml}

          <!-- Footer -->
          <tr>
            <td style="background: #1a1a2e; padding: 30px 40px; border-radius: 0 0 16px 16px; text-align: center;">
              <p style="margin: 0 0 8px; color: #b4ac8c; font-size: 14px; font-weight: 600;">BMD Materials</p>
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">Premium Home Finishing for Glendale Estates</p>
              <p style="margin: 16px 0 0; color: #71717a; font-size: 11px;">
                This is an automated confirmation email. Please do not reply directly to this message.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
