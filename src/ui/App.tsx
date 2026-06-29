import { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/ui/components/ui/button";
import { Progress } from "@/ui/components/ui/progress";
import { ScrollArea } from "@/ui/components/ui/scroll-area";
import { Toaster } from "@/ui/components/ui/sonner";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/ui/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import type { ScanScope, Finding, ScanResult, VariableInfo, StyleInfo, FigmaColor } from "@/types";

function parseColorValue(value: string): string | null {
  if (value.startsWith("#")) return value;
  const rgba256 = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgba256) {
    const [, r, g, b, a] = rgba256;
    return a ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  }
  const rgba01 = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgba01) {
    const [, r, g, b, a] = rgba01;
    const to255 = (v: string) => Math.round(parseFloat(v) * 255);
    return a ? `rgba(${to255(r)},${to255(g)},${to255(b)},${a})` : `rgb(${to255(r)},${to255(g)},${to255(b)})`;
  }
  return null;
}

function ColorSwatch({ value, className }: { value: string; className?: string }) {
  const color = parseColorValue(value);
  if (!color) return null;
  return (
    <span
      className={`block rounded-sm shrink-0 ${className ?? ""}`}
      style={{ backgroundColor: color, border: "1px solid rgba(0,0,0,0.1)" }}
    />
  );
}

interface TabInfo {
  id: string;
  label: string;
  categories: string[];
}

const TABS: TabInfo[] = [
  { id: "color", label: "Colors", categories: ["color"] },
  { id: "dimension", label: "Dimension", categories: ["effects", "layout"] },
  { id: "typography", label: "Typography", categories: ["typography"] },
];

function getTabFindings(findings: Finding[], tab: TabInfo): Finding[] {
  const base = findings.filter((f) => tab.categories.includes(f.category));
  if (tab.id === "dimension") {
    return base.filter((f) => f.layerType !== "TEXT");
  }
  return base;
}

interface Option {
  label: string;
  value: string;
  type: "variable" | "style";
  color?: string;
}

function figmaColorToCss(c: FigmaColor): string {
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a})`;
}

function getOptionsForTab(tab: TabInfo, variables: VariableInfo[], styles: StyleInfo[]): Option[] {
  const opts: Option[] = [];
  if (tab.id === "color") {
    for (const v of variables.filter((v) => v.type === "COLOR"))
      opts.push({ label: v.name, value: v.id, type: "variable", color: figmaColorToCss(v.value as FigmaColor) });
    for (const s of styles.filter((s) => s.type === "FILL")) opts.push({ label: s.name, value: s.id, type: "style" });
  } else if (tab.id === "dimension") {
    for (const v of variables.filter((v) => v.type === "FLOAT")) opts.push({ label: v.name, value: v.id, type: "variable" });
    for (const s of styles.filter((s) => s.type === "EFFECT")) opts.push({ label: s.name, value: s.id, type: "style" });
  } else if (tab.id === "typography") {
    for (const s of styles.filter((s) => s.type === "TEXT")) opts.push({ label: s.name, value: s.id, type: "style" });
  }
  return opts;
}

const triggerBaseClass =
  "flex items-center gap-1 min-w-0 flex-1 h-6 text-[11px] bg-transparent px-2 rounded-md border border-input shadow-sm truncate hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{ scannedLayers: number; totalLayers: number; phase: string; findingsCount: number } | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [availableVariables, setAvailableVariables] = useState<VariableInfo[]>([]);
  const [availableStyles, setAvailableStyles] = useState<StyleInfo[]>([]);
  const [scanScope, setScanScope] = useState<ScanScope>("selection");
  const [activeTab, setActiveTab] = useState("color");
  const [isApplying, setIsApplying] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [appliedFindingIds, setAppliedFindingIds] = useState<Set<string>>(new Set());
  const [optionSearch, setOptionSearch] = useState("");

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage;
      if (!message) return;
      switch (message.type) {
        case "scan-progress":
          setProgress(message.payload);
          break;
        case "scan-complete":
          setScanResult(message.payload);
          setIsScanning(false);
          setProgress(null);
          setAppliedFindingIds(new Set());
          break;
        case "assets-data":
          setAvailableVariables(message.payload.variables ?? []);
          setAvailableStyles(message.payload.styles ?? []);
          break;
        case "scan-error":
          setIsScanning(false);
          setProgress(null);
          toast("Scan failed", { description: message.payload?.message ?? "Unknown error" });
          break;
        case "apply-complete":
          setIsApplying(false);
          if (message.payload) {
            const r = message.payload;
            if (r.success && r.layersUpdated > 0) {
              if (r.appliedFindingIds) {
                setAppliedFindingIds((prev) => {
                  const next = new Set(prev);
                  for (const id of r.appliedFindingIds!) next.add(id);
                  return next;
                });
              }
              toast(`${r.layersUpdated} layer${r.layersUpdated !== 1 ? "s" : ""} updated`, {
                description: r.failedUpdates > 0 ? `${r.failedUpdates} failed` : undefined,
              });
            } else if (r.errors?.length > 0) {
              toast("Apply failed", { description: r.errors[0]?.message ?? "Unknown error" });
            }
          }
          break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const visibleFindings = useMemo(() => {
    if (!scanResult) return [];
    const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
    return getTabFindings(scanResult.findings, tab).filter((f) => !appliedFindingIds.has(f.id));
  }, [scanResult, activeTab, appliedFindingIds]);

  const tabOptionsMap = useMemo(() => {
    const map: Record<string, Option[]> = {};
    for (const tab of TABS) map[tab.id] = getOptionsForTab(tab, availableVariables, availableStyles);
    return map;
  }, [availableVariables, availableStyles]);

  const grouped = useMemo(() => {
    const groups: Record<string, { label: string; findings: Finding[] }> = {};
    for (const f of visibleFindings) {
      const key = f.layerId;
      if (!groups[key]) {
        groups[key] = { label: f.layerName, findings: [] };
      }
      groups[key].findings.push(f);
    }
    return Object.entries(groups);
  }, [visibleFindings]);

  const options = useMemo(() => tabOptionsMap[activeTab] ?? [], [tabOptionsMap, activeTab]);

  const applyableCount = useMemo(
    () => visibleFindings.filter((f) => f.suggestion || selectedOptions[f.id]).length,
    [visibleFindings, selectedOptions],
  );

  const uniqueLayers = useMemo(
    () => new Set(visibleFindings.map((f) => f.layerId)).size,
    [visibleFindings],
  );

  const startScan = useCallback(() => {
    setIsScanning(true);
    setProgress(null);
    setScanResult(null);
    setSelectedOptions({});
    setAvailableVariables([]);
    setAvailableStyles([]);
    setAppliedFindingIds(new Set());
    parent.postMessage({ pluginMessage: { type: "start-scan", scope: scanScope } }, "*");
  }, [scanScope]);

  const cancelScan = useCallback(() => {
    parent.postMessage({ pluginMessage: { type: "cancel-scan" } }, "*");
    setIsScanning(false);
  }, []);

  const jumpToLayer = useCallback((layerId: string) => {
    parent.postMessage({ pluginMessage: { type: "jump-to-layer", layerId } }, "*");
  }, []);

  const applyAll = useCallback(() => {
    if (!scanResult) return;
    setIsApplying(true);

    const autoIds: string[] = [];
    const manualList: { findingId: string; variableId: string | null; styleId: string | null }[] = [];

    for (const f of visibleFindings) {
      const custom = selectedOptions[f.id];
      const suggestedId = f.suggestion?.variableId ?? f.suggestion?.styleId;

      if (custom && custom !== suggestedId) {
        const isVar = availableVariables.some((v) => v.id === custom);
        manualList.push({ findingId: f.id, variableId: isVar ? custom : null, styleId: isVar ? null : custom });
      } else if (f.suggestion) {
        autoIds.push(f.id);
      } else if (custom) {
        const isVar = availableVariables.some((v) => v.id === custom);
        manualList.push({ findingId: f.id, variableId: isVar ? custom : null, styleId: isVar ? null : custom });
      }
    }

    for (const m of manualList) {
      parent.postMessage({ pluginMessage: { type: "apply-manual", ...m } }, "*");
    }
    if (autoIds.length > 0) {
      parent.postMessage({ pluginMessage: { type: "apply-selected", findingIds: autoIds } }, "*");
    }
    if (manualList.length === 0 && autoIds.length === 0) {
      setIsApplying(false);
    }
  }, [scanResult, visibleFindings, selectedOptions, availableVariables, availableStyles]);

  if (isScanning) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-xs space-y-4 text-center">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold">Scanning...</h2>
          {progress && (
            <div className="space-y-2">
              <Progress value={progress.totalLayers > 0 ? (progress.scannedLayers / progress.totalLayers) * 100 : 0} />
              <p className="text-xs text-muted-foreground">{progress.scannedLayers}/{progress.totalLayers} layers · {progress.findingsCount} findings</p>
            </div>
          )}
          <Button variant="destructive" onClick={cancelScan} className="w-full" size="sm">Cancel</Button>
        </div>
        <Toaster />
      </div>
    );
  }

  if (scanResult) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <div className="shrink-0 px-3 pt-3 pb-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              {TABS.map((t) => {
                const count = getTabFindings(scanResult.findings, t).filter(
                  (f) => !appliedFindingIds.has(f.id),
                ).length;
                return (
                  <TabsTrigger key={t.id} value={t.id} className="flex-1 text-xs gap-1.5 p-1.5">
                    <span className="truncate">{t.label}</span>
                    <span className="rounded-full min-w-[20px] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted-foreground/15 leading-none text-center">
                      {count}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {Object.entries(grouped).length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-sm font-medium text-foreground/80">All clear</p>
                <p className="text-[11px] text-muted-foreground/60">Every value in this tab already uses variables or styles</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="px-3 pb-3 space-y-3">
              {grouped.map(([groupKey, group]) => (
                <div key={groupKey}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground">{group.label}</span>
                    <span className="text-[11px] text-muted-foreground">({group.findings.length})</span>
                  </div>
                  {group.findings.map((finding) => {
                    const currentVal = selectedOptions[finding.id] ?? finding.suggestion?.variableId ?? finding.suggestion?.styleId ?? "";

                    return (
                      <div key={finding.id} className="flex items-center gap-1.5 py-1.5 w-full">
                        <button
                          onClick={() => jumpToLayer(finding.layerId)}
                          className={`${triggerBaseClass} cursor-pointer text-left`}
                        >
                          <ColorSwatch value={finding.currentValue} className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{finding.currentValue}</span>
                        </button>
                        <span className="text-[11px] text-muted-foreground shrink-0">→</span>
                        <div className="flex-1 min-w-0">
                          {options.length > 0 ? (
                            <Select
                              value={currentVal}
                              onValueChange={(v) => setSelectedOptions((prev) => ({ ...prev, [finding.id]: v }))}
                              onOpenChange={(open) => { if (!open) setOptionSearch(""); }}
                            >
                              <SelectTrigger className="h-6 text-[11px] w-full px-2 hover:bg-accent hover:text-accent-foreground">
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="px-2 pt-1.5 pb-1">
                                  <input
                                    placeholder="Search..."
                                    value={optionSearch}
                                    onChange={(e) => setOptionSearch(e.target.value)}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="flex h-7 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm outline-none focus:ring-1 focus:ring-ring"
                                  />
                                </div>
                                {options
                                  .filter((o) => o.label.toLowerCase().includes(optionSearch.toLowerCase()))
                                  .map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                                      <span className="flex items-center gap-1.5">
                                        {opt.color && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: opt.color }} />}
                                        <span>{opt.label}</span>
                                      </span>
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">No suggestion</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>
          )}

        <div className="border-t p-3 flex items-center justify-between shrink-0 bg-muted/30">
          <p className="text-[11px] text-muted-foreground">
            Update <span className="font-medium text-foreground">{applyableCount}</span>{" "}
            {TABS.find((t) => t.id === activeTab)?.label.toLowerCase() ?? "items"} across{" "}
            <span className="font-medium text-foreground">{uniqueLayers}</span> item{uniqueLayers !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startScan}>
              Rescan
            </Button>
            <Button variant="default" size="sm" className="h-7 text-xs" disabled={isApplying || applyableCount === 0} onClick={applyAll}>
              {isApplying ? "Applying..." : applyableCount > 0 ? `Apply (${applyableCount})` : "Apply"}
            </Button>
          </div>
        </div>

        <Toaster />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div className="space-y-1 mb-6">
            <h1 className="text-base font-semibold">Variable Checker</h1>
            <p className="text-xs text-muted-foreground">Find and fix hardcoded values in your designs</p>
          </div>
          <div className="flex flex-col gap-6">
            <Tabs value={scanScope} onValueChange={(v) => setScanScope(v as ScanScope)}>
              <TabsList className="w-full">
                <TabsTrigger value="selection" className="flex-1 text-xs p-1.5">Selection</TabsTrigger>
                <TabsTrigger value="page" className="flex-1 text-xs p-1.5">Page</TabsTrigger>
                <TabsTrigger value="file" className="flex-1 text-xs p-1.5">File</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={startScan} className="w-full" size="sm">Run Scan</Button>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
