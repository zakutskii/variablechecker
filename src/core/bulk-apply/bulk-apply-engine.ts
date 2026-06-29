import type { Finding, ApplyResult, ApplyError } from "@/types";
import { VariableResolver } from "@/core/variables/variable-resolver";
import { StyleResolver } from "@/core/styles/style-resolver";
import { SCAN_BATCH_SIZE } from "@/shared/constants";

export type ApplyProgressCallback = (current: number, total: number, message: string) => void;

export class BulkApplyEngine {
  private variableResolver: VariableResolver;
  private styleResolver: StyleResolver;
  private cancelled = false;
  private undoStack: Array<{ layerId: string; previousState: unknown }> = [];

  constructor(
    variableResolver: VariableResolver,
    styleResolver: StyleResolver,
  ) {
    this.variableResolver = variableResolver;
    this.styleResolver = styleResolver;
  }

  cancel(): void {
    this.cancelled = true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  getUndoDescription(): string | null {
    if (this.undoStack.length === 0) return null;
    return `Undo last apply operation (${this.undoStack.length} changes)`;
  }

  clearUndoStack(): void {
    this.undoStack = [];
  }

  async applySingle(
    finding: Finding,
    onProgress?: ApplyProgressCallback,
  ): Promise<ApplyResult> {
    return this.applyBatch([finding], onProgress);
  }

  async applySelected(
    findings: Finding[],
    onProgress?: ApplyProgressCallback,
  ): Promise<ApplyResult> {
    return this.applyBatch(findings, onProgress);
  }

  async applyAll(
    findings: Finding[],
    onProgress?: ApplyProgressCallback,
  ): Promise<ApplyResult> {
    const applicable = findings.filter((f) => f.suggestion !== null);
    return this.applyBatch(applicable, onProgress);
  }

  private async applyBatch(
    findings: Finding[],
    onProgress?: ApplyProgressCallback,
  ): Promise<ApplyResult> {
    this.cancelled = false;
    this.undoStack = [];

    const result: ApplyResult = {
      success: true,
      layersUpdated: 0,
      variablesLinked: 0,
      stylesApplied: 0,
      failedUpdates: 0,
      errors: [],
      duration: 0,
    };

    const startTime = Date.now();
    const total = findings.length;

    for (let i = 0; i < total; i += SCAN_BATCH_SIZE) {
      if (this.cancelled) {
        result.success = false;
        break;
      }

      const batch = findings.slice(i, i + SCAN_BATCH_SIZE);

      for (const finding of batch) {
        if (this.cancelled) break;

        try {
          onProgress?.(i + 1, total, `Applying to "${finding.layerName}"...`);

          const success = await this.applyFinding(finding);
          if (success) {
            result.layersUpdated++;
            if (finding.suggestion?.type === "variable") {
              result.variablesLinked++;
            } else if (finding.suggestion?.type === "style") {
              result.stylesApplied++;
            }
          } else {
            result.failedUpdates++;
            result.errors.push({
              layerId: finding.layerId,
              layerName: finding.layerName,
              findingId: finding.id,
              message: "Failed to apply suggestion",
            });
          }
        } catch (error) {
          result.failedUpdates++;
          result.errors.push({
            layerId: finding.layerId,
            layerName: finding.layerName,
            findingId: finding.id,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      await this.yieldToMainThread();
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  private async applyFinding(finding: Finding): Promise<boolean> {
    const suggestion = finding.suggestion;
    if (!suggestion) {
      console.log(`[Variable Checker] applyFinding: no suggestion for ${finding.id}`);
      return false;
    }

    const node = figma.getNodeById(finding.layerId) as SceneNode | null;
    if (!node) {
      console.log(`[Variable Checker] applyFinding: node not found ${finding.layerId}`);
      throw new Error(`Layer not found: ${finding.layerName}`);
    }

    console.log(`[Variable Checker] applyFinding: ${finding.id} type=${suggestion.type} varId=${suggestion.variableId} styleId=${suggestion.styleId}`);

    this.saveUndoState(node);

    if (suggestion.type === "variable" && suggestion.variableId) {
      return this.applyVariable(node, suggestion.variableId, finding);
    }

    if (suggestion.type === "style" && suggestion.styleId) {
      return this.applyStyle(node, suggestion.styleId, finding);
    }

    return false;
  }

  private applyVariable(
    node: SceneNode,
    variableId: string,
    finding: Finding,
  ): boolean {
    return this.variableResolver.bindVariableToNode(
      node,
      variableId,
      finding.property,
    );
  }

  private applyStyle(
    node: SceneNode,
    styleId: string,
    _finding: Finding,
  ): boolean {
    return this.styleResolver.applyStyleToNode(node, styleId);
  }

  private saveUndoState(node: SceneNode): void {
    try {
      const state: Record<string, unknown> = {};

      if ("fills" in node) {
        state.fills = JSON.parse(JSON.stringify(node.fills));
      }
      if ("strokes" in node) {
        state.strokes = JSON.parse(JSON.stringify(node.strokes));
      }
      if ("effects" in node) {
        state.effects = JSON.parse(JSON.stringify(node.effects));
      }
      if ("cornerRadius" in node) {
        state.cornerRadius = node.cornerRadius;
      }
      if ("itemSpacing" in node) {
        state.itemSpacing = node.itemSpacing;
      }

      this.undoStack.push({
        layerId: node.id,
        previousState: state,
      });
    } catch {
      console.warn("Failed to save undo state for", node.name);
    }
  }

  async undo(): Promise<boolean> {
    if (this.undoStack.length === 0) return false;

    const operations = [...this.undoStack].reverse();

    for (const op of operations) {
      try {
        const node = figma.getNodeById(op.layerId) as SceneNode | null;
        if (!node) continue;

        const state = op.previousState as Record<string, unknown>;
        if (state.fills && "fills" in node) {
          (node as GeometryMixin).fills = state.fills as Paint[];
        }
        if (state.strokes && "strokes" in node) {
          (node as GeometryMixin).strokes = state.strokes as Paint[];
        }
      } catch {
        console.warn("Failed to undo operation");
      }
    }

    this.undoStack = [];
    return true;
  }

  private async yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
