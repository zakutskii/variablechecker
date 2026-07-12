import type { Finding, ScanScope, ScanSettings, ScanResult, ScannerProgress, ScanSummary } from "@/types";
import { ColorScanner } from "./color-scanner";
import { TypographyScanner } from "./typography-scanner";
import { EffectsScanner } from "./effects-scanner";
import { LayoutScanner } from "./layout-scanner";
import { VariableResolver } from "@/core/variables/variable-resolver";
import { StyleResolver } from "@/core/styles/style-resolver";
import { SCAN_BATCH_SIZE } from "@/shared/constants";

export type ProgressCallback = (progress: ScannerProgress) => void;

export class Scanner {
  private colorScanner: ColorScanner;
  private typographyScanner: TypographyScanner;
  private effectsScanner: EffectsScanner;
  private layoutScanner: LayoutScanner;
  private styleResolver: StyleResolver;
  private cancelled = false;

  constructor(
    _variableResolver: VariableResolver,
    styleResolver: StyleResolver,
  ) {
    this.colorScanner = new ColorScanner();
    this.typographyScanner = new TypographyScanner();
    this.effectsScanner = new EffectsScanner();
    this.layoutScanner = new LayoutScanner();
    this.styleResolver = styleResolver;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async scan(
    scope: ScanScope,
    settings: ScanSettings,
    onProgress?: ProgressCallback,
  ): Promise<ScanResult> {
    this.cancelled = false;

    const nodes = await this.collectNodes(scope, settings);
    const totalLayers = nodes.length;

    console.log(`[Variable Checker] Scanner: collected ${totalLayers} nodes, scope=${scope}`);

    onProgress?.({
      phase: "scanning",
      totalLayers,
      scannedLayers: 0,
      findingsCount: 0,
      currentLayerName: "",
    });

    const allFindings: Finding[] = [];
    let scannedCount = 0;

    console.log(`[Variable Checker] Scanner: starting scan loop for ${nodes.length} nodes`);

    for (let i = 0; i < nodes.length; i += SCAN_BATCH_SIZE) {
      if (this.cancelled) {
        throw new Error("Scan cancelled");
      }

      const batch = nodes.slice(i, i + SCAN_BATCH_SIZE);

      for (const node of batch) {
        if (this.cancelled) throw new Error("Scan cancelled");

        try {
          const findings = await this.scanNode(node, settings);
          allFindings.push(...findings);
        } catch (err) {
          console.error(`[Variable Checker] Error scanning node ${node.name} (${node.id}):`, err);
        }

        scannedCount++;
      }

      try {
        onProgress?.({
          phase: "scanning",
          totalLayers,
          scannedLayers: scannedCount,
          findingsCount: allFindings.length,
          currentLayerName: batch[batch.length - 1]?.name ?? "",
        });
      } catch {
        // ignore progress errors
      }

      await this.yieldToMainThread();
    }

    console.log(`[Variable Checker] Scanner: scan loop done, ${allFindings.length} findings from ${scannedCount} nodes`);

    console.log(`[Variable Checker] Scanner: scanned ${scannedCount} nodes, ${allFindings.length} findings`);

    const summary = this.generateSummary(allFindings, totalLayers);

    onProgress?.({
      phase: "complete",
      totalLayers,
      scannedLayers: totalLayers,
      findingsCount: allFindings.length,
      currentLayerName: "",
    });

    return {
      findings: allFindings,
      summary,
      timestamp: Date.now(),
      scope,
    };
  }

  private async collectNodes(scope: ScanScope, settings: ScanSettings): Promise<SceneNode[]> {
    const nodes: SceneNode[] = [];

    switch (scope) {
      case "selection":
        for (const node of figma.currentPage.selection) {
          this.collectAllNodes(node, nodes, settings);
        }
        break;

      case "page":
        for (const node of figma.currentPage.children) {
          this.collectAllNodes(node, nodes, settings);
        }
        break;

      case "file": {
        const pages = figma.root.children;
        for (const page of pages) {
          for (const node of page.children) {
            this.collectAllNodes(node, nodes, settings);
          }
        }
        break;
      }
    }

    return nodes;
  }

  private collectAllNodes(node: SceneNode, result: SceneNode[], settings: ScanSettings): void {
    if (this.cancelled) return;

    if (settings.safetySkipInstances && node.type === "INSTANCE") {
      return;
    }

    result.push(node);

    if ("children" in node) {
      const children = node.children as SceneNode[];
      for (const child of children) {
        this.collectAllNodes(child, result, settings);
      }
    }
  }

  private async scanNode(node: SceneNode, settings: ScanSettings): Promise<Finding[]> {
    const findings: Finding[] = [];

    if (settings.safetySkipInstances && node.type === "INSTANCE") {
      return findings;
    }

    if (settings.safetySkipLibraryAssets) {
      if (node.type === "INSTANCE") {
        const mainComponent = await (node as InstanceNode).getMainComponentAsync();
        if (mainComponent && mainComponent.parent?.type === "COMPONENT_SET") {
          return findings;
        }
      }
    }

    if (settings.scanColors) {
      findings.push(...this.colorScanner.scan(node, settings));
    }

    if (settings.scanTypography) {
      findings.push(...this.typographyScanner.scan(node, settings));
    }

    if (settings.scanEffects) {
      findings.push(...this.effectsScanner.scan(node, settings));
    }

    if (settings.scanLayout) {
      findings.push(...this.layoutScanner.scan(node, settings));
    }

    return findings;
  }

  private async yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }

  private generateSummary(
    findings: Finding[],
    totalLayers: number,
  ): ScanSummary {
    const breakdown: Record<string, number> = {
      color: 0,
      typography: 0,
      effects: 0,
      layout: 0,
      variable: 0,
    };

    for (const finding of findings) {
      breakdown[finding.category] = (breakdown[finding.category] ?? 0) + 1;
    }

    const variablesFound = findings.filter((f) => f.source === "variable").length;
    const stylesFound = findings.filter((f) => f.source === "style").length;
    const potentialFixes = findings.filter((f) => f.suggestion !== null).length;

    return {
      totalLayersScanned: totalLayers,
      hardcodedValuesFound: findings.length,
      variablesFound,
      stylesFound,
      potentialFixes,
      categoriesBreakdown: breakdown as ScanSummary["categoriesBreakdown"],
    };
  }
}
