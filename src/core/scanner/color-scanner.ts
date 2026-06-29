import type { Finding, ScanSettings, FigmaColor } from "@/types";
import { generateId, findParentChain } from "@/utils/helpers";
import { formatColorValue } from "@/utils/color";
import { isSolidColor, isGradient, getPaintColor } from "@/plugin/utils/color";

export class ColorScanner {
  scan(node: SceneNode, _settings: ScanSettings): Finding[] {
    const findings: Finding[] = [];
    const pageName = node.parent?.type === "PAGE" ? (node.parent as PageNode).name : "Unknown";

    console.log(`[DesignChecker] ColorScanner.scan: node=${node.name} type=${node.type}`);

    if ("fills" in node && Array.isArray(node.fills)) {
      const fills = node.fills as Paint[];
      console.log(`[DesignChecker] ColorScanner: node=${node.name} fills.length=${fills.length}`);
      for (let i = 0; i < fills.length; i++) {
        const fill = fills[i];
        if (!fill) continue;

        console.log(`[DesignChecker] ColorScanner: fill[${i}] type=${fill.type}`);

        if (isSolidColor(fill)) {
          const paint = fill as SolidPaint;
          const color = getPaintColor(paint);
          const fillStyleId = "fillStyleId" in node ? (node as GeometryMixin).fillStyleId : null;
          const nodeBV = (node as SceneNode & { boundVariables?: Record<string, unknown> }).boundVariables;
          const paintBV = (paint as Record<string, unknown>).boundVariables;
          const hasStyle = !!fillStyleId;
          const hasNodeVariable = nodeBV?.fill != null;
          const hasPaintVariable = paintBV?.color != null;

          console.log(`[DesignChecker] ColorScanner: fill[${i}] nodeBV=`, nodeBV?.fill, ` paintBV=`, paintBV?.color);
          console.log(`[DesignChecker] ColorScanner: fill[${i}] hasStyle=${hasStyle} hasNodeVar=${hasNodeVariable} hasPaintVar=${hasPaintVariable}`);

          if (!hasStyle && !hasNodeVariable && !hasPaintVariable) {
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
    } else {
      console.log(`[DesignChecker] ColorScanner: node=${node.name} has no fills property`);
    }

    if ("strokes" in node && Array.isArray(node.strokes)) {
      const strokes = node.strokes as Paint[];
      console.log(`[DesignChecker] ColorScanner: node=${node.name} strokes.length=${strokes.length}`);

      for (let i = 0; i < strokes.length; i++) {
        const stroke = strokes[i];
        if (!stroke) continue;

        console.log(`[DesignChecker] ColorScanner: stroke[${i}] type=${stroke.type}`);

        if (isSolidColor(stroke)) {
          const paint = stroke as SolidPaint;
          const color = getPaintColor(paint);
          const strokeStyleId = "strokeStyleId" in node ? (node as GeometryMixin).strokeStyleId : null;
          const nodeBV = (node as SceneNode & { boundVariables?: Record<string, unknown> }).boundVariables;
          const paintBV = (paint as Record<string, unknown>).boundVariables;
          const hasStyle = !!strokeStyleId;
          const hasNodeVariable = nodeBV?.stroke != null;
          const hasPaintVariable = paintBV?.color != null;

          console.log(`[DesignChecker] ColorScanner: stroke[${i}] nodeBV=`, nodeBV?.stroke, ` paintBV=`, paintBV?.color);
          console.log(`[DesignChecker] ColorScanner: stroke[${i}] hasStyle=${hasStyle} hasNodeVar=${hasNodeVariable} hasPaintVar=${hasPaintVariable}`);

          if (!hasStyle && !hasNodeVariable && !hasPaintVariable) {
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

    console.log(`[DesignChecker] ColorScanner: node=${node.name} findings=${findings.length}`);
    return findings;
  }
}
