"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Layers, ArrowRight, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function SelectOrgPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const res = await apiClient.get("/api/organizations");
        setOrganizations(res.organizations || []);
        
        // Auto-select if only 1 organization exists
        if (res.organizations?.length === 1) {
          handleSelectOrg(res.organizations[0].id);
        }
      } catch (error: any) {
        toast.error("Failed to load workspaces. Please log in again.");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    fetchOrgs();
  }, [router]);

  const handleSelectOrg = async (orgId: string) => {
    setSelectingId(orgId);
    try {
      await apiClient.post("/api/organizations/set-active", {
        organizationId: orgId,
      });
      toast.success("Workspace selected!");
      router.push("/flags");
    } catch (error: any) {
      toast.error(error.message || "Failed to select workspace.");
      setSelectingId(null);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-12 px-4">
      {/* Brand Logo Header */}
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-md mb-3">
          <Layers className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome to FlagCraft
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a workspace to continue
        </p>
      </div>

      <Card className="border-border/60 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl">Your Workspaces</CardTitle>
          <CardDescription>
            Choose which organization you want to log into
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading workspaces...</p>
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">You do not belong to any workspaces.</p>
              <Button onClick={() => router.push("/register")} variant="outline">
                Create a Workspace
              </Button>
            </div>
          ) : (
            organizations.map((org) => (
              <Button
                key={org.id}
                variant="outline"
                className="w-full justify-between h-auto py-4 px-6 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                onClick={() => handleSelectOrg(org.id)}
                disabled={selectingId !== null}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-secondary/50 flex items-center justify-center text-secondary-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-foreground text-base">{org.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{org.slug}</p>
                  </div>
                </div>
                
                {selectingId === org.id ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <ArrowRight className="h-5 w-5 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                )}
              </Button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
