"use client";

import React, { useState, useEffect, useRef } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { AuditEntry } from "@/components/AuditEntry";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const fetchLogs = async (currentPage = 1, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else if (currentPage === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const response = await apiClient.get(`/api/audit?page=${currentPage}&limit=20`);
      const newLogs = response.data || [];
      if (currentPage === 1 || isRefresh) {
        setLogs(newLogs);
      } else {
        // Append new items while deduplicating by ID just in case
        setLogs((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const filteredNew = newLogs.filter((item: any) => !existingIds.has(item.id));
          return [...prev, ...filteredNew];
        });
      }
      setHasMore(response.pagination?.hasMore ?? false);
    } catch (error: any) {
      toast.error(error.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  // IntersectionObserver to automatically load the next page when scrolling near the bottom
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && !refreshing) {
          setPage((prevPage) => prevPage + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
     };
  }, [hasMore, loading, loadingMore, refreshing]);

  const handleRefresh = () => {
    setPage(1);
    fetchLogs(1, true);
  };

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
          onClick={handleRefresh}
          disabled={loading || refreshing}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Timeline
        </Button>
      </div>

      {/* Logs Timeline */}
      {loading && page === 1 ? (
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

      {/* Infinite Scroll Sentinel & Loading Indicator */}
      {!loading && logs.length > 0 && (
        <div ref={observerTarget} className="py-6 flex flex-col items-center justify-center gap-2">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Loading more events...</span>
            </div>
          ) : !hasMore ? (
            <span className="text-xs text-muted-foreground opacity-60">
              No more audit events to show
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
