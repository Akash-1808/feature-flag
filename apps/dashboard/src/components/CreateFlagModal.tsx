"use client";

import React, { useState, useEffect } from "react";
import { Plus, Loader2, Flag, KeyRound, AlignLeft, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";

interface CreateFlagModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (newFlag: any) => void;
}

export function CreateFlagModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateFlagModalProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [type, setType] = useState("boolean");
  const [loading, setLoading] = useState(false);

  // Auto-slugify name to key unless user manually typed in key field
  useEffect(() => {
    if (!keyManuallyEdited) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setKey(slug);
    }
  }, [name, keyManuallyEdited]);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyManuallyEdited(true);
    setKey(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) {
      toast.error("Flag Name and Key are required.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post("/api/flags", {
        name: name.trim(),
        key: key.trim(),
        description: description.trim() || null,
        type,
      });

      toast.success("Feature flag created successfully!");
      onSuccess(response);
      onOpenChange(false);
      // Reset form
      setName("");
      setKey("");
      setDescription("");
      setType("boolean");
      setKeyManuallyEdited(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create feature flag.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/60 bg-card shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
              <Flag className="h-4 w-4" />
            </div>
            Create Feature Flag
          </DialogTitle>
          <DialogDescription>
            Create a new flag to control features across your environments.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Flag Name */}
          <div className="space-y-2">
            <Label htmlFor="flag-name">Flag Name</Label>
            <Input
              id="flag-name"
              placeholder="e.g. New Checkout UI"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Flag Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="flag-key">Unique Key</Label>
              <span className="text-[11px] text-muted-foreground">
                Used in SDK code
              </span>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="flag-key"
                placeholder="new-checkout-ui"
                className="pl-9 font-mono text-xs"
                value={key}
                onChange={handleKeyChange}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="flag-desc">Description (Optional)</Label>
            <div className="relative">
              <AlignLeft className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="flag-desc"
                placeholder="What does this flag control?"
                className="pl-9 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Flag Type */}
          <div className="space-y-2">
            <Label htmlFor="flag-type">Flag Type</Label>
            <select
              id="flag-type"
              className="w-full flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={loading}
            >
              <option value="boolean">Boolean (On / Off)</option>
              <option value="string">String (Text / Variant ID)</option>
              <option value="number">Number (Thresholds / Limits)</option>
              <option value="json">JSON (Complex Configuration)</option>
            </select>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" className="gap-2" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Flag
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
