import type { Finding, ScanSettings, ScannerProgress } from "@/types";
import { ColorMatcher } from "./color-matcher";
import { TypographyMatcher } from "./typography-matcher";
import { VariableMatcher } from "./variable-matcher";
import { VariableResolver } from "@/core/variables/variable-resolver";
import { StyleResolver } from "@/core/styles/style-resolver";

export type MatchProgressCallback = (progress: ScannerProgress) => void;

export class Matcher {
  private colorMatcher: ColorMatcher;
  private typographyMatcher: TypographyMatcher;
  private variableMatcher: VariableMatcher;

  constructor(variableResolver: VariableResolver, styleResolver: StyleResolver) {
    this.colorMatcher = new ColorMatcher(variableResolver, styleResolver);
    this.typographyMatcher = new TypographyMatcher(styleResolver);
    this.variableMatcher = new VariableMatcher(variableResolver);
  }

  async matchFindings(
    findings: Finding[],
    settings: ScanSettings,
    onProgress?: MatchProgressCallback,
  ): Promise<Finding[]> {
    const matched: Finding[] = [];
    const total = findings.length;

    for (let i = 0; i < total; i++) {
      const finding = findings[i]!;
      let suggestion = null;

      switch (finding.category) {
        case "color":
          suggestion = await this.colorMatcher.match(finding, settings);
          break;
        case "typography":
          suggestion = await this.typographyMatcher.match(finding, settings);
          break;
        case "layout":
        case "variable":
          suggestion = await this.variableMatcher.match(finding, settings);
          break;
        case "effects":
          suggestion = null;
          break;
      }

      if (suggestion) {
        matched.push({
          ...finding,
          suggestedValue: suggestion.name,
          suggestion,
          confidence: suggestion.confidence,
          matchType: suggestion.matchType,
          source: suggestion.type === "variable" ? "variable" : "style",
          sourceName: suggestion.name,
        });
      } else {
        matched.push(finding);
      }

      if (i % 10 === 0) {
        try {
          onProgress?.({
            phase: "matching",
            totalLayers: total,
            scannedLayers: i,
            findingsCount: matched.length,
            currentLayerName: "",
          });
        } catch {
          // ignore
        }

        await this.yieldToMainThread();
      }
    }

    return matched;
  }

  private async yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
