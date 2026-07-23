"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Flag, Layers, Loader2, ArrowRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";
import { CreateFlagModal } from "@/components/CreateFlagModal";

interface FlagStateEntry {
  env_id?: string;
  environment_id?: string;
  enabled: boolean;
  rollout_percentage: number;
}

interface FlagEntry {
  id: string;
  key: string;
  name: string;
  description?: string;
  type: string;
  states?: FlagStateEntry[];
}

interface EnvironmentEntry {
  id: string;
  name: string;
  key: string;
}

export default function FlagsPage() {
  const router = useRouter();
  const [flags, setFlags] = useState<FlagEntry[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [flagsRes, envsRes] = await Promise.all([
        apiClient.get<{ flags: FlagEntry[] }>("/api/flags"),
        apiClient.get<{ environments: EnvironmentEntry[] }>("/api/environments"),
      ]);

      setFlags(flagsRes.flags || []);
      // Sort environments so Development comes first, then Staging, then Production
      const sortedEnvs = (envsRes.environments || []).sort((a: EnvironmentEntry, b: EnvironmentEntry) => {
        const order: Record<string, number> = { dev: 1, staging: 2, prod: 3 };
        return (order[a.key] || 99) - (order[b.key] || 99);
      });
      setEnvironments(sortedEnvs);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load feature flags.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopyKey = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success(`Copied flag key: ${key}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredFlags = flags.filter(
    (flag) =>
      flag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (flag.description &&
        flag.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderStatusDot = (flag: FlagEntry, env: EnvironmentEntry) => {
    const state = flag.states?.find(
      (s: FlagStateEntry) => s.env_id === env.id || s.environment_id === env.id
    );

    if (!state || !state.enabled || state.rollout_percentage === 0) {
      return (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />
          <span className="text-xs text-muted-foreground">Off</span>
        </div>
      );
    }

    if (state.rollout_percentage < 100) {
      return (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
          <span className="text-xs font-medium text-blue-400">
            {state.rollout_percentage}% Rollout
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-xs font-medium text-emerald-400">Active</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Flag className="h-6 w-6 text-primary" />
            Feature Flags
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage feature controls, rollouts, and targeting across your environments.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2 shadow-sm font-medium self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Create Flag
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search flags by name or key..."
            className="pl-9 bg-card/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Flags Table */}
      <div className="rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-medium">Loading feature flags...</span>
          </div>
        ) : filteredFlags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {searchQuery ? "No matching flags found" : "No feature flags yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
              {searchQuery
                ? `No flags match "${searchQuery}". Try clearing your search query.`
                : "Get started by creating your first feature flag to control releases safely across environments."}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                variant="outline"
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Flag
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[30%]">Flag & Key</TableHead>
                <TableHead className="w-[12%]">Type</TableHead>
                {environments.map((env) => (
                  <TableHead key={env.id} className="w-[16%]">
                    {env.name}
                  </TableHead>
                ))}
                <TableHead className="w-[10%] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFlags.map((flag) => (
                <TableRow
                  key={flag.id}
                  onClick={() => router.push(`/flags/${flag.id}`)}
                  className="cursor-pointer transition-colors hover:bg-muted/50 group"
                >
                  {/* Flag Name & Key */}
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                        {flag.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                          {flag.key}
                        </code>
                        <button
                          onClick={(e) => handleCopyKey(e, flag.key)}
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                          title="Copy flag key"
                        >
                          {copiedKey === flag.key ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </button>
                      </div>
                      {flag.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {flag.description}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Flag Type Pill */}
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 bg-secondary/80 text-secondary-foreground"
                    >
                      {flag.type || "boolean"}
                    </Badge>
                  </TableCell>

                  {/* Environment Status Columns */}
                  {environments.map((env) => (
                    <TableCell key={env.id}>
                      {renderStatusDot(flag, env)}
                    </TableCell>
                  ))}

                  {/* Action arrow */}
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end text-muted-foreground group-hover:text-foreground transition-colors">
                      <ArrowRight className="h-4 w-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Flag Modal */}
      <CreateFlagModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={(response: any) => {
          if (response?.flag) {
            setFlags((prev) => [
              { ...(response.flag as FlagEntry), states: response.states || [] },
              ...prev,
            ]);
          } else {
            fetchData();
          }
        }}
      />
    </div>
  );
}
