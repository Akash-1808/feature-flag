"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Flag,
  Copy,
  Check,
  Loader2,
  Trash2,
  Calendar,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FlagToggle } from "@/components/FlagToggle";
import { RolloutSlider } from "@/components/RolloutSlider";
import { TargetingRuleEditor } from "@/components/TargetingRuleEditor";
import { apiClient } from "@/lib/api-client";

export default function FlagDetailPage() {
  const params = useParams();
  const router = useRouter();
  const flagId = params?.id as string;

  const [flag, setFlag] = useState<any>(null);
  const [states, setStates] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [deleting, setDeleting] = useState(false);

  const fetchFlagData = async () => {
    try {
      const [flagRes, envsRes] = await Promise.all([
        apiClient.get(`/api/flags/${flagId}`),
        apiClient.get("/api/environments"),
      ]);

      const loadedFlag = flagRes.result || flagRes.flag || flagRes;
      const loadedStates = flagRes.states || [];
      setFlag(loadedFlag);
      setStates(loadedStates);

      const sortedEnvs = (envsRes.environments || []).sort((a: any, b: any) => {
        const order: Record<string, number> = { dev: 1, staging: 2, prod: 3 };
        return (order[a.key] || 99) - (order[b.key] || 99);
      });
      setEnvironments(sortedEnvs);

      if (sortedEnvs.length > 0 && !activeTab) {
        setActiveTab(sortedEnvs[0].id);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load feature flag details.");
      router.push("/flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (flagId) {
      fetchFlagData();
    }
  }, [flagId]);

  const handleCopyKey = () => {
    if (!flag?.key) return;
    navigator.clipboard.writeText(flag.key);
    setCopiedKey(true);
    toast.success(`Copied flag key: ${flag.key}`);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleDeleteFlag = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete "${flag.name}"? This action cannot be undone and will immediately affect SDK evaluations.`)) {
      return;
    }

    setDeleting(true);
    try {
      await apiClient.del(`/api/flags/${flagId}`);
      toast.success("Feature flag deleted successfully.");
      router.push("/flags");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete feature flag.");
      setDeleting(false);
    }
  };

  const getStateForEnv = (envId: string) => {
    return (
      states.find(
        (s) => s.env_id === envId || s.environment_id === envId
      ) || {
        enabled: false,
        rollout_percentage: 0,
        rules: [],
      }
    );
  };

  const updateStateLocally = (envId: string, patch: Partial<any>) => {
    setStates((prev) =>
      prev.map((s) => {
        if (s.env_id === envId || s.environment_id === envId) {
          return { ...s, ...patch };
        }
        return s;
      })
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading flag configuration...</span>
      </div>
    );
  }

  if (!flag) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Back Button & Header */}
      <div className="space-y-4 border-b border-border pb-6">
        <button
          onClick={() => router.push("/flags")}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to all feature flags
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Flag className="h-4 w-4" />
                </div>
                {flag.name}
              </h1>

              <Badge
                variant="secondary"
                className="text-xs uppercase font-mono tracking-wider px-2.5 py-0.5 bg-secondary/80"
              >
                {flag.type || "boolean"}
              </Badge>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 bg-muted/60 px-2 py-1 rounded-md border border-border/60">
                <span className="font-semibold text-foreground">Key:</span>
                <code className="font-mono text-primary font-bold">{flag.key}</code>
                <button
                  onClick={handleCopyKey}
                  className="hover:text-foreground p-0.5 rounded transition-colors ml-1"
                  title="Copy SDK key"
                >
                  {copiedKey ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {flag.created_at && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Created {new Date(flag.created_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {flag.description && (
              <p className="text-sm text-muted-foreground max-w-2xl pt-0.5">
                {flag.description}
              </p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteFlag}
            disabled={deleting}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 gap-1.5 self-start shrink-0"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete Flag
          </Button>
        </div>
      </div>

      {/* Environment Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-2">
          <TabsList className="bg-muted/60 p-1 h-auto">
            {environments.map((env) => {
              const state = getStateForEnv(env.id);
              return (
                <TabsTrigger
                  key={env.id}
                  value={env.id}
                  className="px-4 py-2 gap-2 text-xs font-semibold data-active:shadow-sm"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      state.enabled
                        ? state.rollout_percentage === 100
                          ? "bg-emerald-500"
                          : "bg-blue-500 animate-pulse"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                  {env.name}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Configuring environment-specific rules and evaluations</span>
          </div>
        </div>

        {environments.map((env) => {
          const state = getStateForEnv(env.id);
          return (
            <TabsContent key={env.id} value={env.id} className="space-y-6 focus:outline-none">
              {/* 1. Environment Toggle Switch */}
              <FlagToggle
                flagId={flag.id}
                envId={env.id}
                enabled={state.enabled}
                onToggleSuccess={(newEnabled) =>
                  updateStateLocally(env.id, { enabled: newEnabled })
                }
              />

              {/* 2. Rollout Slider */}
              <RolloutSlider
                flagId={flag.id}
                envId={env.id}
                rolloutPercentage={state.rollout_percentage ?? 0}
                disabled={!state.enabled}
                onRolloutSuccess={(newPercentage) =>
                  updateStateLocally(env.id, { rollout_percentage: newPercentage })
                }
              />

              {/* 3. Targeting Rules Editor */}
              <TargetingRuleEditor
                flagId={flag.id}
                envId={env.id}
                flagType={flag.type || "boolean"}
                rules={state.rules || []}
                onRulesChange={(newRules) =>
                  updateStateLocally(env.id, { rules: newRules })
                }
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
