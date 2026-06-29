import type { VariableInfo, FigmaColor } from "@/types";

export class VariableResolver {
  private cache: Map<string, VariableInfo[]> = new Map();
  private allVariables: VariableInfo[] = [];
  private accessibleVariableIds: Set<string> = new Set();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const localVariables = await this.collectLocalVariables();
      const libraryVariables = await this.collectLibraryVariables();
      this.allVariables = [...localVariables, ...libraryVariables];
      this.accessibleVariableIds = new Set(this.allVariables.map(v => v.id));
      this.buildCache();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize VariableResolver:", error);
      throw error;
    }
  }

  getAccessibleVariableIds(): Set<string> {
    return this.accessibleVariableIds;
  }

  private async collectLocalVariables(): Promise<VariableInfo[]> {
    const variables: VariableInfo[] = [];
    const collections = figma.variables?.getLocalVariableCollections() ?? [];

    for (const collection of collections) {
      const variableIds = collection.variableIds;
      for (const variableId of variableIds) {
        const variable = figma.variables?.getVariableById(variableId);
        if (!variable) continue;

        const resolvedValue = variable.valuesByMode[collection.defaultModeId];
        if (resolvedValue === undefined) continue;

        variables.push({
          id: variable.id,
          name: variable.name,
          type: variable.resolvedType === "COLOR"
            ? "COLOR"
            : variable.resolvedType === "FLOAT"
              ? "FLOAT"
              : variable.resolvedType === "STRING"
                ? "STRING"
                : "BOOLEAN",
          resolvedType: variable.resolvedType,
          value: resolvedValue as VariableInfo["value"],
          source: "local",
          remote: false,
          key: variable.key,
        });
      }
    }
    return variables;
  }

  private async collectLibraryVariables(): Promise<VariableInfo[]> {
    const variables: VariableInfo[] = [];

    try {
      const collections = await figma.teamLibrary?.getVariableCollectionsAsync();
      if (!collections) return variables;

      for (const collection of collections) {
        for (const variableRef of collection.variableReferences ?? []) {
          const variable = figma.variables?.getVariableById(variableRef.id);
          if (!variable) continue;

          const resolvedValue = variable.valuesByMode[collection.defaultModeId];
          if (resolvedValue === undefined) continue;

          variables.push({
            id: variable.id,
            name: variable.name,
            type: variable.resolvedType === "COLOR"
              ? "COLOR"
              : variable.resolvedType === "FLOAT"
                ? "FLOAT"
                : variable.resolvedType === "STRING"
                  ? "STRING"
                  : "BOOLEAN",
            resolvedType: variable.resolvedType,
            value: resolvedValue as VariableInfo["value"],
            source: "library",
            libraryName: collection.name,
            remote: true,
            key: variable.key,
          });
        }
      }
    } catch {
      console.warn("Could not access team library variables");
    }

    return variables;
  }

  private buildCache(): void {
    this.cache.clear();

    for (const variable of this.allVariables) {
      const key = this.getVariableCacheKey(variable);
      const existing = this.cache.get(key) ?? [];
      existing.push(variable);
      this.cache.set(key, existing);
    }
  }

  private getVariableCacheKey(variable: VariableInfo): string {
    const value = variable.value;
    if (typeof value === "object" && value !== null && "r" in value) {
      return `color:${(value as FigmaColor).r.toFixed(3)}:${(value as FigmaColor).g.toFixed(3)}:${(value as FigmaColor).b.toFixed(3)}:${(value as FigmaColor).a?.toFixed(3) ?? "1.000"}`;
    }
    if (typeof value === "number") {
      return `float:${value}`;
    }
    if (typeof value === "string") {
      return `string:${value}`;
    }
    if (typeof value === "boolean") {
      return `boolean:${value}`;
    }
    return `unknown:${String(value)}`;
  }

  getVariables(): VariableInfo[] {
    return this.allVariables;
  }

  getColorVariables(): VariableInfo[] {
    return this.allVariables.filter((v) => v.type === "COLOR");
  }

  getFloatVariables(): VariableInfo[] {
    return this.allVariables.filter((v) => v.type === "FLOAT");
  }

  getLocalVariables(): VariableInfo[] {
    return this.allVariables.filter((v) => v.source === "local");
  }

  getLibraryVariables(): VariableInfo[] {
    return this.allVariables.filter((v) => v.source === "library");
  }

  findExactMatch(value: unknown, type: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN"): VariableInfo | undefined {
    const key = this.getExactMatchKey(value, type);
    if (!key) return undefined;

    const candidates = this.cache.get(key);
    if (!candidates || candidates.length === 0) return undefined;

    return candidates[0];
  }

  private getExactMatchKey(value: unknown, type: string): string | undefined {
    if (type === "COLOR" && typeof value === "object" && value !== null) {
      const c = value as FigmaColor;
      return `color:${c.r.toFixed(3)}:${c.g.toFixed(3)}:${c.b.toFixed(3)}:${(c.a ?? 1).toFixed(3)}`;
    }
    if (type === "FLOAT" && typeof value === "number") {
      return `float:${value}`;
    }
    if (type === "STRING" && typeof value === "string") {
      return `string:${value}`;
    }
    if (type === "BOOLEAN" && typeof value === "boolean") {
      return `boolean:${value}`;
    }
    return undefined;
  }

  findSimilarColor(
    color: FigmaColor,
    threshold: number = 0.95,
  ): VariableInfo[] {
    const colorVars = this.getColorVariables();
    const results: { variable: VariableInfo; distance: number }[] = [];

    for (const variable of colorVars) {
      const v = variable.value as FigmaColor;
      const dr = color.r - v.r;
      const dg = color.g - v.g;
      const db = color.b - v.b;
      const da = (color.a ?? 1) - (v.a ?? 1);
      const distance = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
      const similarity = 1 - Math.min(1, distance / Math.SQRT2);

      if (similarity >= threshold) {
        results.push({ variable, distance });
      }
    }

    results.sort((a, b) => a.distance - b.distance);
    return results.map((r) => r.variable);
  }

  bindVariableToNode(
    node: SceneNode,
    variableId: string,
    property: string,
  ): boolean {
    try {
      const variable = figma.variables?.getVariableById(variableId);
      if (!variable) {
        console.error(`[DesignChecker] Variable not found: ${variableId}`);
        return false;
      }

      const collection = figma.variables?.getVariableCollectionById(
        variable.variableCollectionId,
      );
      if (!collection) {
        console.error(`[DesignChecker] Collection not found for variable: ${variable.name}`);
        return false;
      }

      const modeId = collection.defaultModeId;

      console.log(`[DesignChecker] bindVariableToNode: ${node.name} type=${node.type} prop=${property} var=${variable.name} col=${collection.name} mode=${modeId}`);

      if (
        property.startsWith("fill") &&
        "fillStyleId" in node &&
        typeof node.fillStyleId === "string"
      ) {
        return this.applyBoundVariableOrColor(
          node,
          "fills",
          variable,
          modeId,
          "fill",
        );
      }

      if (
        property.startsWith("stroke") &&
        "strokeStyleId" in node &&
        typeof node.strokeStyleId === "string"
      ) {
        return this.applyBoundVariableOrColor(
          node,
          "strokes",
          variable,
          modeId,
          "stroke",
        );
      }

      return this.bindNumericProperty(node, property, variable, modeId);
    } catch (e) {
      console.error(`[DesignChecker] bindVariableToNode unexpected error for ${node.name}:`, e);
      return false;
    }
  }

  private applyBoundVariableOrColor(
    node: SceneNode,
    fillsOrStrokes: "fills" | "strokes",
    variable: Variable,
    modeId: string,
    _propertyPrefix: string,
  ): boolean {
    try {
      if (typeof figma.variables?.bindVariableToAlias === "function") {
        try {
          const boundPaints = figma.variables.bindVariableToAlias(
            node,
            fillsOrStrokes,
            variable,
            modeId,
          );
          if (boundPaints) {
            (node as GeometryMixin)[fillsOrStrokes] = boundPaints;
            return true;
          }
        } catch (e) {
          console.error(`[DesignChecker] bindVariableToAlias failed, falling back to direct color:`, e);
        }
      }

      // Try setting boundVariables directly for variable binding
      try {
        const aliasKey = fillsOrStrokes === "fills" ? "fill" : "stroke";
        (node as GeometryMixin).boundVariables = {
          ...((node as GeometryMixin).boundVariables || {}),
          [aliasKey]: [{ id: variable.id, type: "VARIABLE_ALIAS" }],
        };
        console.log(`[DesignChecker] boundVariables set directly for ${node.name}`);
        return true;
      } catch (e) {
        console.log(`[DesignChecker] boundVariables not writable on ${node.name}, using color fallback:`, e);
      }

      const resolvedValue = variable.valuesByMode[modeId];
      if (!resolvedValue || typeof resolvedValue !== "object" || !("r" in resolvedValue)) {
        console.error(`[DesignChecker] Variable ${variable.name} has no color value for mode ${modeId}`);
        return false;
      }

      const { r, g, b, a } = resolvedValue as { r: number; g: number; b: number; a?: number };

      const freshPaints: SolidPaint[] = [{
        type: "SOLID",
        color: { r, g, b },
        opacity: a ?? 1,
        blendMode: "NORMAL",
        visible: true,
        boundVariables: {
          color: {
            type: "VARIABLE_ALIAS",
            id: variable.id,
          },
        },
      }];

      // Log original paint before modification
      const origPaints = (node as GeometryMixin)[fillsOrStrokes];
      const origColor = Array.isArray(origPaints) && origPaints.length > 0 && origPaints[0].type === "SOLID"
        ? `${(origPaints[0] as SolidPaint).color.r.toFixed(2)},${(origPaints[0] as SolidPaint).color.g.toFixed(2)},${(origPaints[0] as SolidPaint).color.b.toFixed(2)}`
        : "no-solid-paint";

      (node as GeometryMixin)[fillsOrStrokes] = freshPaints;

      // Verify the assignment took effect
      const verifyPaints = (node as GeometryMixin)[fillsOrStrokes];
      const verifyColor = Array.isArray(verifyPaints) && verifyPaints.length > 0
        ? `${(verifyPaints[0] as SolidPaint).color.r.toFixed(2)},${(verifyPaints[0] as SolidPaint).color.g.toFixed(2)},${(verifyPaints[0] as SolidPaint).color.b.toFixed(2)}`
        : "no-paints";
      const changed = origColor !== verifyColor;
      console.log(`[DesignChecker] ${fillsOrStrokes} on ${node.name}: was=${origColor} set=${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)} verify=${verifyColor} changed=${changed}`);
      return true;
    } catch (e) {
      console.error(`[DesignChecker] applyBoundVariableOrColor failed for ${node.name}:`, e);
      return false;
    }
  }

  private bindNumericProperty(
    node: SceneNode,
    property: string,
    variable: Variable,
    modeId: string,
  ): boolean {
    try {
      const resolvedValue = variable.valuesByMode[modeId];
      if (typeof resolvedValue !== "number") {
        return false;
      }

      const value = resolvedValue;

      try {
        (node as GeometryMixin).boundVariables = {
          ...((node as GeometryMixin).boundVariables || {}),
          [property]: { id: variable.id, type: "VARIABLE_ALIAS" },
        };
      } catch {
        // boundVariables setter unavailable, set value directly
      }

      switch (property) {
        case "width":
        case "height": {
          if (typeof (node as InstanceNode).resize === "function") {
            const w = property === "width" ? value : (node as InstanceNode).width;
            const h = property === "height" ? value : (node as InstanceNode).height;
            (node as InstanceNode).resize(w, h);
            return true;
          }
          return false;
        }
        case "minWidth":
        case "maxWidth":
        case "minHeight":
        case "maxHeight":
        case "cornerRadius":
        case "itemSpacing":
        case "gap":
        case "paddingTop":
        case "paddingBottom":
        case "paddingLeft":
        case "paddingRight":
          if (property in node) {
            (node as Record<string, unknown>)[property] = value;
            return true;
          }
          return false;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  clearCache(): void {
    this.cache.clear();
    this.allVariables = [];
    this.initialized = false;
  }
}
