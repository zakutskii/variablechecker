import { Scanner } from "@/core/scanner/scanner";
import { Matcher } from "@/core/matcher/matcher";
import { VariableResolver } from "@/core/variables/variable-resolver";
import { StyleResolver } from "@/core/styles/style-resolver";
import { BulkApplyEngine } from "@/core/bulk-apply/bulk-apply-engine";
import { ReportGenerator } from "@/core/reporting/report-generator";
import type {
  PluginMessage,
  ScanResult,
  ScanSettings,
  ApplyResult,
  Finding,
  FindingFilter,
  ReportData,
} from "@/types";

let variableResolver: VariableResolver;
let styleResolver: StyleResolver;
let scanner: Scanner;
let matcher: Matcher;
let bulkApplyEngine: BulkApplyEngine;
let reportGenerator: ReportGenerator;

let currentScanResult: ScanResult | null = null;
let lastApplyResult: ApplyResult | null = null;
let scanStartTime: number = 0;

function initialize(): void {
  variableResolver = new VariableResolver();
  styleResolver = new StyleResolver();
  scanner = new Scanner(variableResolver, styleResolver);
  matcher = new Matcher(variableResolver, styleResolver);
  bulkApplyEngine = new BulkApplyEngine(variableResolver, styleResolver);
  reportGenerator = new ReportGenerator();
}

figma.on("run", async () => {
  initialize();
  figma.showUI(__html__, { width: 480, height: 600, title: "Variable Checker" });
});

figma.on("selectionchange", () => {
  figma.ui.postMessage({
    type: "selection-changed",
    payload: {
      count: figma.currentPage.selection.length,
    },
  });
});

figma.ui.onmessage = async (message: PluginMessage) => {
  console.log(`[DesignChecker] onmessage: ${message.type}`, JSON.stringify(message).slice(0, 200));
  switch (message.type) {
    case "start-scan":
      await handleStartScan(message.scope, message.settings);
      break;
    case "cancel-scan":
      handleCancelScan();
      break;
    case "apply-fix":
      await handleApplyFix(message.findingId);
      break;
    case "apply-selected":
      await handleApplySelected(message.findingIds);
      break;
    case "apply-all":
      await handleApplyAll();
      break;
    case "jump-to-layer":
      handleJumpToLayer(message.layerId);
      break;
    case "request-report":
      await handleRequestReport();
      break;
    case "request-findings":
      handleRequestFindings(message.filter, message.page, message.pageSize);
      break;
    case "undo-last-operation":
      await handleUndo();
      break;
    case "request-options":
      handleRequestOptions(message.category);
      break;
    case "apply-manual":
      await handleApplyManual(message.findingId, message.variableId, message.styleId);
      break;
  }
};

async function handleStartScan(scope: string, settings?: ScanSettings): Promise<void> {
  scanStartTime = Date.now();

  try {
    await variableResolver.initialize();
    await styleResolver.initialize();

    const finalSettings: ScanSettings = settings ?? {
      scanColors: true,
      scanTypography: true,
      scanEffects: true,
      scanLayout: true,
      scanVariables: true,
      exactMatchOnly: false,
      similarityThreshold: 0.9,
      matchColorVariables: true,
      matchColorStyles: true,
      matchTextStyles: true,
      matchEffectStyles: true,
      matchNumberVariables: true,
      safetySkipLibraryAssets: true,
      safetySkipInstances: true,
      safetyConfirmBulkActions: true,
      performanceBatchSize: 500,
      performanceAsyncProcessing: true,
    };

    const scanResult = await scanner.scan(
      scope as ScanResult["scope"],
      finalSettings,
      (progress) => {
        figma.ui.postMessage({
          type: "scan-progress",
          payload: progress,
        });
      },
    );

    currentScanResult = scanResult;

    figma.ui.postMessage({
      type: "scan-complete",
      payload: currentScanResult,
    });

    figma.ui.postMessage({
      type: "assets-data",
      payload: {
        variables: variableResolver.getVariables(),
        styles: styleResolver.getStyles(),
      },
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "scan-error",
      payload: {
        message: error instanceof Error ? error.message : "Scan failed",
      },
    });
  }
}

function handleCancelScan(): void {
  scanner.cancel();
  bulkApplyEngine.cancel();
}

async function handleApplyFix(findingId: string): Promise<void> {
  if (!currentScanResult) return;

  const finding = currentScanResult.findings.find((f) => f.id === findingId);
  if (!finding) return;

  const result = await bulkApplyEngine.applySingle(finding, (current, total, message) => {
    figma.ui.postMessage({
      type: "apply-progress",
      payload: { current, total, message },
    });
  });

  lastApplyResult = result;

  figma.ui.postMessage({
    type: "apply-complete",
    payload: result,
  });
}

async function handleApplySelected(findingIds: string[]): Promise<void> {
  if (!currentScanResult) {
    console.log(`[DesignChecker] handleApplySelected: no scan result`);
    return;
  }

  const findings = currentScanResult.findings.filter((f) =>
    findingIds.includes(f.id),
  );

  console.log(`[DesignChecker] handleApplySelected: ${findingIds.length} requested, ${findings.length} found`);

  if (findings.length === 0) {
    figma.ui.postMessage({
      type: "apply-complete",
      payload: {
        success: false,
        layersUpdated: 0,
        variablesLinked: 0,
        stylesApplied: 0,
        failedUpdates: 0,
        errors: [{ layerId: "", layerName: "", findingId: "", message: "Findings not found, please re-scan" }],
        duration: 0,
      },
    });
    return;
  }

  const result = await bulkApplyEngine.applySelected(findings, (current, total, message) => {
    figma.ui.postMessage({
      type: "apply-progress",
      payload: { current, total, message },
    });
  });

  console.log(`[DesignChecker] handleApplySelected result:`, JSON.stringify(result));

  lastApplyResult = result;

  figma.ui.postMessage({
    type: "apply-complete",
    payload: { ...result, appliedFindingIds: findingIds },
  });
}

async function handleApplyAll(): Promise<void> {
  if (!currentScanResult) return;

  const result = await bulkApplyEngine.applyAll(
    currentScanResult.findings,
    (current, total, message) => {
      figma.ui.postMessage({
        type: "apply-progress",
        payload: { current, total, message },
      });
    },
  );

  lastApplyResult = result;

  figma.ui.postMessage({
    type: "apply-complete",
    payload: result,
  });
}

function handleJumpToLayer(layerId: string): void {
  try {
    const node = figma.getNodeById(layerId);
    if (node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
      const sceneNode = node as SceneNode;
      figma.currentPage.selection = [sceneNode];
      figma.viewport.scrollAndZoomIntoView([sceneNode]);
    }
  } catch (e) {
    console.error("Jump to layer failed:", e);
  }
}

async function handleRequestReport(): Promise<void> {
  if (!currentScanResult) return;

  const duration = Date.now() - scanStartTime;

  const reportData: ReportData = reportGenerator.generate(
    currentScanResult.findings,
    currentScanResult.summary,
    lastApplyResult,
    currentScanResult.scope,
    duration,
  );

  figma.ui.postMessage({
    type: "report-data",
    payload: reportData,
  } as import("@/types/messages").ReportDataMessage);
}

function handleRequestFindings(
  filter: FindingFilter,
  page: number,
  pageSize: number,
): void {
  if (!currentScanResult) return;

  let filtered = [...currentScanResult.findings];

  if (filter.category !== "all") {
    filtered = filtered.filter((f) => f.category === filter.category);
  }

  if (filter.matchType !== "all") {
    filtered = filtered.filter((f) => f.matchType === filter.matchType);
  }

  if (filter.source !== "all") {
    if (filter.source === "both") {
      filtered = filtered.filter((f) => f.source !== null);
    } else if (filter.source === "none") {
      filtered = filtered.filter((f) => f.source === null);
    } else {
      filtered = filtered.filter((f) => f.source === filter.source);
    }
  }

  if (filter.searchQuery) {
    const query = filter.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (f) =>
        f.layerName.toLowerCase().includes(query) ||
        f.currentValue.toLowerCase().includes(query) ||
        (f.suggestedValue && f.suggestedValue.toLowerCase().includes(query)) ||
        f.property.toLowerCase().includes(query),
    );
  }

  if (filter.minConfidence > 0) {
    filtered = filtered.filter((f) => f.confidence >= filter.minConfidence);
  }

  if (filter.maxConfidence < 100) {
    filtered = filtered.filter((f) => f.confidence <= filter.maxConfidence);
  }

  filtered.sort((a, b) => {
    const getSortValue = (f: Finding): string | number => {
      switch (filter.sortBy) {
        case "confidence":
          return f.confidence;
        case "category":
          return f.category;
        case "layer":
          return f.layerName;
        case "property":
          return f.property;
        case "currentValue":
          return f.currentValue;
        default:
          return f.confidence;
      }
    };

    const aVal = getSortValue(a);
    const bVal = getSortValue(b);

    if (typeof aVal === "number" && typeof bVal === "number") {
      return filter.sortOrder === "desc" ? bVal - aVal : aVal - bVal;
    }

    const cmp = String(aVal).localeCompare(String(bVal));
    return filter.sortOrder === "desc" ? -cmp : cmp;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  figma.ui.postMessage({
    type: "findings-data",
    payload: {
      findings: paginated,
      total,
      page,
      pageSize,
    },
  } as import("@/types/messages").FindingsDataMessage);
}

async function handleUndo(): Promise<void> {
  const success = await bulkApplyEngine.undo();
  figma.ui.postMessage({
    type: "undo-status",
    payload: {
      canUndo: success,
      operationDescription: success ? "Undo completed" : "Nothing to undo",
    },
  } as import("@/types/messages").UndoStatusMessage);
}

function handleRequestOptions(category: string): void {
  let variables: import("@/types").VariableInfo[] = [];
  let styles: import("@/types").StyleInfo[] = [];

  switch (category) {
    case "color":
      variables = variableResolver.getColorVariables();
      styles = styleResolver.getColorStyles();
      break;
    case "effects":
    case "dimension":
      variables = variableResolver.getFloatVariables();
      styles = styleResolver.getEffectStyles();
      break;
    case "typography":
      variables = [];
      styles = styleResolver.getTextStyles();
      break;
    case "variable":
    case "components":
      variables = variableResolver.getVariables();
      styles = [];
      break;
    default:
      variables = variableResolver.getVariables();
      styles = styleResolver.getStyles();
  }

  figma.ui.postMessage({
    type: "options-data",
    payload: { category, variables, styles },
  } as import("@/types/messages").OptionsDataMessage);
}

async function handleApplyManual(
  findingId: string,
  variableId: string | null | undefined,
  styleId: string | null | undefined,
): Promise<void> {
  if (!currentScanResult) {
    console.log(`[DesignChecker] handleApplyManual: no scan result`);
    return;
  }

  const finding = currentScanResult.findings.find((f) => f.id === findingId);
  if (!finding) {
    console.log(`[DesignChecker] handleApplyManual: finding ${findingId} not found`);
    return;
  }

  if (!finding.suggestion) {
    if (!variableId && !styleId) return;
    finding.suggestion = {
      variableId: variableId ?? null,
      styleId: styleId ?? null,
      name: "",
      type: variableId ? "variable" : "style",
      category: finding.category,
      confidence: 100,
      matchType: "exact",
      distance: 0,
      source: "local",
    };
  } else {
    if (variableId) finding.suggestion.variableId = variableId;
    if (styleId) finding.suggestion.styleId = styleId;
  }

  const result = await bulkApplyEngine.applySingle(finding, (current, total, message) => {
    figma.ui.postMessage({
      type: "apply-progress",
      payload: { current, total, message },
    });
  });

  figma.ui.postMessage({
    type: "apply-complete",
    payload: { ...result, appliedFindingIds: [findingId] },
  });
}
