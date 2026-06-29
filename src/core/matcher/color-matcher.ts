import type { Finding, Suggestion, VariableInfo, StyleInfo, FigmaColor, ScanSettings } from "@/types";
import { hexToRgba, formatColorValue, colorSimilarity, isColorEqual } from "@/utils/color";
import { VariableResolver } from "@/core/variables/variable-resolver";
import { StyleResolver } from "@/core/styles/style-resolver";

export class ColorMatcher {
  private variableResolver: VariableResolver;
  private styleResolver: StyleResolver;
  private styleColorCache: Map<string, FigmaColor | null> = new Map();

  constructor(variableResolver: VariableResolver, styleResolver: StyleResolver) {
    this.variableResolver = variableResolver;
    this.styleResolver = styleResolver;
  }

  async match(
    finding: Finding,
    settings: ScanSettings,
  ): Promise<Suggestion | null> {
    if (finding.category !== "color") return null;

    const color = this.parseColorValue(finding.currentValue);
    if (!color) return null;

    const suggestions = await this.findColorSuggestions(color, settings);
    return suggestions[0] ?? null;
  }

  private parseColorValue(
    value: string,
  ): FigmaColor | null {
    if (value.startsWith("#")) {
      return hexToRgba(value);
    }

    if (value.startsWith("rgba")) {
      const match = value.match(
        /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/,
      );
      if (match) {
        return {
          r: parseInt(match[1]!) / 255,
          g: parseInt(match[2]!) / 255,
          b: parseInt(match[3]!) / 255,
          a: parseFloat(match[4]!),
        };
      }
    }

    if (value.startsWith("rgb")) {
      const match = value.match(
        /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/,
      );
      if (match) {
        return {
          r: parseInt(match[1]!) / 255,
          g: parseInt(match[2]!) / 255,
          b: parseInt(match[3]!) / 255,
          a: 1,
        };
      }
    }

    return null;
  }

  private async findColorSuggestions(
    color: FigmaColor,
    settings: ScanSettings,
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    if (settings.matchColorVariables) {
      const localVars = this.variableResolver.getLocalVariables();

      for (const variable of localVars) {
        if (variable.type !== "COLOR") continue;
        const varColor = variable.value as FigmaColor;

        if (isColorEqual(color, varColor)) {
          suggestions.push({
            variableId: variable.id,
            styleId: null,
            name: variable.name,
            type: "variable",
            category: "color",
            confidence: 100,
            matchType: "exact",
            distance: 0,
            source: "local",
          });
        } else if (!settings.exactMatchOnly) {
          const similarity = colorSimilarity(color, varColor);
          if (similarity >= settings.similarityThreshold) {
            suggestions.push({
              variableId: variable.id,
              styleId: null,
              name: variable.name,
              type: "variable",
              category: "color",
              confidence: Math.round(similarity * 100),
              matchType: "similar",
              distance: Math.round((1 - similarity) * 1000) / 1000,
              source: "local",
            });
          }
        }
      }

      const libraryVars = this.variableResolver.getLibraryVariables();
      for (const variable of libraryVars) {
        if (variable.type !== "COLOR") continue;
        const varColor = variable.value as FigmaColor;

        if (isColorEqual(color, varColor)) {
          suggestions.push({
            variableId: variable.id,
            styleId: null,
            name: variable.name,
            type: "variable",
            category: "color",
            confidence: 100,
            matchType: "exact",
            distance: 0,
            source: "library",
            libraryName: variable.libraryName,
          });
        } else if (!settings.exactMatchOnly) {
          const similarity = colorSimilarity(color, varColor);
          if (similarity >= settings.similarityThreshold) {
            suggestions.push({
              variableId: variable.id,
              styleId: null,
              name: variable.name,
              type: "variable",
              category: "color",
              confidence: Math.round(similarity * 100),
              matchType: "similar",
              distance: Math.round((1 - similarity) * 1000) / 1000,
              source: "library",
              libraryName: variable.libraryName,
            });
          }
        }
      }
    }

    if (settings.matchColorStyles) {
      const localStyles = this.styleResolver.getColorStyles();
      for (const style of localStyles) {
        const styleColor = this.getStyleColor(style);
        if (!styleColor) continue;

        if (isColorEqual(color, styleColor)) {
          suggestions.push({
            variableId: null,
            styleId: style.id,
            name: style.name,
            type: "style",
            category: "color",
            confidence: 100,
            matchType: "exact",
            distance: 0,
            source: "local",
          });
        } else if (!settings.exactMatchOnly) {
          const similarity = colorSimilarity(color, styleColor);
          if (similarity >= settings.similarityThreshold) {
            suggestions.push({
              variableId: null,
              styleId: style.id,
              name: style.name,
              type: "style",
              category: "color",
              confidence: Math.round(similarity * 100),
              matchType: "similar",
              distance: Math.round((1 - similarity) * 1000) / 1000,
              source: "local",
            });
          }
        }
      }

      const libraryStyles = this.styleResolver.getLibraryStyles();
      for (const style of libraryStyles) {
        const styleColor = this.getStyleColor(style);
        if (!styleColor) continue;

        if (isColorEqual(color, styleColor)) {
          suggestions.push({
            variableId: null,
            styleId: style.id,
            name: style.name,
            type: "style",
            category: "color",
            confidence: 100,
            matchType: "exact",
            distance: 0,
            source: "library",
            libraryName: style.libraryName,
          });
        }
      }
    }

    suggestions.sort((a, b) => {
      const priorityOrder = (s: Suggestion): number => {
        if (s.source === "local" && s.type === "variable") return 0;
        if (s.source === "local" && s.type === "style") return 1;
        if (s.source === "library" && s.type === "variable") return 2;
        if (s.source === "library" && s.type === "style") return 3;
        return 4;
      };

      const priorityDiff = priorityOrder(a) - priorityOrder(b);
      if (priorityDiff !== 0) return priorityDiff;

      return b.confidence - a.confidence;
    });

    return suggestions;
  }

  private getStyleColor(style: StyleInfo): FigmaColor | null {
    if (this.styleColorCache.has(style.id)) return this.styleColorCache.get(style.id)!;
    try {
      const paintStyle = figma.getStyleById(style.id) as PaintStyle | null;
      if (!paintStyle) {
        this.styleColorCache.set(style.id, null);
        return null;
      }

      const paints = paintStyle.paints;
      if (paints.length === 0) {
        this.styleColorCache.set(style.id, null);
        return null;
      }

      const firstPaint = paints[0];
      if (firstPaint.type !== "SOLID") {
        this.styleColorCache.set(style.id, null);
        return null;
      }

      const solidPaint = firstPaint as SolidPaint;
      const color: FigmaColor = {
        r: solidPaint.color.r,
        g: solidPaint.color.g,
        b: solidPaint.color.b,
        a: solidPaint.opacity ?? 1,
      };
      this.styleColorCache.set(style.id, color);
      return color;
    } catch {
      this.styleColorCache.set(style.id, null);
      return null;
    }
  }
}
