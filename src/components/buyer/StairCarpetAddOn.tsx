import { useEffect, useState } from 'react';
import { withGst } from '@/lib/quoteLines';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { toast } from 'sonner';

type AddonRow = {
  id: string; unit_number: string; stair_upgrade_type: string | null;
  stair_lvp_upgrade_selected: boolean | null; stair_premium_carpet_selected: boolean | null; premium_underpad_stairs: boolean | null;
};

// Lets a buyer who already confirmed their selections add the premium stair
// carpet / underpad (main level to lower level) afterwards. Add-only.
export function StairCarpetAddOn() {
  const { getStairCarpetUpgradePrice, getUnderpadStairsPrice, gstRate, isFlatRateEnabled } = useDynamicPricing();
  const [row, setRow] = useState<AddonRow | null>(null);
  const [carpet, setCarpet] = useState(false);
  const [underpad, setUnderpad] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc('buyer_get_stair_addon');
    setRow((Array.isArray(data) ? data[0] : null) as AddonRow | null);
  };
  useEffect(() => { load(); }, []);

  if (!row) return null;
  if ((row.stair_upgrade_type && row.stair_upgrade_type !== 'standard') || row.stair_lvp_upgrade_selected) return null;

  const carpetPrice = isFlatRateEnabled('premium_carpet_stairs_price') ? getStairCarpetUpgradePrice() : 0;
  const underpadPrice = isFlatRateEnabled('premium_underpad_stairs_price') ? getUnderpadStairsPrice() : 0;
  const hasCarpet = !!row.stair_premium_carpet_selected;
  const hasUnderpad = !!row.premium_underpad_stairs;
  const canAddCarpet = !hasCarpet && carpetPrice > 0;
  const canAddUnderpad = !hasUnderpad && underpadPrice > 0;
  if (!canAddCarpet && !canAddUnderpad && !hasCarpet && !hasUnderpad) return null;

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('buyer_add_stair_addon', { _premium_carpet: carpet, _premium_underpad: underpad });
    setSaving(false);
    if (error) { toast.error('Could not add the upgrade', { description: error.message }); return; }
    toast.success('Upgrade added to your selections', { description: 'Our team will include it in your updated quote.' });
    setCarpet(false); setUnderpad(false);
    load();
  };

  return (
    <div className="border-b border-border bg-card">
      <div className="container max-w-3xl mx-auto px-4 py-5 space-y-3">
        <div>
          <h2 className="font-semibold text-foreground">Stairs to Lower Level — Carpet Upgrade</h2>
          <p className="text-sm text-muted-foreground">
            Your selections for Unit {row.unit_number} are confirmed. You can still add a premium carpet and underpad upgrade for the stairs from the main level to your basement or lower level.
          </p>
        </div>
        <div className="space-y-2">
          {carpetPrice > 0 && (
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={hasCarpet || carpet} disabled={hasCarpet} onCheckedChange={(v) => setCarpet(!!v)} />
              <span className="flex-1">Premium Carpet — {fmt(carpetPrice)} + GST ({fmt(withGst(carpetPrice, gstRate))} incl. GST)</span>
              {hasCarpet && <span className="text-xs text-primary font-medium">Added</span>}
            </label>
          )}
          {underpadPrice > 0 && (
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={hasUnderpad || underpad} disabled={hasUnderpad} onCheckedChange={(v) => setUnderpad(!!v)} />
              <span className="flex-1">Premium Underpad — {fmt(underpadPrice)} + GST ({fmt(withGst(underpadPrice, gstRate))} incl. GST)</span>
              {hasUnderpad && <span className="text-xs text-primary font-medium">Added</span>}
            </label>
          )}
        </div>
        {(canAddCarpet || canAddUnderpad) && (
          <Button size="sm" onClick={save} disabled={saving || (!carpet && !underpad)}>
            {saving ? 'Adding…' : 'Add to my selections'}
          </Button>
        )}
      </div>
    </div>
  );
}
