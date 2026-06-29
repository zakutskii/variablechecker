import type { Finding, ScanScope, ScanSettings, ScanResult, ScannerProgress, ScanSummary } from "@/types";
import { ColorScanner } from "./color-scanner";
import { TypographyScanner } from "./typography-scanner";
import { EffectsScanner } from "./effects-scanner";
import { LayoutScanner } from "./layout-scanner";
import { Matcher } from "@/core/matcher/matcher";
import { VariableResolver } from "@/core/variables/variable-resolver";
import { StyleResolver } from "@/core/styles/style-resolver";
import { SCAN_BATCH_SIZE } from "@/shared/constants";

export type ProgressCallback = (progress: ScannerProgress) => void;

export class Scanner {
  private colorScanner: ColorScanner;
  private typographyScanner: TypographyScanner;
  private effectsScanner: EffectsScanner;
  private layoutScanner: LayoutScanner;
  private matcher: Matcher;
  private variableResolver: VariableResolver;
  private styleResolver: StyleResolver;
  private cancelled = false;

  constructor(
    variableResolver: VariableResolver,
    styleResolver: StyleResolver,
  ) {
    this.colorScanner = new ColorScanner();
    this.typographyScanner = new TypographyScanner();
    this.effectsScanner = new EffectsScanner();
    this.layoutScanner = new LayoutScanner();
    this.matcher = new Matcher(variableResolver, styleResolver);
    this.variableResolver = variableResolver;
    this.styleResolver = styleResolver;
  }

  setAccessibleVariableIds(ids: Set<string>): void {
    this.colorScanner.setAccessibleVariableIds(ids);
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

    console.log(`[DesignChecker] Scanner: collected ${totalLayers} nodes, scope=${scope}`);

    onProgress?.({
      phase: "scanning",
      totalLayers,
      scannedLayers: 0,
      findingsCount: 0,
      currentLayerName: "",
    });

    const allFindings: Finding[] = [];

    for (let i = 0; i < nodes.length; i += SCAN_BATCH_SIZE) {
      if (this.cancelled) {
        throw new Error("Scan cancelled");
      }

      const batch = nodes.slice(i, i + SCAN_BATCH_SIZE);

      for (const node of batch) {
        if (this.cancelled) throw new Error("Scan cancelled");

        try {
          const findings = this.scanNode(node, settings);
          allFindings.push(...findings);
        } catch (err) {
          console.error(`[DesignChecker] Error scanning node ${node.name} (${node.id}):`, err);
        }

        onProgress?.({
          phase: "scanning",
          totalLayers,
          scannedLayers: allFindings.length,
          findingsCount: allFindings.length,
          currentLayerName: node.name,
        });
      }

      await this.yieldToMainThread();
    }

    console.log(`[DesignChecker] Scanner: raw findings before matching: ${allFindings.length}`);
    console.log(`[DesignChecker] Scanner: raw findings by category:`, {
      color: allFindings.filter(f => f.category === "color").length,
      typography: allFindings.filter(f => f.category === "typography").length,
      effects: allFindings.filter(f => f.category === "effects").length,
      layout: allFindings.filter(f => f.category === "layout").length,
    });

    onProgress?.({
      phase: "matching",
      totalLayers,
      scannedLayers: totalLayers,
      findingsCount: allFindings.length,
      currentLayerName: "",
    });

    const matchedFindings = await this.matcher.matchFindings(
      allFindings,
      settings,
      onProgress,
    );

    const summary = this.generateSummary(matchedFindings, totalLayers);

    onProgress?.({
      phase: "complete",
      totalLayers,
      scannedLayers: totalLayers,
      findingsCount: matchedFindings.length,
      currentLayerName: "",
    });

    return {
      findings: matchedFindings,
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

  private scanNode(node: SceneNode, settings: ScanSettings): Finding[] {
    const findings: Finding[] = [];

    if (settings.safetySkipInstances && node.type === "INSTANCE") {
      return findings;
    }

    if (settings.safetySkipLibraryAssets) {
      if (node.type === "COMPONENT" || node.type === "INSTANCE") {
        const mainComponent = (node as InstanceNode).mainComponent;
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
      setTimeout(resolve, 0);
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
