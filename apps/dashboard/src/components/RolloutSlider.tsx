"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Sliders, Users } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";

interface RolloutSliderProps {
  flagId: string;
  envId: string;
  rolloutPercentage: number;
  disabled?: boolean;
  onRolloutSuccess: (newPercentage: number) => void;
}

export function RolloutSlider({
  flagId,
  envId,
  rolloutPercentage: initialPercentage,
  disabled = false,
  onRolloutSuccess,
}: RolloutSliderProps) {
  const [percentage, setPercentage] = useState(initialPercentage);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPercentage(initialPercentage);
  }, [initialPercentage]);

  const saveRollout = async (newVal: number) => {
    if (newVal === initialPercentage) return;
    setLoading(true);
    try {
      await apiClient.patch(`/api/flags/${flagId}/environments/${envId}`, {
        rolloutPercentage: newVal,
      });
      onRolloutSuccess(newVal);
      toast.success(`Rollout percentage updated to ${newVal}%.`);
    } catch (error: any) {
      toast.error(error.message || "Failed to update rollout percentage.");
      setPercentage(initialPercentage); // Revert on failure
    } finally {
      setLoading(false);
    }
  };

  const handleSliderCommit = (val: number | readonly number[] | null) => {
    if (val === null) return;
    const finalVal = Array.isArray(val) ? val[0] : val;
    if (typeof finalVal === "number") {
      saveRollout(finalVal);
    }
  };

  const presets = [0, 10, 25, 50, 75, 100];

  return (
    <div className="p-5 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" />
              Percentage Rollout (Bucketing)
            </Label>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            Deterministic user bucketing via MurmurHash3/FNV-1a (`hash(flagKey + userId) % 100`).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto bg-muted/60 px-3 py-1.5 rounded-md border border-border/60">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold font-mono text-foreground">
            {percentage}%
          </span>
          <span className="text-xs text-muted-foreground">of users</span>
        </div>
      </div>

      {/* Slider Track */}
      <div className="pt-2 pb-1 px-1">
        <Slider
          value={[percentage]}
          min={0}
          max={100}
          step={1}
          disabled={disabled || loading}
          onValueChange={(vals: number | readonly number[] | null) => {
            if (vals === null) return;
            const val = Array.isArray(vals) ? vals[0] : vals;
            if (typeof val === "number") setPercentage(val);
          }}
          onValueCommitted={handleSliderCommit}
          className="cursor-pointer"
        />
      </div>

      {/* Presets */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <span className="text-xs text-muted-foreground font-medium">Quick presets:</span>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={percentage === preset ? "default" : "outline"}
              className={`h-7 px-2.5 text-xs font-mono transition-all ${
                percentage === preset
                  ? "shadow-sm"
                  : "bg-background/50 hover:bg-muted"
              }`}
              disabled={disabled || loading}
              onClick={() => {
                setPercentage(preset);
                saveRollout(preset);
              }}
            >
              {preset}%
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
