import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DateRange } from '@/components/dashboard/types';
import { isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { useSubmissionLineTotals } from '@/hooks/useSubmissionLineTotals';
import { lineTotalsGate } from '@/lib/lineTotalsGate';

interface BuyerSelection {
  id: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  email: string;
  status: string | null;
  additional_windows_qty: number | null;
  patio_doors_qty: number | null;
  upgrade_interests: Record<string, boolean> | null;
  lvp_colour: string | null;
  bedroom_carpet_colour: string | null;
  hardwood_upgrade_selected: boolean | null;
  bathroom_tile_selected: boolean | null;
  heated_floor_bathrooms: number | null;
  created_at: string;
}

interface PipelineRecord {
  id: string;
  unit_number: string;
  unit_type: string | null;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
  buyer_email: string | null;
  pipeline_stage: string;
  contract_signed: boolean;
  deposit_received: boolean;
  contract_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  lead_date: string | null;
  meeting_date: string | null;
  quoted_date: string | null;
  signed_date: string | null;
  created_at: string;
}

const TOTAL_UNITS = 70;

export function useDashboardData(dateRange: DateRange) {
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    const [submissionsResult, pipelineResult] = await Promise.all([
      supabase.from('buyer_selections').select('*').order('created_at', { ascending: false }),
      supabase.from('sales_pipeline').select('*').order('unit_number', { ascending: true }),
    ]);

    if (submissionsResult.data) setSubmissions(submissionsResult.data as BuyerSelection[]);
    if (pipelineResult.data) setPipeline(pipelineResult.data as PipelineRecord[]);
    
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter data by date range
  const filteredSubmissions = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return submissions;
    
    return submissions.filter(s => {
      const createdAt = parseISO(s.created_at);
      const from = dateRange.from ? startOfDay(dateRange.from) : new Date(0);
      const to = dateRange.to ? endOfDay(dateRange.to) : new Date();
      return isWithinInterval(createdAt, { start: from, end: to });
    });
  }, [submissions, dateRange]);

  const filteredPipeline = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return pipeline;
    
    return pipeline.filter(p => {
      const createdAt = parseISO(p.created_at);
      const from = dateRange.from ? startOfDay(dateRange.from) : new Date(0);
      const to = dateRange.to ? endOfDay(dateRange.to) : new Date();
      return isWithinInterval(createdAt, { start: from, end: to });
    });
  }, [pipeline, dateRange]);

  // Window coverings figures come from quote lines (sumQuoteLines over the window_coverings section).
  const lineTotals = useSubmissionLineTotals(submissions);
  const windowSubtotalOf = useCallback((s: BuyerSelection) => lineTotals.sectionTotalsOf(s.id, 'window_coverings').subtotal, [lineTotals]);

  // Calculate all stats
  const stats = useMemo(() => {
    // Submission stats
    const statusCounts: Record<string, number> = {};
    filteredSubmissions.forEach(s => {
      const status = s.status || 'submitted';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const upgradeInterests: Record<string, number> = {
      flooring: 0,
      tile: 0,
      'heated-floor': 0,
      automation: 0,
    };
    filteredSubmissions.forEach(s => {
      if (s.upgrade_interests) {
        Object.keys(s.upgrade_interests).forEach(key => {
          if (s.upgrade_interests![key]) {
            upgradeInterests[key] = (upgradeInterests[key] || 0) + 1;
          }
        });
      }
    });

    // Pipeline stats
    const pipelineStats = {
      lead: filteredPipeline.filter(p => p.pipeline_stage === 'lead').length,
      meeting: filteredPipeline.filter(p => p.pipeline_stage === 'meeting').length,
      quoted: filteredPipeline.filter(p => p.pipeline_stage === 'quoted').length,
      signed: filteredPipeline.filter(p => p.pipeline_stage === 'signed').length,
      totalContractValue: filteredPipeline.reduce((sum, p) => sum + (p.contract_amount || 0), 0),
      totalTax: filteredPipeline.reduce((sum, p) => sum + (p.tax_amount || 0), 0),
      totalRevenue: filteredPipeline.reduce((sum, p) => sum + (p.total_amount || 0), 0),
      contractsSigned: filteredPipeline.filter(p => p.contract_signed).length,
      depositsReceived: filteredPipeline.filter(p => p.deposit_received).length,
    };

    const conversionRate = filteredPipeline.length > 0 
      ? ((pipelineStats.signed / filteredPipeline.length) * 100)
      : 0;

    const avgContractValue = pipelineStats.contractsSigned > 0
      ? pipelineStats.totalContractValue / pipelineStats.contractsSigned
      : 0;

    // Selection stats
    const selectionStats = {
      total: filteredSubmissions.length,
      // pre-GST, from quote lines (the submit-time total column is stale)
      windowRevenue: filteredSubmissions.reduce((sum, s) => sum + windowSubtotalOf(s), 0),
      hardwoodUpgrades: filteredSubmissions.filter(s => s.hardwood_upgrade_selected).length,
      tileUpgrades: filteredSubmissions.filter(s => s.bathroom_tile_selected).length,
      heatedFloors: filteredSubmissions.filter(s => (s.heated_floor_bathrooms || 0) > 0).length,
      windowExtensions: filteredSubmissions.filter(s => (s.additional_windows_qty || 0) > 0 || (s.patio_doors_qty || 0) > 0).length,
    };

    // Color preferences
    const lvpColorCounts: Record<string, number> = {};
    filteredSubmissions.forEach(s => {
      if (s.lvp_colour) {
        lvpColorCounts[s.lvp_colour] = (lvpColorCounts[s.lvp_colour] || 0) + 1;
      }
    });
    const lvpColorData = Object.entries(lvpColorCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const carpetColorCounts: Record<string, number> = {};
    filteredSubmissions.forEach(s => {
      if (s.bedroom_carpet_colour) {
        carpetColorCounts[s.bedroom_carpet_colour] = (carpetColorCounts[s.bedroom_carpet_colour] || 0) + 1;
      }
    });
    const carpetColorData = Object.entries(carpetColorCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalUnits: TOTAL_UNITS,
      statusCounts,
      upgradeInterests,
      pipelineStats,
      conversionRate,
      avgContractValue,
      selectionStats,
      lvpColorData,
      carpetColorData,
      recentSubmissions: filteredSubmissions.slice(0, 5).map(s => ({ ...s, window_subtotal: windowSubtotalOf(s) })),
    };
  }, [filteredSubmissions, filteredPipeline, windowSubtotalOf]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return {
    submissions: filteredSubmissions,
    pipeline: filteredPipeline,
    allSubmissions: submissions,
    allPipeline: pipeline,
    stats,
    loading,
    /** Window revenue figures come from quote lines; the CSV export waits for them (never $0.00 while loading). */
    totalsGate: lineTotalsGate(lineTotals),
    refreshing,
    refetch,
    totalUnits: TOTAL_UNITS,
  };
}
