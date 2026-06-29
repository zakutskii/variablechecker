import type { Finding, ScanSettings } from "@/types";
import { generateId, findParentChain } from "@/utils/helpers";
import { formatTypographyProperties } from "@/utils/typography";
import { extractTypographyProperties } from "@/plugin/utils/typography";

export class TypographyScanner {
  scan(node: SceneNode, _settings: ScanSettings): Finding[] {
    if (node.type !== "TEXT") return [];

    const textNode = node as TextNode;
    const pageName = node.parent?.type === "PAGE" ? (node.parent as PageNode).name : "Unknown";

    if (!!textNode.textStyleId) return [];

    const props = extractTypographyProperties(textNode);
    const formatted = formatTypographyProperties(props);
    const parts: string[] = [];
    if (props.fontFamily) parts.push(String(props.fontFamily));
    if (props.fontSize) parts.push(`${props.fontSize}px`);
    if (props.fontWeight) parts.push(String(props.fontWeight));
    if (props.lineHeight) parts.push(`LH ${props.lineHeight}${props.lineHeightUnit === "PERCENT" ? "%" : "px"}`);

    return [{
      id: generateId(),
      layerId: node.id,
      layerName: node.name,
      layerType: node.type,
      category: "typography",
      property: "textStyle",
      currentValue: parts.join(" / ") || "Unstyled",
      suggestedValue: null,
      suggestion: null,
      confidence: 0,
      matchType: null,
      source: null,
      sourceName: null,
      parentChain: findParentChain(node),
      pageName,
    }];
  }
}
