import type { Finding, ScanSummary, ApplyResult, ReportData, ScanScope } from "@/types";
import { generateCsv } from "@/utils/helpers";

export class ReportGenerator {
  generate(
    findings: Finding[],
    summary: ScanSummary,
    applyResult: ApplyResult | null,
    scope: ScanScope,
    duration: number,
  ): ReportData {
    return {
      summary,
      findings,
      applyResult,
      timestamp: Date.now(),
      duration,
      scope,
    };
  }

  toJson(report: ReportData): string {
    return JSON.stringify(report, null, 2);
  }

  toCsv(findings: Finding[]): string {
    return generateCsv(findings);
  }

  generateSummaryText(report: ReportData): string {
    const lines: string[] = [
      "Variable Checker - Audit Report",
      "============================",
      "",
      `Generated: ${new Date(report.timestamp).toLocaleString()}`,
      `Scan Scope: ${report.scope}`,
      `Duration: ${this.formatDuration(report.duration)}`,
      "",
      "Summary:",
      `  Total Layers Scanned: ${report.summary.totalLayersScanned}`,
      `  Hardcoded Values Found: ${report.summary.hardcodedValuesFound}`,
      `  Variables Found: ${report.summary.variablesFound}`,
      `  Styles Found: ${report.summary.stylesFound}`,
      `  Potential Fixes: ${report.summary.potentialFixes}`,
      "",
      "Breakdown by Category:",
    ];

    for (const [category, count] of Object.entries(report.summary.categoriesBreakdown)) {
      lines.push(`  ${category}: ${count}`);
    }

    if (report.applyResult) {
      lines.push(
        "",
        "Apply Results:",
        `  Layers Updated: ${report.applyResult.layersUpdated}`,
        `  Variables Linked: ${report.applyResult.variablesLinked}`,
        `  Styles Applied: ${report.applyResult.stylesApplied}`,
        `  Failed Updates: ${report.applyResult.failedUpdates}`,
      );

      if (report.applyResult.errors.length > 0) {
        lines.push("", "Errors:");
        for (const error of report.applyResult.errors) {
          lines.push(`  [${error.layerName}] ${error.message}`);
        }
      }
    }

    return lines.join("\n");
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}
