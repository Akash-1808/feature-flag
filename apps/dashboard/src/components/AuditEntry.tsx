"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, History, User, Clock, FileDiff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AuditEntryProps {
  entry: {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    actor_id: string | null;
    before_state?: any;
    after_state?: any;
    metadata?: any;
    created_at: string | Date;
  };
}

export function AuditEntry({ entry }: AuditEntryProps) {
  const [expanded, setExpanded] = useState(false);

  const getActionBadgeStyle = (action: string) => {
    if (action.includes("CREATE") || action.includes("ADD")) {
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    }
    if (action.includes("DELETE") || action.includes("REMOVE") || action.includes("REVOKE")) {
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    }
    if (action.includes("UPDATE") || action.includes("TOGGLE") || action.includes("REORDER")) {
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    }
    return "bg-secondary text-secondary-foreground";
  };

  const hasDiff = entry.before_state || entry.after_state;

  return (
    <div className="rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm transition-all hover:border-border overflow-hidden shadow-sm">
      <div
        onClick={() => hasDiff && setExpanded(!expanded)}
        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          hasDiff ? "cursor-pointer hover:bg-muted/30" : ""
        }`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
            <History className="h-4 w-4" />
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[11px] font-mono tracking-wide px-2 py-0 border ${getActionBadgeStyle(
                  entry.action
                )}`}
              >
                {entry.action}
              </Badge>

              <Badge
                variant="secondary"
                className="text-[10px] uppercase font-mono px-1.5 py-0 bg-muted text-muted-foreground"
              >
                {entry.entity_type}
              </Badge>

              <code className="text-xs text-muted-foreground font-mono truncate max-w-[160px]">
                {entry.entity_id}
              </code>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-0.5">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{new Date(entry.created_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{entry.actor_id || "System Action"}</span>
              </div>
            </div>
          </div>
        </div>

        {hasDiff && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium self-end sm:self-center">
            <FileDiff className="h-3.5 w-3.5 text-primary" />
            <span>{expanded ? "Hide Diff" : "View Diff"}</span>
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        )}
      </div>

      {/* Expandable JSON Diff Panel */}
      {expanded && hasDiff && (
        <div className="border-t border-border/60 bg-muted/20 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
          <div>
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block mb-1.5 font-mono">
              Before State (-)
            </span>
            <pre className="p-3 rounded-md bg-background/80 border border-border/40 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-64">
              {entry.before_state
                ? JSON.stringify(entry.before_state, null, 2)
                : "// No prior state (Newly created entity)"}
            </pre>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block mb-1.5 font-mono">
              After State (+)
            </span>
            <pre className="p-3 rounded-md bg-background/80 border border-border/40 text-[11px] font-mono text-foreground overflow-x-auto max-h-64">
              {entry.after_state
                ? JSON.stringify(entry.after_state, null, 2)
                : "// Entity deleted"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
