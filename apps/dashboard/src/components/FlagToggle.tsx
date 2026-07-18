"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";

interface FlagToggleProps {
  flagId: string;
  envId: string;
  enabled: boolean;
  onToggleSuccess: (newEnabled: boolean) => void;
}

export function FlagToggle({
  flagId,
  envId,
  enabled,
  onToggleSuccess,
}: FlagToggleProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      await apiClient.patch(`/api/flags/${flagId}/environments/${envId}`, {
        enabled: checked,
      });
      onToggleSuccess(checked);
      toast.success(
        checked
          ? "Flag enabled for this environment."
          : "Flag disabled for this environment."
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to update flag status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={`flag-toggle-${envId}`} className="text-base font-semibold cursor-pointer">
            Environment Status
          </Label>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground">
          {enabled
            ? "This feature flag is currently active and evaluating rollout rules."
            : "This flag is turned off. All SDK evaluations will return false or default values immediately."}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
            enabled
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          {enabled ? "Active" : "Disabled"}
        </span>
        <Switch
          id={`flag-toggle-${envId}`}
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={loading}
        />
      </div>
    </div>
  );
}
