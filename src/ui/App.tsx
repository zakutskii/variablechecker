import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { Badge } from "@/ui/components/ui/badge";
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

function getDimensionSection(finding: Finding): string {
  const prop = finding.property;
  if (/^cornerRadius/i.test(prop)) return "Corner radius";
  if (/^padding/i.test(prop)) return "Auto layout";
  if (/^itemSpacing|counterAxisSpacing/i.test(prop)) return "Horizontal gap between objects";
  if (/^(minWidth|maxWidth|width)/i.test(prop)) return "Horizontal size";
  if (/^(minHeight|maxHeight|height)/i.test(prop)) return "Vertical size";
  if (finding.category === "effects") {
    return finding.currentValue.split(":")[0]?.trim() || "Effects";
  }
  return "Other";
}

const DIMENSION_SECTIONS = ["Corner radius", "Auto layout", "Horizontal gap between objects", "Horizontal size", "Vertical size"];

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
  const [findings, setFindings] = useState<Finding[]>([]);
  const [availableVariables, setAvailableVariables] = useState<VariableInfo[]>([]);
  const [availableStyles, setAvailableStyles] = useState<StyleInfo[]>([]);
  const applyPendingRef = useRef(0);
  const applyStatsRef = useRef({ updated: 0, failed: 0 });
  const [scanScope, setScanScope] = useState<ScanScope>("selection");
  const [activeTab, setActiveTab] = useState("color");
  const [isApplying, setIsApplying] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [appliedFindingIds, setAppliedFindingIds] = useState<Set<string>>(new Set());
  const [optionSearch, setOptionSearch] = useState("");
  const [dimensionSection, setDimensionSection] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage;
      if (!message) return;
      switch (message.type) {
        case "scan-progress":
          setProgress(message.payload);
          break;
        case "findings-chunk":
          setFindings((prev) => [...prev, ...message.payload.findings]);
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
              applyStatsRef.current.updated += r.layersUpdated;
              applyStatsRef.current.failed += r.failedUpdates || 0;
            } else if (r.errors?.length > 0) {
              applyStatsRef.current.failed += r.errors.length;
            }
          }
          applyPendingRef.current--;
          if (applyPendingRef.current <= 0) {
            setIsApplying(false);
            const s = applyStatsRef.current;
            if (s.updated > 0) {
              toast("Changes applied", {
                description: `${s.updated} layer${s.updated !== 1 ? "s" : ""} updated${s.failed > 0 ? `, ${s.failed} failed` : ""}`,
              });
            } else if (s.failed > 0) {
              toast("Apply failed", { description: `${s.failed} update${s.failed !== 1 ? "s" : ""} failed` });
            }
            applyStatsRef.current = { updated: 0, failed: 0 };
          }
          break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const visibleFindings = useMemo(() => {
    if (findings.length === 0 && !scanResult) return [];
    const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
    let filtered = getTabFindings(findings, tab).filter((f) => !appliedFindingIds.has(f.id));
    if (activeTab === "dimension" && dimensionSection) {
      filtered = filtered.filter((f) => getDimensionSection(f) === dimensionSection);
    }
    return filtered;
  }, [findings, scanResult, activeTab, appliedFindingIds, dimensionSection]);

  const tabOptionsMap = useMemo(() => {
    const map: Record<string, Option[]> = {};
    for (const tab of TABS) map[tab.id] = getOptionsForTab(tab, availableVariables, availableStyles);
    return map;
  }, [availableVariables, availableStyles]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(visibleFindings.length / pageSize)), [visibleFindings]);

  const pageFindings = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleFindings.slice(start, start + pageSize);
  }, [visibleFindings, page, pageSize]);

  const grouped = useMemo(() => {
    const groups: Record<string, { label: string; findings: Finding[] }> = {};
    for (const f of pageFindings) {
      const key = f.layerId;
      if (!groups[key]) {
        groups[key] = { label: f.layerName, findings: [] };
      }
      groups[key].findings.push(f);
    }
    return Object.entries(groups);
  }, [pageFindings]);

  const options = useMemo(() => tabOptionsMap[activeTab] ?? [], [tabOptionsMap, activeTab]);

  const applyableCount = useMemo(
    () => visibleFindings.filter((f) => f.suggestion || selectedOptions[f.id]).length,
    [visibleFindings, selectedOptions],
  );

  const uniqueLayers = useMemo(
    () => new Set(visibleFindings.map((f) => f.layerId)).size,
    [visibleFindings],
  );

  useEffect(() => {
    setPage(1);
    if (activeTab !== "dimension") setDimensionSection("");
  }, [activeTab, findings]);
  const startScan = useCallback(() => {
    setIsScanning(true);
    setProgress(null);
    setScanResult(null);
    setFindings([]);
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

    const totalOps = manualList.length + (autoIds.length > 0 ? 1 : 0);
    if (totalOps === 0) {
      setIsApplying(false);
      return;
    }

    applyPendingRef.current = totalOps;
    applyStatsRef.current = { updated: 0, failed: 0 };

    for (const m of manualList) {
      parent.postMessage({ pluginMessage: { type: "apply-manual", ...m } }, "*");
    }
    if (autoIds.length > 0) {
      parent.postMessage({ pluginMessage: { type: "apply-selected", findingIds: autoIds } }, "*");
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
                const count = getTabFindings(findings, t).filter(
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
          {activeTab === "dimension" && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Badge
                variant={dimensionSection === "" ? "default" : "outline"}
                className={"cursor-pointer text-[11px] px-2 py-0.5" + (dimensionSection !== "" ? " font-normal" : "")}
                onClick={() => { setDimensionSection(""); setPage(1); }}
              >
                All
              </Badge>
              {DIMENSION_SECTIONS.map((s) => (
                <Badge
                  key={s}
                  variant={dimensionSection === s ? "default" : "outline"}
                  className={"cursor-pointer text-[11px] px-2 py-0.5" + (dimensionSection !== s ? " font-normal" : "")}
                  onClick={() => { setDimensionSection(s); setPage(1); }}
                >
                  {s}
                </Badge>
              ))}
            </div>
          )}
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
            <>
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
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-1 pb-3 pr-3">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ‹
                </Button>
                <span className="text-[11px] text-muted-foreground min-w-[40px] text-center">{page}/{totalPages}</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  ›
                </Button>
              </div>
            )}
          </ScrollArea>
          </>
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
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-base font-semibold">Variable Checker</h1>
              <span className="text-[10px] font-medium text-muted-foreground border border-border rounded-md px-1.5 py-0.5">Beta</span>
            </div>
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
