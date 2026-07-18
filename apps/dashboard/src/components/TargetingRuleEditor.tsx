"use client";

import React, { useState } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Target,
  Loader2,
  Sparkles,
  Edit2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";

interface TargetingRule {
  id: string;
  flag_state_id: string;
  priority: number;
  conditions: Record<string, any>;
  value?: any;
  variation?: any;
}

interface TargetingRuleEditorProps {
  flagId: string;
  envId: string;
  flagType: string;
  rules: TargetingRule[];
  onRulesChange: (newRules: TargetingRule[]) => void;
}

export function TargetingRuleEditor({
  flagId,
  envId,
  flagType,
  rules = [],
  onRulesChange,
}: TargetingRuleEditorProps) {
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // New Rule Form State
  const [newAttribute, setNewAttribute] = useState("email");
  const [newOperator, setNewOperator] = useState("$eq");
  const [newValue, setNewValue] = useState("");
  const [newVariation, setNewVariation] = useState<any>(
    flagType === "boolean" ? true : ""
  );

  // Editing Rule State
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editAttribute, setEditAttribute] = useState("");
  const [editOperator, setEditOperator] = useState("$eq");
  const [editValue, setEditValue] = useState("");
  const [editVariation, setEditVariation] = useState<any>(true);

  // Helper to format/parse condition value based on operator
  const parseValueForOperator = (val: string, op: string) => {
    if (op === "$in" || op === "$nin") {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (op === "$gt" || op === "$gte" || op === "$lt" || op === "$lte") {
      const num = Number(val);
      return !isNaN(num) ? num : val;
    }
    if (val === "true") return true;
    if (val === "false") return false;
    return val;
  };

  const formatValueForDisplay = (val: any): string => {
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "object" && val !== null) return JSON.stringify(val);
    return String(val);
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttribute.trim() || newValue === "") {
      toast.error("Please provide both an attribute and a condition value.");
      return;
    }

    setLoading(true);
    try {
      const parsedVal = parseValueForOperator(newValue, newOperator);
      const conditions: Record<string, any> =
        newOperator === "$eq"
          ? { [newAttribute.trim()]: parsedVal }
          : { [newAttribute.trim()]: { [newOperator]: parsedVal } };

      const parsedVariation =
        flagType === "boolean"
          ? newVariation === true || newVariation === "true"
          : flagType === "number"
          ? Number(newVariation)
          : newVariation;

      const response = await apiClient.post(
        `/api/flags/${flagId}/environments/${envId}/rules`,
        {
          conditions,
          variation: parsedVariation,
        }
      );

      const addedRule = response.rule;
      const updatedRules = [...rules, addedRule];
      onRulesChange(updatedRules);
      toast.success("Targeting rule created!");
      setIsAdding(false);
      setNewValue("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create rule.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    setLoading(true);
    try {
      await apiClient.del(
        `/api/flags/${flagId}/environments/${envId}/rules/${ruleId}`
      );
      const updatedRules = rules.filter((r) => r.id !== ruleId);
      onRulesChange(updatedRules);
      toast.success("Rule deleted.");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete rule.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (rule: TargetingRule) => {
    setEditingRuleId(rule.id);
    const attr = Object.keys(rule.conditions)[0] || "email";
    setEditAttribute(attr);

    const rawVal = rule.conditions[attr];
    if (typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)) {
      const op = Object.keys(rawVal)[0] || "$eq";
      setEditOperator(op);
      setEditValue(formatValueForDisplay(rawVal[op]));
    } else {
      setEditOperator("$eq");
      setEditValue(formatValueForDisplay(rawVal));
    }

    setEditVariation(rule.variation !== undefined ? rule.variation : rule.value);
  };

  const handleSaveEdit = async (ruleId: string) => {
    setLoading(true);
    try {
      const parsedVal = parseValueForOperator(editValue, editOperator);
      const conditions: Record<string, any> =
        editOperator === "$eq"
          ? { [editAttribute.trim()]: parsedVal }
          : { [editAttribute.trim()]: { [editOperator]: parsedVal } };

      const parsedVariation =
        flagType === "boolean"
          ? editVariation === true || editVariation === "true"
          : flagType === "number"
          ? Number(editVariation)
          : editVariation;

      const response = await apiClient.patch(
        `/api/flags/${flagId}/environments/${envId}/rules/${ruleId}`,
        {
          conditions,
          variation: parsedVariation,
        }
      );

      const updatedRules = rules.map((r) =>
        r.id === ruleId ? response.rule || { ...r, conditions, variation: parsedVariation } : r
      );
      onRulesChange(updatedRules);
      toast.success("Rule updated successfully.");
      setEditingRuleId(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to update rule.");
    } finally {
      setLoading(false);
    }
  };

  const handleMoveRule = async (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= rules.length) return;

    const reordered = [...rules];
    const temp = reordered[index];
    reordered[index] = reordered[targetIdx]!;
    reordered[targetIdx] = temp!;

    // Optimistic update
    onRulesChange(reordered);
    setLoading(true);
    try {
      await apiClient.put(
        `/api/flags/${flagId}/environments/${envId}/rules/reorder`,
        {
          ruleIds: reordered.map((r) => r.id),
        }
      );
      toast.success("Rules reordered.");
    } catch (error: any) {
      toast.error(error.message || "Failed to reorder rules.");
      onRulesChange(rules); // Revert
    } finally {
      setLoading(false);
    }
  };

  const operators = [
    { label: "Equals ($eq)", value: "$eq" },
    { label: "Not Equals ($ne)", value: "$ne" },
    { label: "In List ($in comma-sep)", value: "$in" },
    { label: "Not In List ($nin)", value: "$nin" },
    { label: "Greater Than ($gt)", value: "$gt" },
    { label: "Greater or Equal ($gte)", value: "$gte" },
    { label: "Less Than ($lt)", value: "$lt" },
    { label: "Less or Equal ($lte)", value: "$lte" },
  ];

  return (
    <div className="p-5 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Targeting Rules (Context Attributes)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rules are evaluated in priority order from top (#1) to bottom. First matching rule wins.
          </p>
        </div>
        {!isAdding && (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
            className="gap-1.5 self-start sm:self-auto text-xs"
            disabled={loading}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Add Rule Form */}
      {isAdding && (
        <form
          onSubmit={handleAddRule}
          className="p-4 rounded-md border border-primary/30 bg-primary/5 space-y-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              New Targeting Condition
            </span>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">User Attribute</Label>
              <Input
                placeholder="e.g. email, plan, age"
                value={newAttribute}
                onChange={(e) => setNewAttribute(e.target.value)}
                className="h-8 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Operator</Label>
              <select
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={newOperator}
                onChange={(e) => setNewOperator(e.target.value)}
              >
                {operators.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Target Value</Label>
              <Input
                placeholder={
                  newOperator === "$in"
                    ? "a@b.com, c@d.com"
                    : "e.g. enterprise"
                }
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-8 text-xs font-mono"
                required
              />
            </div>
          </div>

          {/* Served Variation */}
          <div className="pt-2 border-t border-border/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-medium">Serve Variation when matched:</Label>
              {flagType === "boolean" ? (
                <select
                  className="h-8 rounded-md border border-input bg-background px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                  value={String(newVariation)}
                  onChange={(e) => setNewVariation(e.target.value === "true")}
                >
                  <option value="true">True (Enabled)</option>
                  <option value="false">False (Disabled)</option>
                </select>
              ) : (
                <Input
                  value={newVariation}
                  onChange={(e) => setNewVariation(e.target.value)}
                  placeholder="Return variant value..."
                  className="h-8 text-xs max-w-xs"
                  required
                />
              )}
            </div>

            <Button type="submit" size="sm" className="gap-1 text-xs h-8" disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Save Rule
            </Button>
          </div>
        </form>
      )}

      {/* Existing Rules List */}
      <div className="space-y-2.5">
        {rules.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border/60 rounded-md bg-muted/20">
            <p className="text-xs text-muted-foreground">
              No targeting rules configured for this environment.
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              All evaluations will fall back to the Percentage Rollout slider above.
            </p>
          </div>
        ) : (
          rules.map((rule, idx) => {
            const isEditing = editingRuleId === rule.id;
            const attr = Object.keys(rule.conditions)[0] || "attribute";
            const rawVal = rule.conditions[attr];
            const op =
              typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)
                ? Object.keys(rawVal)[0] || "$eq"
                : "$eq";
            const displayVal =
              typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)
                ? formatValueForDisplay((rawVal as any)[op])
                : formatValueForDisplay(rawVal);
            const servedVal =
              rule.variation !== undefined ? rule.variation : rule.value;

            return (
              <div
                key={rule.id}
                className="flex flex-col gap-3 p-3.5 rounded-md border border-border/70 bg-card/40 hover:border-border transition-colors group"
              >
                {isEditing ? (
                  /* Edit Mode */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        value={editAttribute}
                        onChange={(e) => setEditAttribute(e.target.value)}
                        className="h-8 text-xs font-mono"
                        placeholder="Attribute"
                      />
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={editOperator}
                        onChange={(e) => setEditOperator(e.target.value)}
                      >
                        {operators.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 text-xs font-mono"
                        placeholder="Value"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Variation:</Label>
                        {flagType === "boolean" ? (
                          <select
                            className="h-7 rounded border border-input bg-background px-2 text-xs"
                            value={String(editVariation)}
                            onChange={(e) => setEditVariation(e.target.value === "true")}
                          >
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : (
                          <Input
                            value={editVariation}
                            onChange={(e) => setEditVariation(e.target.value)}
                            className="h-7 text-xs w-32"
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingRuleId(null)}
                          className="h-7 px-2 text-xs"
                        >
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(rule.id)}
                          className="h-7 px-2.5 text-xs"
                          disabled={loading}
                        >
                          <Check className="h-3 w-3 mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] h-5 px-1.5 bg-muted/60"
                      >
                        #{idx + 1}
                      </Badge>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">If</span>
                        <code className="font-mono font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {attr}
                        </code>
                        <span className="text-muted-foreground font-mono">
                          {op === "$eq"
                            ? "equals"
                            : op === "$in"
                            ? "in list"
                            : op.replace("$", "")}
                        </span>
                        <code className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded text-foreground">
                          {displayVal}
                        </code>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs pl-2 border-l border-border/60">
                        <span className="text-muted-foreground">then serve</span>
                        <Badge
                          className={`text-[11px] px-2 py-0 font-mono ${
                            String(servedVal) === "true"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : String(servedVal) === "false"
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          }`}
                        >
                          {String(servedVal)}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="flex items-center border-r border-border/40 pr-1 mr-1">
                        <button
                          type="button"
                          onClick={() => handleMoveRule(idx, "up")}
                          disabled={idx === 0 || loading}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                          title="Move priority up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveRule(idx, "down")}
                          disabled={idx === rules.length - 1 || loading}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                          title="Move priority down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(rule)}
                        disabled={loading}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit rule"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        disabled={loading}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
