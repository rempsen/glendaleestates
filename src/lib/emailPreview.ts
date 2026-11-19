import { renderLinesEmailHtml, type EmailLines } from '@shared/linesEmailHtml';
// Area upgrade interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
  heatedFloor?: boolean;
}

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

/** Local fallback preview of the buyer email, rendered from the submission's quote lines. */
export function generateEmailPreviewHtml(submission: BuyerSubmission, quote: EmailLines): string {
  const firstName = submission.first_name;
  const lastName = submission.last_name;
  const unitNumber = submission.unit_number;
  const unitType = submission.unit_type;
  const upgradeInterests = submission.upgrade_interests || {};
  
  // Phase 2 Task 11: the quote block is the shared line renderer (buyer copy) — the same lines, columns and totals
  // as the PDF and the real buyer email. No prices are computed here.
  const linesHtml = `
    <tr>
      <td style="background: #ffffff; padding: 0 40px 30px;">
        ${renderLinesEmailHtml(quote.lines, { buyerView: true, gstRate: quote.gstRate, pricesAvailable: quote.pricesAvailable }).html}
      </td>
    </tr>`;

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

          ${linesHtml}
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
