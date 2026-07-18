"use client";

import React, { useState, useEffect } from "react";
import { History, Loader2, ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { AuditEntry } from "@/components/AuditEntry";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = async (currentPage = 1, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await apiClient.get(`/api/audit?page=${currentPage}&limit=20`);
      setLogs(response.data || []);
      setHasMore(response.pagination?.hasMore ?? false);
    } catch (error: any) {
      toast.error(error.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <History className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete timeline of state mutations, rollout adjustments, and targeting rule changes.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchLogs(page, true)}
          disabled={loading || refreshing}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Timeline
        </Button>
      </div>

      {/* Logs Timeline */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading audit timeline...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 rounded-lg border border-border/80 bg-card/40">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
            <History className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No audit events recorded</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Mutations such as creating flags, adjusting rollouts, or adding rules will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((entry) => (
            <AuditEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && (logs.length > 0 || page > 1) && (
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <span className="text-xs text-muted-foreground">
            Page <span className="font-semibold text-foreground">{page}</span>
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="gap-1 text-xs h-8"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
              className="gap-1 text-xs h-8"
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
