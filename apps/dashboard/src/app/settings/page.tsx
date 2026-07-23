"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings,
  KeyRound,
  Building2,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  ShieldAlert,
  Server,
  Laptop,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";

interface SettingsEnvironment {
  id: string;
  name: string;
  key: string;
}

interface ApiKeyEntry {
  id: string;
  name: string;
  key_prefix: string;
  type: string;
  created_at: string;
  last_used_at?: string;
  revoked_at?: string;
}

interface MemberRoleResponse {
  data?: { role?: string };
  role?: string;
}

export default function SettingsPage() {
  const [environments, setEnvironments] = useState<SettingsEnvironment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [keysLoading, setKeysLoading] = useState(false);

  // New Environment Form
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [envSubmitting, setEnvSubmitting] = useState(false);

  // New API Key Form
  const [keyName, setKeyName] = useState("");
  const [keyType, setKeyType] = useState("client");
  const [keySubmitting, setKeySubmitting] = useState(false);

  // Once-shown Full API Key State
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // User role (fetched from Better Auth org plugin)
  const [userRole, setUserRole] = useState<string | null>(null);
  const canManageKeys = userRole === "admin" || userRole === "owner";

  const fetchEnvironments = useCallback(async () => {
    try {
      const response = await apiClient.get<{ environments: SettingsEnvironment[] }>("/api/environments");
      const sorted = (response.environments || []).sort((a: SettingsEnvironment, b: SettingsEnvironment) => {
        const order: Record<string, number> = { dev: 1, staging: 2, prod: 3 };
        return (order[a.key] || 99) - (order[b.key] || 99);
      });
      setEnvironments(sorted);
      if (sorted.length > 0 && !selectedEnvId) {
        setSelectedEnvId(sorted[0].id);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load environments.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [selectedEnvId]);

  const fetchApiKeys = useCallback(async (envId: string) => {
    if (!envId) return;
    setKeysLoading(true);
    try {
      const response = await apiClient.get<any>(`/api/api-keys?environmentId=${envId}`);
      setApiKeys(Array.isArray(response) ? response : response.apiKeys || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load API keys.";
      toast.error(message);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments();
    // Fetch current user's org role
    apiClient
      .get<MemberRoleResponse>("/api/auth/organization/get-active-member")
      .then((res) => {
        setUserRole(res?.data?.role || res?.role || null);
      })
      .catch(() => setUserRole(null));
  }, [fetchEnvironments]);

  useEffect(() => {
    if (selectedEnvId) {
      fetchApiKeys(selectedEnvId);
    }
  }, [selectedEnvId, fetchApiKeys]);

  const handleCreateEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnvName.trim() || !newEnvKey.trim()) {
      toast.error("Environment name and key are required.");
      return;
    }

    setEnvSubmitting(true);
    try {
      const response = await apiClient.post<{ environment: SettingsEnvironment }>("/api/environments", {
        name: newEnvName.trim(),
        key: newEnvKey.trim().toLowerCase(),
      });
      toast.success("Environment created successfully.");
      setEnvironments((prev) => [...prev, response.environment]);
      setNewEnvName("");
      setNewEnvKey("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create environment.";
      toast.error(message);
    } finally {
      setEnvSubmitting(false);
    }
  };

  const handleDeleteEnvironment = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete environment "${name}"? All associated flag states and API keys will be removed.`)) {
      return;
    }

    try {
      await apiClient.del(`/api/environments/${id}`);
      toast.success("Environment deleted.");
      setEnvironments((prev) => prev.filter((env) => env.id !== id));
      if (selectedEnvId === id) {
        setSelectedEnvId(environments.find((e) => e.id !== id)?.id || "");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete environment.";
      toast.error(message);
    }
  };

  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnvId || !keyName.trim()) {
      toast.error("Please provide a key name and select an environment.");
      return;
    }

    setKeySubmitting(true);
    try {
      const response = await apiClient.post<{ apiKey: string; apiKeyData: ApiKeyEntry }>("/api/api-keys", {
        environmentId: selectedEnvId,
        type: keyType,
        name: keyName.trim(),
      });

      toast.success("API key generated successfully!");
      console.log("[DEBUG] API key response:", JSON.stringify(response));
      setNewlyCreatedKey(response.apiKey);
      setApiKeys((prev) => [response.apiKeyData, ...prev]);
      setKeyName("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to generate API key.";
      toast.error(message);
    } finally {
      setKeySubmitting(false);
    }
  };

  const handleRevokeApiKey = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to revoke API key "${name}"? Applications using this key will immediately lose access.`)) {
      return;
    }

    try {
      await apiClient.del(`/api/api-keys/${id}`);
      toast.success("API key revoked.");
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to revoke API key.";
      toast.error(message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setKeyCopied(true);
    toast.success("API key copied to clipboard!");
    setTimeout(() => setKeyCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading workspace settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Settings className="h-6 w-6 text-primary" />
          Workspace Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure deployment environments and manage API keys for your applications.
        </p>
      </div>

      <Tabs defaultValue="api-keys" className="space-y-6">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="api-keys" className="px-4 py-2 gap-2 text-xs font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            API Keys & Access Tokens
          </TabsTrigger>
          <TabsTrigger value="environments" className="px-4 py-2 gap-2 text-xs font-semibold">
            <Building2 className="h-4 w-4 text-primary" />
            Environments
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: API KEYS ────────────────────────────────────────────── */}
        <TabsContent value="api-keys" className="space-y-6 focus:outline-none">
          {/* Environment Selector bar */}
          <div className="p-4 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">Target Environment</Label>
              <p className="text-xs text-muted-foreground">
                API keys are strictly scoped to a single environment. Select one below:
              </p>
            </div>

            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
              value={selectedEnvId}
              onChange={(e) => setSelectedEnvId(e.target.value)}
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name} ({env.key})
                </option>
              ))}
            </select>
          </div>

          {/* Generate Key Form */}
          <form
            onSubmit={handleGenerateApiKey}
            className="p-5 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm space-y-4"
          >
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Generate New API Key
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="key-name" className="text-xs">
                  Token Name / Description
                </Label>
                <Input
                  id="key-name"
                  placeholder="e.g. Next.js Web App (Production) or Node Backend Service"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="key-type" className="text-xs">
                  Key Type & Scope
                </Label>
                <select
                  id="key-type"
                  className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  value={keyType}
                  onChange={(e) => setKeyType(e.target.value)}
                >
                  <option value="client">Client SDK (Public, Read-only evaluations)</option>
                  <option value="server">Server SDK (Private, High-rate evaluation access)</option>
                </select>
              </div>
            </div>

            <Button type="submit" size="sm" className="gap-2 h-9 text-xs" disabled={keySubmitting || !selectedEnvId}>
              {keySubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating Token...
                </>
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5" />
                  Generate API Key
                </>
              )}
            </Button>
          </form>

          {/* Keys List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Active Keys for{" "}
              <span className="text-primary">
                {environments.find((e) => e.id === selectedEnvId)?.name || "Selected Environment"}
              </span>
            </h3>

            {keysLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs font-medium">Loading API keys...</span>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="py-10 text-center rounded-lg border border-dashed border-border/80 bg-muted/20">
                <KeyRound className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-xs text-muted-foreground">
                  No API keys generated for this environment yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className={`p-4 rounded-md border border-border/80 bg-card/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-border transition-colors ${key.revoked_at ? 'opacity-50 grayscale' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${key.type === "server"
                          ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                          : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          }`}
                      >
                        {key.type === "server" ? (
                          <Server className="h-4 w-4" />
                        ) : (
                          <Laptop className="h-4 w-4" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {key.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-mono px-1.5 py-0 bg-muted/60"
                          >
                            {key.type}
                          </Badge>

                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                          <span>Prefix: <strong className="text-foreground">{key.key_prefix}••••••••</strong></span>
                          <span>•</span>
                          <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {canManageKeys && !key.revoked_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokeApiKey(key.id, key.name)}
                        className="text-destructive hover:bg-destructive/10 border-destructive/30 text-xs h-8 gap-1.5 self-end sm:self-auto"
                      >
                        <Trash2 className="h-3 w-3" />
                        Revoke Key
                      </Button>
                    )}
                    {key.revoked_at && (
                      <Badge variant="destructive" className="text-xs uppercase font-mono px-1.5 py-0 bg-destructive/60 text-white-500">
                        Revoked at {new Date(key.revoked_at).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── TAB 2: ENVIRONMENTS ────────────────────────────────────────── */}
        <TabsContent value="environments" className="space-y-6 focus:outline-none">
          {/* Create Environment Form */}
          <form
            onSubmit={handleCreateEnvironment}
            className="p-5 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm space-y-4"
          >
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Create New Environment
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="env-name" className="text-xs">
                  Environment Name
                </Label>
                <Input
                  id="env-name"
                  placeholder="e.g. QA / Performance Testing"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="env-key" className="text-xs">
                  Key Identifier
                </Label>
                <Input
                  id="env-key"
                  placeholder="qa"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>
            </div>

            <Button type="submit" size="sm" className="gap-2 h-9 text-xs" disabled={envSubmitting}>
              {envSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Building2 className="h-3.5 w-3.5" />
                  Create Environment
                </>
              )}
            </Button>
          </form>

          {/* Environments List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Configured Environments</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {environments.map((env) => (
                <div
                  key={env.id}
                  className="p-4 rounded-lg border border-border/80 bg-card/40 flex flex-col justify-between gap-4 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold text-foreground">
                        {env.name}
                      </span>
                      <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5">
                        {env.key}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ID: <code className="font-mono">{env.id.slice(0, 8)}...</code>
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteEnvironment(env.id, env.name)}
                    className="text-destructive hover:bg-destructive/10 border-destructive/30 text-xs h-8 gap-1.5 w-full justify-center"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Environment
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Once-shown Full API Key Modal */}
      <Dialog open={!!newlyCreatedKey} onOpenChange={() => setNewlyCreatedKey(null)}>
        <DialogContent className="sm:max-w-lg border-primary/30 bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-emerald-400">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              API Key Generated Successfully
            </DialogTitle>
            <DialogDescription className="text-xs">
              Please copy your access token right now. For security purposes, our database only stores a SHA-256 hash and you will never be able to see this full token again.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-md bg-muted/60 border border-border/80 space-y-3 my-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your Secret Access Token
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2.5 rounded bg-background border border-border/60 font-mono text-xs text-foreground break-all select-all">
                {newlyCreatedKey}
              </code>
              <Button
                type="button"
                size="sm"
                onClick={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey)}
                className="gap-1.5 shrink-0 h-9"
              >
                {keyCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              className="w-full"
              onClick={() => setNewlyCreatedKey(null)}
            >
              I have safely copied my API key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
