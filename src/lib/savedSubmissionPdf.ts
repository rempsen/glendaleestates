import { internalAreaNotes } from '@/lib/areaNotes';
import { supabase } from '@/integrations/supabase/client';
import { generateBuyerPreviewPDF, type PdfPricingConfig } from '@/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '@/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';

// `staff` adds the internal Office Record (notes, status, submitted date) for admin downloads only.
// Buyer-facing paths (email, preview) must leave it false.
export async function loadSavedSubmissionContext(id: string) {
  // Re-read the complete saved row and live prices, not a stale table snapshot.
  const [submission, configs, materials, areas] = await Promise.all([
    supabase.from('buyer_selections').select('*').eq('id', id).single(),
    supabase.from('pricing_config').select('*'),
    supabase.from('upgrade_materials').select('*').eq('is_active', true),
    supabase.from('unit_area_data').select('*'),
  ]);
  for (const result of [submission, configs, materials, areas]) {
    if (result.error) throw result.error;
  }
  if (!submission.data || !configs.data || !materials.data || !areas.data) throw new Error('Unable to load saved selections and pricing');
  const configRows = configs.data;
  const materialRows = materials.data;
  const areaRows = areas.data;
  const fee = (key: string) => {
    const row = configRows.find(c => c.config_key === key);
    if (!row) throw new Error(`Missing pricing setting: ${key}`);
    return row.is_active ? Number(row.config_value) : 0;
  };
  const pricing: PdfPricingConfig = {
    markupPercentage: fee('markup_percentage') / 100, gstRate: fee('gst_rate') / 100,
    getMaterialCost: key => Number(materialRows.find(m => m.material_key === key)?.cost_per_unit || 0),
    getGroutColorFee: () => fee('grout_color_change_price'),
    getAdditionalWindowPrice: () => fee('additional_window_price'),
    getPatioDoorPrice: () => fee('patio_door_price'),
    getAutomatedMotorPrice: () => fee('automated_motor_price'),
    getHeatedFloorPrice: () => fee('heated_floor_per_bathroom'),
    getStairLvpUpgradePrice: () => fee('stair_lvp_upgrade_price'),
    getStairPremiumLvpUpgradePrice: () => fee('stair_premium_lvp_upgrade_price'),
    getStairCarpetUpgradePrice: () => fee('premium_carpet_stairs_price'),
    getStairUnderpadUpgradePrice: () => fee('premium_underpad_stairs_price'),
    getUnitAreaData: code => {
      const row = areaRows.find(a => a.unit_type_code.toUpperCase() === code.toUpperCase());
      if (!row) return null;
      return { allLvp: Number(row.all_lvp), mainLiving: Number(row.main_living), secondBedroom: Number(row.second_bedroom),
        masterBedroomLvp: Number(row.master_bedroom_lvp), masterBedroom: Number(row.master_bedroom),
        secondBedroomCarpet: Number(row.second_bedroom_carpet), guestBathroom: Number(row.guest_bathroom),
        masterEnsuite: Number(row.master_ensuite), laundry: Number(row.laundry), backsplash: Number(row.backsplash) };
    },
  };
  return { s: submission.data, pricing, unitCode: submission.data.unit_type ? normalizeUnitTypeCode(submission.data.unit_type) : null };
}

export async function generateSavedSubmissionPdf(id: string, saveToFile = false, staff = false): Promise<string> {
  const { s, pricing } = await loadSavedSubmissionContext(id);
  const result = await generateBuyerPreviewPDF(toBuyerPdfSelections(s), s.unit_type ? normalizeUnitTypeCode(s.unit_type) : null,
    pricing, {
      saveToFile, returnBase64: true,
      footerLabel: staff ? 'STAFF COPY — Contains internal notes' : `Submitted selections — ${s.status || 'submitted'}`,
      staffRecord: staff ? { submittedAt: s.created_at, status: s.status, adminNotes: (s as any).admin_notes, salesComments: s.sales_comments, areaInternalNotes: internalAreaNotes(s.area_upgrades as never) } : undefined,
    });
  if (typeof result !== 'string') throw new Error('PDF generation returned no file');
  return result;
}