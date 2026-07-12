import type { Finding, Suggestion, StyleInfo, ScanSettings } from "@/types";
import type { TypographyProperties } from "@/utils/typography";
import { StyleResolver } from "@/core/styles/style-resolver";
import { extractTypographyProperties } from "@/plugin/utils/typography";
import { typographyPropertiesMatch } from "@/utils/typography";

export class TypographyMatcher {
  private styleResolver: StyleResolver;

  constructor(styleResolver: StyleResolver) {
    this.styleResolver = styleResolver;
  }

  async match(
    finding: Finding,
    settings: ScanSettings,
  ): Promise<Suggestion | null> {
    if (finding.category !== "typography" || !settings.matchTextStyles) return null;

    const textStyles = this.styleResolver.getTextStyles();
    const node = await figma.getNodeByIdAsync(finding.layerId) as TextNode | null;
    if (!node || node.type !== "TEXT") return null;

    const layerProps = extractTypographyProperties(node);
    const candidates: { style: StyleInfo; score: number; matchType: "exact" | "similar" }[] = [];

    for (const style of textStyles) {
      const textStyle = figma.getStyleById(style.id) as TextStyle | null;
      if (!textStyle) continue;

      const styleProps = extractTypographyPropertiesFromStyle(textStyle);
      const result = typographyPropertiesMatch(layerProps, styleProps);

      if (result.matchCount > 0) {
        const maxProps = 6;
        const score = result.matchCount / maxProps;
        candidates.push({
          style,
          score: Math.round(score * 100),
          matchType: score >= 0.99 ? "exact" : "similar",
        });
      }
    }

    candidates.sort((a, b) => {
      const localA = a.style.source === "local" ? 0 : 1;
      const localB = b.style.source === "local" ? 0 : 1;
      if (localA !== localB) return localA - localB;
      return b.score - a.score;
    });

    const best = candidates[0];
    if (!best || best.score < 10) return null;

    return {
      variableId: null,
      styleId: best.style.id,
      name: best.style.name,
      type: "style",
      category: "typography",
      confidence: best.score,
      matchType: best.matchType,
      distance: Math.round((100 - best.score) / 10) / 10,
      source: best.style.source,
      libraryName: best.style.libraryName,
    };
  }
}

function extractTypographyPropertiesFromStyle(style: TextStyle): TypographyProperties {
  try {
    const fontName = style.fontName as FontName;
    const family = fontName.family;
    const weight = parseFontWeight(fontName.style);
    const fontSize = style.fontSize as number;

    return {
      fontFamily: family,
      fontWeight: weight,
      fontSize,
      lineHeight: null,
      lineHeightUnit: null,
      letterSpacing: null,
      paragraphSpacing: null,
      paragraphIndent: null,
      textCase: null,
      textDecoration: null,
    };
  } catch {
    return {
      fontFamily: null,
      fontWeight: null,
      fontSize: null,
      lineHeight: null,
      lineHeightUnit: null,
      letterSpacing: null,
      paragraphSpacing: null,
      paragraphIndent: null,
      textCase: null,
      textDecoration: null,
    };
  }
}

function parseFontWeight(style: string): number {
  const weightMap: Record<string, number> = {
    thin: 100, hairline: 100, extralight: 200, ultralight: 200,
    light: 300, regular: 400, normal: 400, medium: 500,
    semibold: 600, demibold: 600, bold: 700, extrabold: 800,
    ultrabold: 800, black: 900, heavy: 900,
  };
  const lower = style.toLowerCase();
  if (weightMap[lower]) return weightMap[lower];
  const num = parseInt(style, 10);
  if (!isNaN(num)) return num;
  return 400;
}
