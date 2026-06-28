import type { Finding, ScanSettings, FigmaColor } from "@/types";
import { generateId, findParentChain } from "@/utils/helpers";
import { formatColorValue } from "@/utils/color";
import { isSolidColor, isGradient, getPaintColor } from "@/plugin/utils/color";

export class ColorScanner {
  scan(node: SceneNode, _settings: ScanSettings): Finding[] {
    const findings: Finding[] = [];
    const pageName = node.parent?.type === "PAGE" ? (node.parent as PageNode).name : "Unknown";

    if ("fills" in node && Array.isArray(node.fills)) {
      const fills = node.fills as Paint[];
      for (let i = 0; i < fills.length; i++) {
        const fill = fills[i];
        if (!fill) continue;

        if (isSolidColor(fill)) {
          const paint = fill as SolidPaint;
          const color = getPaintColor(paint);
          const boundFill = (node as GeometryMixin).boundVariables?.fill || paint.boundVariables?.color;

          if (!boundFill) {
            findings.push({
              id: generateId(),
              layerId: node.id,
              layerName: node.name,
              layerType: node.type,
              category: "color",
              property: `fill[${i}]`,
              currentValue: formatColorValue(color),
              suggestedValue: null,
              suggestion: null,
              confidence: 0,
              matchType: null,
              source: null,
              sourceName: null,
              parentChain: findParentChain(node),
              pageName,
            });
          }
        }

        if (isGradient(fill)) {
          findings.push({
            id: generateId(),
            layerId: node.id,
            layerName: node.name,
            layerType: node.type,
            category: "color",
            property: `fill[${i}]`,
            currentValue: `${fill.type} Gradient`,
            suggestedValue: null,
            suggestion: null,
            confidence: 0,
            matchType: null,
            source: null,
            sourceName: null,
            parentChain: findParentChain(node),
            pageName,
          });
        }
      }
    }

    if ("strokes" in node && Array.isArray(node.strokes)) {
      const strokes = node.strokes as Paint[];

      for (let i = 0; i < strokes.length; i++) {
        const stroke = strokes[i];
        if (!stroke) continue;

        if (isSolidColor(stroke)) {
          const paint = stroke as SolidPaint;
          const color = getPaintColor(paint);
          const boundStroke = (node as GeometryMixin).boundVariables?.stroke || paint.boundVariables?.color;

          if (!boundStroke) {
            findings.push({
              id: generateId(),
              layerId: node.id,
              layerName: node.name,
              layerType: node.type,
              category: "color",
              property: `stroke[${i}]`,
              currentValue: formatColorValue(color),
              suggestedValue: null,
              suggestion: null,
              confidence: 0,
              matchType: null,
              source: null,
              sourceName: null,
              parentChain: findParentChain(node),
              pageName,
            });
          }
        }
      }
    }

    return findings;
  }
}
