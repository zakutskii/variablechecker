"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/shared/constants.ts
  var SCAN_BATCH_SIZE = 100;

  // src/utils/helpers.ts
  function generateId() {
    return `f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  function findParentChain(node) {
    const chain = [];
    let current = node;
    while (current) {
      chain.unshift(String(current.name));
      const parent = current.parent;
      current = parent !== null && parent !== void 0 ? parent : null;
    }
    return chain;
  }
  function escapeCsvField(value) {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  function generateCsv(findings) {
    const headers = ["Type", "Layer", "Current Value", "Suggested Replacement", "Confidence", "Match Type", "Category", "Page"];
    const rows = findings.map((f) => {
      var _a, _b;
      return [
        f.layerType,
        f.layerName,
        f.currentValue,
        (_a = f.suggestedValue) != null ? _a : "",
        String(f.confidence),
        (_b = f.matchType) != null ? _b : "",
        f.category,
        f.pageName
      ];
    });
    const headerLine = headers.map(escapeCsvField).join(",");
    const dataLines = rows.map((row) => row.map(escapeCsvField).join(","));
    return [headerLine, ...dataLines].join("\n");
  }

  // src/utils/color.ts
  function rgbaToHex(r, g, b, a = 1) {
    const toHex = (n) => {
      const clamped = Math.round(Math.max(0, Math.min(255, n * 255)));
      return clamped.toString(16).padStart(2, "0");
    };
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    if (a < 1) {
      return hex + toHex(a);
    }
    return hex;
  }
  function hexToRgba(hex) {
    const clean = hex.replace("#", "");
    let r, g, b, a = 1;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16) / 255;
      g = parseInt(clean[1] + clean[1], 16) / 255;
      b = parseInt(clean[2] + clean[2], 16) / 255;
    } else if (clean.length === 6) {
      r = parseInt(clean.substring(0, 2), 16) / 255;
      g = parseInt(clean.substring(2, 4), 16) / 255;
      b = parseInt(clean.substring(4, 6), 16) / 255;
    } else if (clean.length === 8) {
      r = parseInt(clean.substring(0, 2), 16) / 255;
      g = parseInt(clean.substring(2, 4), 16) / 255;
      b = parseInt(clean.substring(4, 6), 16) / 255;
      a = parseInt(clean.substring(6, 8), 16) / 255;
    } else {
      return { r: 0, g: 0, b: 0, a: 1 };
    }
    return { r, g, b, a };
  }
  function formatColorValue(color) {
    if (color.a < 1) {
      return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a.toFixed(2)})`;
    }
    return rgbaToHex(color.r, color.g, color.b, color.a);
  }
  function colorDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    const da = a.a - b.a;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
  }
  function colorSimilarity(a, b) {
    return 1 - Math.min(1, colorDistance(a, b) / Math.SQRT2);
  }
  function isColorEqual(a, b) {
    const tolerance = 1e-3;
    return Math.abs(a.r - b.r) < tolerance && Math.abs(a.g - b.g) < tolerance && Math.abs(a.b - b.b) < tolerance && Math.abs(a.a - b.a) < tolerance;
  }

  // src/plugin/utils/color.ts
  function isSolidColor(paint) {
    return paint.type === "SOLID";
  }
  function isGradient(paint) {
    return paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL" || paint.type === "GRADIENT_ANGULAR" || paint.type === "GRADIENT_DIAMOND";
  }
  function getPaintColor(paint) {
    var _a;
    return {
      r: paint.color.r,
      g: paint.color.g,
      b: paint.color.b,
      a: (_a = paint.opacity) != null ? _a : 1
    };
  }

  // src/core/scanner/color-scanner.ts
  var ColorScanner = class {
    scan(node, _settings) {
      var _a;
      const findings = [];
      const pageName = ((_a = node.parent) == null ? void 0 : _a.type) === "PAGE" ? node.parent.name : "Unknown";
      console.log(`[Variable Checker] ColorScanner.scan: node=${node.name} type=${node.type}`);
      if ("fills" in node && Array.isArray(node.fills)) {
        const fills = node.fills;
        console.log(`[Variable Checker] ColorScanner: node=${node.name} fills.length=${fills.length}`);
        for (let i = 0; i < fills.length; i++) {
          const fill = fills[i];
          if (!fill) continue;
          console.log(`[Variable Checker] ColorScanner: fill[${i}] type=${fill.type}`);
          if (isSolidColor(fill)) {
            const paint = fill;
            const color = getPaintColor(paint);
            const fillStyleId = "fillStyleId" in node ? node.fillStyleId : null;
            const hasStyle = !!fillStyleId;
            console.log(`[Variable Checker] ColorScanner: fill[${i}] style=${hasStyle}`);
            if (!hasStyle) {
              console.log(`[Variable Checker] ColorScanner: >> SHOWING fill[${i}] for ${node.name}`);
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
                pageName
              });
            } else {
              console.log(`[Variable Checker] ColorScanner: >> SKIPPING fill[${i}] for ${node.name} (style applied)`);
            }
          }
          if (isGradient(fill)) {
            console.log(`[Variable Checker] ColorScanner: >> SHOWING gradient fill[${i}] for ${node.name}`);
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
              pageName
            });
          }
        }
      } else {
        console.log(`[Variable Checker] ColorScanner: node=${node.name} has no fills property`);
      }
      if ("strokes" in node && Array.isArray(node.strokes)) {
        const strokes = node.strokes;
        console.log(`[Variable Checker] ColorScanner: node=${node.name} strokes.length=${strokes.length}`);
        for (let i = 0; i < strokes.length; i++) {
          const stroke = strokes[i];
          if (!stroke) continue;
          console.log(`[Variable Checker] ColorScanner: stroke[${i}] type=${stroke.type}`);
          if (isSolidColor(stroke)) {
            const paint = stroke;
            const color = getPaintColor(paint);
            const strokeStyleId = "strokeStyleId" in node ? node.strokeStyleId : null;
            const hasStyle = !!strokeStyleId;
            console.log(`[Variable Checker] ColorScanner: stroke[${i}] style=${hasStyle}`);
            if (!hasStyle) {
              console.log(`[Variable Checker] ColorScanner: >> SHOWING stroke[${i}] for ${node.name}`);
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
                pageName
              });
            } else {
              console.log(`[Variable Checker] ColorScanner: >> SKIPPING stroke[${i}] for ${node.name} (style applied)`);
            }
          }
        }
      }
      console.log(`[Variable Checker] ColorScanner: node=${node.name} findings=${findings.length}`);
      return findings;
    }
  };

  // src/utils/typography.ts
  function formatTypographyProperties(props) {
    const parts = [];
    if (props.fontFamily) parts.push(props.fontFamily);
    if (props.fontWeight) parts.push(String(props.fontWeight));
    if (props.fontSize) parts.push(`${props.fontSize}px`);
    if (props.lineHeight) parts.push(`${props.lineHeight}${props.lineHeightUnit === "PERCENT" ? "%" : "px"}`);
    if (props.letterSpacing) parts.push(`${props.letterSpacing}px`);
    if (props.paragraphSpacing) parts.push(`PS: ${props.paragraphSpacing}px`);
    return parts.join(" / ") || "No typography";
  }
  function typographyPropertiesMatch(a, b) {
    let matching = 0;
    let total = 0;
    const compare = (aVal, bVal) => {
      if (aVal === null && bVal === null) return true;
      if (aVal === null || bVal === null) return false;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return Math.abs(aVal - bVal) / Math.max(Math.abs(aVal), Math.abs(bVal), 1) < 0.05;
      }
      return String(aVal).toLowerCase() === String(bVal).toLowerCase();
    };
    const props = [
      "fontFamily",
      "fontWeight",
      "fontSize",
      "lineHeight",
      "letterSpacing",
      "paragraphSpacing"
    ];
    for (const prop of props) {
      total++;
      if (compare(a[prop], b[prop])) {
        matching++;
      }
    }
    const score = total > 0 ? matching / total : 0;
    return { matchCount: matching, score };
  }

  // src/plugin/utils/typography.ts
  function extractTypographyProperties(node) {
    const fontName = node.fontName;
    const lineHeight = node.lineHeight;
    const letterSpacing = node.letterSpacing;
    const paragraphSpacing = node.paragraphSpacing;
    const paragraphIndent = node.paragraphIndent;
    const textCase = node.textCase;
    const textDecoration = node.textDecoration;
    let fontFamily = null;
    let fontWeight = null;
    if (fontName && typeof fontName === "object" && "family" in fontName) {
      fontFamily = fontName.family;
      fontWeight = parseFontWeight(fontName.style);
    }
    return {
      fontFamily,
      fontWeight,
      fontSize: node.fontSize,
      lineHeight: lineHeight && lineHeight.unit !== "AUTO" ? "value" in lineHeight ? lineHeight.value : null : null,
      lineHeightUnit: lineHeight ? lineHeight.unit : null,
      letterSpacing: letterSpacing && letterSpacing.unit !== "NONE" ? "value" in letterSpacing ? letterSpacing.value : null : null,
      paragraphSpacing: typeof paragraphSpacing === "number" ? paragraphSpacing : null,
      paragraphIndent: typeof paragraphIndent === "number" ? paragraphIndent : null,
      textCase: textCase != null ? textCase : null,
      textDecoration: textDecoration != null ? textDecoration : null
    };
  }
  function parseFontWeight(style) {
    const weightMap = {
      thin: 100,
      hairline: 100,
      extralight: 200,
      ultralight: 200,
      light: 300,
      regular: 400,
      normal: 400,
      medium: 500,
      semibold: 600,
      demibold: 600,
      bold: 700,
      extrabold: 800,
      ultrabold: 800,
      black: 900,
      heavy: 900
    };
    const lower = style.toLowerCase();
    if (weightMap[lower]) return weightMap[lower];
    const num = parseInt(style, 10);
    if (!isNaN(num)) return num;
    return 400;
  }

  // src/core/scanner/typography-scanner.ts
  var TypographyScanner = class {
    scan(node, _settings) {
      var _a;
      if (node.type !== "TEXT") return [];
      const textNode = node;
      const pageName = ((_a = node.parent) == null ? void 0 : _a.type) === "PAGE" ? node.parent.name : "Unknown";
      console.log(`[Variable Checker] TypographyScanner: node=${node.name} textStyleId=${textNode.textStyleId}`);
      if (!!textNode.textStyleId) return [];
      const props = extractTypographyProperties(textNode);
      const formatted = formatTypographyProperties(props);
      const parts = [];
      if (props.fontFamily) parts.push(String(props.fontFamily));
      if (props.fontSize) parts.push(`${props.fontSize}px`);
      if (props.fontWeight) parts.push(String(props.fontWeight));
      if (props.lineHeight) parts.push(`LH ${props.lineHeight}${props.lineHeightUnit === "PERCENT" ? "%" : "px"}`);
      console.log(`[Variable Checker] TypographyScanner: node=${node.name} has no textStyleId, returning finding`);
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
        pageName
      }];
    }
  };

  // src/core/scanner/effects-scanner.ts
  var EffectsScanner = class {
    scan(node, _settings) {
      var _a;
      const findings = [];
      if (!("effects" in node)) return findings;
      const effects = node.effects;
      const pageName = ((_a = node.parent) == null ? void 0 : _a.type) === "PAGE" ? node.parent.name : "Unknown";
      const isLinkedToStyle = "effectStyleId" in node && !!node.effectStyleId;
      if (isLinkedToStyle) return findings;
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i];
        if (!effect || effect.type === "NONE") continue;
        const effectLabel = this.getEffectLabel(effect);
        const effectDetail = this.getEffectDetail(effect);
        findings.push({
          id: generateId(),
          layerId: node.id,
          layerName: node.name,
          layerType: node.type,
          category: "effects",
          property: `effect[${i}]`,
          currentValue: `${effectLabel}: ${effectDetail}`,
          suggestedValue: null,
          suggestion: null,
          confidence: 0,
          matchType: null,
          source: null,
          sourceName: null,
          parentChain: findParentChain(node),
          pageName
        });
      }
      return findings;
    }
    getEffectLabel(effect) {
      switch (effect.type) {
        case "DROP_SHADOW":
          return "Drop Shadow";
        case "INNER_SHADOW":
          return "Inner Shadow";
        case "LAYER_BLUR":
          return "Layer Blur";
        case "BACKGROUND_BLUR":
          return "Background Blur";
        default:
          return effect.type;
      }
    }
    getEffectDetail(effect) {
      switch (effect.type) {
        case "DROP_SHADOW":
        case "INNER_SHADOW": {
          const shadow = effect;
          const parts = [];
          parts.push(`X:${shadow.offset.x}`);
          parts.push(`Y:${shadow.offset.y}`);
          parts.push(`B:${shadow.radius}`);
          if (shadow.spread !== 0) parts.push(`S:${shadow.spread}`);
          parts.push(`#${this.colorToHex(shadow.color)}`);
          parts.push(`O:${(shadow.opacity * 100).toFixed(0)}%`);
          return parts.join(" ");
        }
        case "LAYER_BLUR":
        case "BACKGROUND_BLUR": {
          const blur = effect;
          return `R:${blur.radius}px`;
        }
        default:
          return "";
      }
    }
    colorToHex(color) {
      const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
      return `${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
    }
  };

  // src/core/scanner/layout-scanner.ts
  var LayoutScanner = class {
    scan(node, _settings) {
      var _a;
      const findings = [];
      const pageName = ((_a = node.parent) == null ? void 0 : _a.type) === "PAGE" ? node.parent.name : "Unknown";
      if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
        const cornerRadius = node.cornerRadius;
        if (cornerRadius > 0) {
          findings.push({
            id: generateId(),
            layerId: node.id,
            layerName: node.name,
            layerType: node.type,
            category: "layout",
            property: "cornerRadius",
            currentValue: `${cornerRadius}px`,
            suggestedValue: null,
            suggestion: null,
            confidence: 0,
            matchType: null,
            source: null,
            sourceName: null,
            parentChain: findParentChain(node),
            pageName
          });
        }
      }
      if ("minWidth" in node && typeof node.minWidth === "number" && node.minWidth > 0) {
        findings.push({
          id: generateId(),
          layerId: node.id,
          layerName: node.name,
          layerType: node.type,
          category: "layout",
          property: "minWidth",
          currentValue: `${node.minWidth}px`,
          suggestedValue: null,
          suggestion: null,
          confidence: 0,
          matchType: null,
          source: null,
          sourceName: null,
          parentChain: findParentChain(node),
          pageName
        });
      }
      if ("maxWidth" in node && typeof node.maxWidth === "number" && node.maxWidth > 0) {
        findings.push({
          id: generateId(),
          layerId: node.id,
          layerName: node.name,
          layerType: node.type,
          category: "layout",
          property: "maxWidth",
          currentValue: `${node.maxWidth}px`,
          suggestedValue: null,
          suggestion: null,
          confidence: 0,
          matchType: null,
          source: null,
          sourceName: null,
          parentChain: findParentChain(node),
          pageName
        });
      }
      if ("minHeight" in node && typeof node.minHeight === "number" && node.minHeight > 0) {
        findings.push({
          id: generateId(),
          layerId: node.id,
          layerName: node.name,
          layerType: node.type,
          category: "layout",
          property: "minHeight",
          currentValue: `${node.minHeight}px`,
          suggestedValue: null,
          suggestion: null,
          confidence: 0,
          matchType: null,
          source: null,
          sourceName: null,
          parentChain: findParentChain(node),
          pageName
        });
      }
      if ("maxHeight" in node && typeof node.maxHeight === "number" && node.maxHeight > 0) {
        findings.push({
          id: generateId(),
          layerId: node.id,
          layerName: node.name,
          layerType: node.type,
          category: "layout",
          property: "maxHeight",
          currentValue: `${node.maxHeight}px`,
          suggestedValue: null,
          suggestion: null,
          confidence: 0,
          matchType: null,
          source: null,
          sourceName: null,
          parentChain: findParentChain(node),
          pageName
        });
      }
      if ("layoutMode" in node && node.layoutMode !== "NONE") {
        const frameNode = node;
        if (frameNode.itemSpacing > 0) {
          findings.push({
            id: generateId(),
            layerId: node.id,
            layerName: node.name,
            layerType: node.type,
            category: "layout",
            property: "itemSpacing",
            currentValue: `${frameNode.itemSpacing}px`,
            suggestedValue: null,
            suggestion: null,
            confidence: 0,
            matchType: null,
            source: null,
            sourceName: null,
            parentChain: findParentChain(node),
            pageName
          });
        }
        const paddingProps = [
          { key: "paddingTop", value: frameNode.paddingTop },
          { key: "paddingBottom", value: frameNode.paddingBottom },
          { key: "paddingLeft", value: frameNode.paddingLeft },
          { key: "paddingRight", value: frameNode.paddingRight }
        ];
        for (const prop of paddingProps) {
          if (prop.value > 0) {
            findings.push({
              id: generateId(),
              layerId: node.id,
              layerName: node.name,
              layerType: node.type,
              category: "layout",
              property: prop.key,
              currentValue: `${prop.value}px`,
              suggestedValue: null,
              suggestion: null,
              confidence: 0,
              matchType: null,
              source: null,
              sourceName: null,
              parentChain: findParentChain(node),
              pageName
            });
          }
        }
      }
      if ("width" in node && typeof node.width === "number") {
        findings.push({
          id: generateId(),
          layerId: node.id,
          layerName: node.name,
          layerType: node.type,
          category: "layout",
          property: "width",
          currentValue: `${Math.round(node.width)}px`,
          suggestedValue: null,
          suggestion: null,
          confidence: 0,
          matchType: null,
          source: null,
          sourceName: null,
          parentChain: findParentChain(node),
          pageName
        });
      }
      if ("height" in node && typeof node.height === "number") {
        findings.push({
          id: generateId(),
          layerId: node.id,
          layerName: node.name,
          layerType: node.type,
          category: "layout",
          property: "height",
          currentValue: `${Math.round(node.height)}px`,
          suggestedValue: null,
          suggestion: null,
          confidence: 0,
          matchType: null,
          source: null,
          sourceName: null,
          parentChain: findParentChain(node),
          pageName
        });
      }
      return findings;
    }
  };

  // src/core/matcher/color-matcher.ts
  var ColorMatcher = class {
    constructor(variableResolver2, styleResolver2) {
      __publicField(this, "variableResolver");
      __publicField(this, "styleResolver");
      this.variableResolver = variableResolver2;
      this.styleResolver = styleResolver2;
    }
    async match(finding, settings) {
      var _a;
      if (finding.category !== "color") return null;
      const color = this.parseColorValue(finding.currentValue);
      if (!color) return null;
      const suggestions = await this.findColorSuggestions(color, settings);
      return (_a = suggestions[0]) != null ? _a : null;
    }
    parseColorValue(value) {
      if (value.startsWith("#")) {
        return hexToRgba(value);
      }
      if (value.startsWith("rgba")) {
        const match = value.match(
          /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/
        );
        if (match) {
          return {
            r: parseInt(match[1]) / 255,
            g: parseInt(match[2]) / 255,
            b: parseInt(match[3]) / 255,
            a: parseFloat(match[4])
          };
        }
      }
      if (value.startsWith("rgb")) {
        const match = value.match(
          /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/
        );
        if (match) {
          return {
            r: parseInt(match[1]) / 255,
            g: parseInt(match[2]) / 255,
            b: parseInt(match[3]) / 255,
            a: 1
          };
        }
      }
      return null;
    }
    async findColorSuggestions(color, settings) {
      const suggestions = [];
      if (settings.matchColorVariables) {
        const localVars = this.variableResolver.getLocalVariables();
        for (const variable of localVars) {
          if (variable.type !== "COLOR") continue;
          const varColor = variable.value;
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
              source: "local"
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
                distance: Math.round((1 - similarity) * 1e3) / 1e3,
                source: "local"
              });
            }
          }
        }
        const libraryVars = this.variableResolver.getLibraryVariables();
        for (const variable of libraryVars) {
          if (variable.type !== "COLOR") continue;
          const varColor = variable.value;
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
              libraryName: variable.libraryName
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
                distance: Math.round((1 - similarity) * 1e3) / 1e3,
                source: "library",
                libraryName: variable.libraryName
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
              source: "local"
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
                distance: Math.round((1 - similarity) * 1e3) / 1e3,
                source: "local"
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
              libraryName: style.libraryName
            });
          }
        }
      }
      suggestions.sort((a, b) => {
        const priorityOrder = (s) => {
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
    getStyleColor(style) {
      var _a;
      try {
        const paintStyle = figma.getStyleById(style.id);
        if (!paintStyle) return null;
        const paints = paintStyle.paints;
        if (paints.length === 0) return null;
        const firstPaint = paints[0];
        if (firstPaint.type !== "SOLID") return null;
        const solidPaint = firstPaint;
        return {
          r: solidPaint.color.r,
          g: solidPaint.color.g,
          b: solidPaint.color.b,
          a: (_a = solidPaint.opacity) != null ? _a : 1
        };
      } catch (e) {
        return null;
      }
    }
  };

  // src/core/matcher/typography-matcher.ts
  var TypographyMatcher = class {
    constructor(styleResolver2) {
      __publicField(this, "styleResolver");
      this.styleResolver = styleResolver2;
    }
    async match(finding, settings) {
      if (finding.category !== "typography" || !settings.matchTextStyles) return null;
      const textStyles = this.styleResolver.getTextStyles();
      const node = figma.getNodeById(finding.layerId);
      if (!node || node.type !== "TEXT") return null;
      const layerProps = extractTypographyProperties(node);
      const candidates = [];
      for (const style of textStyles) {
        const textStyle = figma.getStyleById(style.id);
        if (!textStyle) continue;
        const styleProps = extractTypographyPropertiesFromStyle(textStyle);
        const result = typographyPropertiesMatch(layerProps, styleProps);
        if (result.matchCount > 0) {
          const maxProps = 6;
          const score = result.matchCount / maxProps;
          candidates.push({
            style,
            score: Math.round(score * 100),
            matchType: score >= 0.99 ? "exact" : "similar"
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
        libraryName: best.style.libraryName
      };
    }
  };
  function extractTypographyPropertiesFromStyle(style) {
    try {
      const fontName = style.fontName;
      const family = fontName.family;
      const weight = parseFontWeight2(fontName.style);
      const fontSize = style.fontSize;
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
        textDecoration: null
      };
    } catch (e) {
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
        textDecoration: null
      };
    }
  }
  function parseFontWeight2(style) {
    const weightMap = {
      thin: 100,
      hairline: 100,
      extralight: 200,
      ultralight: 200,
      light: 300,
      regular: 400,
      normal: 400,
      medium: 500,
      semibold: 600,
      demibold: 600,
      bold: 700,
      extrabold: 800,
      ultrabold: 800,
      black: 900,
      heavy: 900
    };
    const lower = style.toLowerCase();
    if (weightMap[lower]) return weightMap[lower];
    const num = parseInt(style, 10);
    if (!isNaN(num)) return num;
    return 400;
  }

  // src/core/matcher/variable-matcher.ts
  var VariableMatcher = class {
    constructor(variableResolver2) {
      __publicField(this, "variableResolver");
      this.variableResolver = variableResolver2;
    }
    async match(finding, settings) {
      var _a;
      if (finding.category !== "layout" && finding.category !== "variable") {
        return null;
      }
      if (!settings.matchNumberVariables) return null;
      const numericValue = this.extractNumericValue(finding.currentValue);
      if (numericValue === null) return null;
      const suggestions = this.findNumericVariableMatches(
        numericValue,
        settings
      );
      return (_a = suggestions[0]) != null ? _a : null;
    }
    extractNumericValue(value) {
      const cleaned = value.replace(/px$/, "").trim();
      const num = parseFloat(cleaned);
      if (isNaN(num)) return null;
      return num;
    }
    findNumericVariableMatches(value, settings) {
      const suggestions = [];
      const floatVars = this.variableResolver.getFloatVariables();
      const localVars = floatVars.filter((v) => v.source === "local");
      const libraryVars = floatVars.filter((v) => v.source === "library");
      const findMatches = (variables, source) => {
        for (const variable of variables) {
          const varValue = variable.value;
          if (typeof varValue === "number") {
            if (varValue === value) {
              suggestions.push({
                variableId: variable.id,
                styleId: null,
                name: variable.name,
                type: "variable",
                category: "layout",
                confidence: 100,
                matchType: "exact",
                distance: 0,
                source,
                libraryName: variable.libraryName
              });
            } else if (!settings.exactMatchOnly) {
              const diff = Math.abs(varValue - value);
              const max = Math.max(Math.abs(varValue), Math.abs(value), 1);
              const similarity = 1 - Math.min(1, diff / max);
              if (similarity >= settings.similarityThreshold) {
                suggestions.push({
                  variableId: variable.id,
                  styleId: null,
                  name: variable.name,
                  type: "variable",
                  category: "layout",
                  confidence: Math.round(similarity * 100),
                  matchType: "similar",
                  distance: Math.round(diff * 100) / 100,
                  source,
                  libraryName: variable.libraryName
                });
              }
            }
          }
        }
      };
      findMatches(localVars, "local");
      findMatches(libraryVars, "library");
      suggestions.sort((a, b) => {
        const priorityOrder = (s) => {
          if (s.source === "local") return 0;
          return 1;
        };
        const priorityDiff = priorityOrder(a) - priorityOrder(b);
        if (priorityDiff !== 0) return priorityDiff;
        return b.confidence - a.confidence;
      });
      return suggestions;
    }
  };

  // src/core/matcher/matcher.ts
  var Matcher = class {
    constructor(variableResolver2, styleResolver2) {
      __publicField(this, "colorMatcher");
      __publicField(this, "typographyMatcher");
      __publicField(this, "variableMatcher");
      this.colorMatcher = new ColorMatcher(variableResolver2, styleResolver2);
      this.typographyMatcher = new TypographyMatcher(styleResolver2);
      this.variableMatcher = new VariableMatcher(variableResolver2);
    }
    async matchFindings(findings, settings, onProgress) {
      const matched = [];
      const total = findings.length;
      for (let i = 0; i < total; i++) {
        const finding = findings[i];
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
          matched.push(__spreadProps(__spreadValues({}, finding), {
            suggestedValue: suggestion.name,
            suggestion,
            confidence: suggestion.confidence,
            matchType: suggestion.matchType,
            source: suggestion.type === "variable" ? "variable" : "style",
            sourceName: suggestion.name
          }));
        } else {
          matched.push(finding);
        }
        if (i % 50 === 0) {
          onProgress == null ? void 0 : onProgress({
            phase: "matching",
            totalLayers: total,
            scannedLayers: i,
            findingsCount: matched.length,
            currentLayerName: ""
          });
          await this.yieldToMainThread();
        }
      }
      return matched;
    }
    async yieldToMainThread() {
      return new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  };

  // src/core/scanner/scanner.ts
  var Scanner = class {
    constructor(variableResolver2, styleResolver2) {
      __publicField(this, "colorScanner");
      __publicField(this, "typographyScanner");
      __publicField(this, "effectsScanner");
      __publicField(this, "layoutScanner");
      __publicField(this, "matcher");
      __publicField(this, "styleResolver");
      __publicField(this, "cancelled", false);
      this.colorScanner = new ColorScanner();
      this.typographyScanner = new TypographyScanner();
      this.effectsScanner = new EffectsScanner();
      this.layoutScanner = new LayoutScanner();
      this.matcher = new Matcher(variableResolver2, styleResolver2);
      this.styleResolver = styleResolver2;
    }
    cancel() {
      this.cancelled = true;
    }
    async scan(scope, settings, onProgress) {
      this.cancelled = false;
      const nodes = await this.collectNodes(scope, settings);
      const totalLayers = nodes.length;
      console.log(`[Variable Checker] Scanner: collected ${totalLayers} nodes, scope=${scope}`);
      onProgress == null ? void 0 : onProgress({
        phase: "scanning",
        totalLayers,
        scannedLayers: 0,
        findingsCount: 0,
        currentLayerName: ""
      });
      const allFindings = [];
      for (let i = 0; i < nodes.length; i += SCAN_BATCH_SIZE) {
        if (this.cancelled) {
          throw new Error("Scan cancelled");
        }
        const batch = nodes.slice(i, i + SCAN_BATCH_SIZE);
        for (const node of batch) {
          if (this.cancelled) throw new Error("Scan cancelled");
          try {
            const findings = this.scanNode(node, settings);
            if (findings.length > 0) {
              const cats = [...new Set(findings.map((f) => f.category))].join(",");
              console.log(`[Variable Checker] Scanner: node=${node.name} findings=${findings.length} cats=${cats}`);
            } else {
              console.log(`[Variable Checker] Scanner: node=${node.name} findings=0`);
            }
            allFindings.push(...findings);
          } catch (err) {
            console.error(`[Variable Checker] Error scanning node ${node.name} (${node.id}):`, err);
          }
          onProgress == null ? void 0 : onProgress({
            phase: "scanning",
            totalLayers,
            scannedLayers: allFindings.length,
            findingsCount: allFindings.length,
            currentLayerName: node.name
          });
        }
        await this.yieldToMainThread();
      }
      console.log(`[Variable Checker] Scanner: raw findings before matching: ${allFindings.length}`);
      console.log(`[Variable Checker] Scanner: raw findings by category:`, {
        color: allFindings.filter((f) => f.category === "color").length,
        typography: allFindings.filter((f) => f.category === "typography").length,
        effects: allFindings.filter((f) => f.category === "effects").length,
        layout: allFindings.filter((f) => f.category === "layout").length
      });
      onProgress == null ? void 0 : onProgress({
        phase: "matching",
        totalLayers,
        scannedLayers: totalLayers,
        findingsCount: allFindings.length,
        currentLayerName: ""
      });
      const matchedFindings = await this.matcher.matchFindings(
        allFindings,
        settings,
        onProgress
      );
      const summary = this.generateSummary(matchedFindings, totalLayers);
      onProgress == null ? void 0 : onProgress({
        phase: "complete",
        totalLayers,
        scannedLayers: totalLayers,
        findingsCount: matchedFindings.length,
        currentLayerName: ""
      });
      return {
        findings: matchedFindings,
        summary,
        timestamp: Date.now(),
        scope
      };
    }
    async collectNodes(scope, settings) {
      const nodes = [];
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
    collectAllNodes(node, result, settings) {
      if (this.cancelled) return;
      if (settings.safetySkipInstances && node.type === "INSTANCE") {
        return;
      }
      result.push(node);
      if ("children" in node) {
        const children = node.children;
        for (const child of children) {
          this.collectAllNodes(child, result, settings);
        }
      }
    }
    scanNode(node, settings) {
      var _a;
      const findings = [];
      if (settings.safetySkipInstances && node.type === "INSTANCE") {
        return findings;
      }
      if (settings.safetySkipLibraryAssets) {
        if (node.type === "COMPONENT" || node.type === "INSTANCE") {
          const mainComponent = node.mainComponent;
          if (mainComponent && ((_a = mainComponent.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") {
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
    async yieldToMainThread() {
      return new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    generateSummary(findings, totalLayers) {
      var _a;
      const breakdown = {
        color: 0,
        typography: 0,
        effects: 0,
        layout: 0,
        variable: 0
      };
      for (const finding of findings) {
        breakdown[finding.category] = ((_a = breakdown[finding.category]) != null ? _a : 0) + 1;
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
        categoriesBreakdown: breakdown
      };
    }
  };

  // src/core/variables/variable-resolver.ts
  var VariableResolver = class {
    constructor() {
      __publicField(this, "cache", /* @__PURE__ */ new Map());
      __publicField(this, "allVariables", []);
      __publicField(this, "initialized", false);
    }
    async initialize() {
      if (this.initialized) return;
      try {
        const localVariables = await this.collectLocalVariables();
        const libraryVariables = await this.collectLibraryVariables();
        this.allVariables = [...localVariables, ...libraryVariables];
        this.buildCache();
        this.initialized = true;
      } catch (error) {
        console.error("Failed to initialize VariableResolver:", error);
        throw error;
      }
    }
    async collectLocalVariables() {
      var _a, _b, _c;
      const variables = [];
      const collections = (_b = (_a = figma.variables) == null ? void 0 : _a.getLocalVariableCollections()) != null ? _b : [];
      for (const collection of collections) {
        const variableIds = collection.variableIds;
        for (const variableId of variableIds) {
          const variable = (_c = figma.variables) == null ? void 0 : _c.getVariableById(variableId);
          if (!variable) continue;
          const resolvedValue = variable.valuesByMode[collection.defaultModeId];
          if (resolvedValue === void 0) continue;
          variables.push({
            id: variable.id,
            name: variable.name,
            type: variable.resolvedType === "COLOR" ? "COLOR" : variable.resolvedType === "FLOAT" ? "FLOAT" : variable.resolvedType === "STRING" ? "STRING" : "BOOLEAN",
            resolvedType: variable.resolvedType,
            value: resolvedValue,
            source: "local",
            remote: false,
            key: variable.key
          });
        }
      }
      return variables;
    }
    async collectLibraryVariables() {
      var _a, _b, _c;
      const variables = [];
      try {
        const collections = await ((_a = figma.teamLibrary) == null ? void 0 : _a.getVariableCollectionsAsync());
        if (!collections) return variables;
        for (const collection of collections) {
          for (const variableRef of (_b = collection.variableReferences) != null ? _b : []) {
            const variable = (_c = figma.variables) == null ? void 0 : _c.getVariableById(variableRef.id);
            if (!variable) continue;
            const resolvedValue = variable.valuesByMode[collection.defaultModeId];
            if (resolvedValue === void 0) continue;
            variables.push({
              id: variable.id,
              name: variable.name,
              type: variable.resolvedType === "COLOR" ? "COLOR" : variable.resolvedType === "FLOAT" ? "FLOAT" : variable.resolvedType === "STRING" ? "STRING" : "BOOLEAN",
              resolvedType: variable.resolvedType,
              value: resolvedValue,
              source: "library",
              libraryName: collection.name,
              remote: true,
              key: variable.key
            });
          }
        }
      } catch (e) {
        console.warn("Could not access team library variables");
      }
      return variables;
    }
    buildCache() {
      var _a;
      this.cache.clear();
      for (const variable of this.allVariables) {
        const key = this.getVariableCacheKey(variable);
        const existing = (_a = this.cache.get(key)) != null ? _a : [];
        existing.push(variable);
        this.cache.set(key, existing);
      }
    }
    getVariableCacheKey(variable) {
      var _a, _b;
      const value = variable.value;
      if (typeof value === "object" && value !== null && "r" in value) {
        return `color:${value.r.toFixed(3)}:${value.g.toFixed(3)}:${value.b.toFixed(3)}:${(_b = (_a = value.a) == null ? void 0 : _a.toFixed(3)) != null ? _b : "1.000"}`;
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
    getVariables() {
      return this.allVariables;
    }
    getColorVariables() {
      return this.allVariables.filter((v) => v.type === "COLOR");
    }
    getFloatVariables() {
      return this.allVariables.filter((v) => v.type === "FLOAT");
    }
    getLocalVariables() {
      return this.allVariables.filter((v) => v.source === "local");
    }
    getLibraryVariables() {
      return this.allVariables.filter((v) => v.source === "library");
    }
    findExactMatch(value, type) {
      const key = this.getExactMatchKey(value, type);
      if (!key) return void 0;
      const candidates = this.cache.get(key);
      if (!candidates || candidates.length === 0) return void 0;
      return candidates[0];
    }
    getExactMatchKey(value, type) {
      var _a;
      if (type === "COLOR" && typeof value === "object" && value !== null) {
        const c = value;
        return `color:${c.r.toFixed(3)}:${c.g.toFixed(3)}:${c.b.toFixed(3)}:${((_a = c.a) != null ? _a : 1).toFixed(3)}`;
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
      return void 0;
    }
    findSimilarColor(color, threshold = 0.95) {
      var _a, _b;
      const colorVars = this.getColorVariables();
      const results = [];
      for (const variable of colorVars) {
        const v = variable.value;
        const dr = color.r - v.r;
        const dg = color.g - v.g;
        const db = color.b - v.b;
        const da = ((_a = color.a) != null ? _a : 1) - ((_b = v.a) != null ? _b : 1);
        const distance = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
        const similarity = 1 - Math.min(1, distance / Math.SQRT2);
        if (similarity >= threshold) {
          results.push({ variable, distance });
        }
      }
      results.sort((a, b) => a.distance - b.distance);
      return results.map((r) => r.variable);
    }
    bindVariableToNode(node, variableId, property) {
      var _a, _b;
      try {
        const variable = (_a = figma.variables) == null ? void 0 : _a.getVariableById(variableId);
        if (!variable) {
          console.error(`[Variable Checker] Variable not found: ${variableId}`);
          return false;
        }
        const collection = (_b = figma.variables) == null ? void 0 : _b.getVariableCollectionById(
          variable.variableCollectionId
        );
        if (!collection) {
          console.error(`[Variable Checker] Collection not found for variable: ${variable.name}`);
          return false;
        }
        const modeId = collection.defaultModeId;
        console.log(`[Variable Checker] bindVariableToNode: ${node.name} type=${node.type} prop=${property} var=${variable.name} col=${collection.name} mode=${modeId}`);
        if (property.startsWith("fill") && "fillStyleId" in node && typeof node.fillStyleId === "string") {
          return this.applyBoundVariableOrColor(
            node,
            "fills",
            variable,
            modeId,
            "fill"
          );
        }
        if (property.startsWith("stroke") && "strokeStyleId" in node && typeof node.strokeStyleId === "string") {
          return this.applyBoundVariableOrColor(
            node,
            "strokes",
            variable,
            modeId,
            "stroke"
          );
        }
        return this.bindNumericProperty(node, property, variable, modeId);
      } catch (e) {
        console.error(`[Variable Checker] bindVariableToNode unexpected error for ${node.name}:`, e);
        return false;
      }
    }
    applyBoundVariableOrColor(node, fillsOrStrokes, variable, modeId, _propertyPrefix) {
      var _a;
      try {
        if (typeof ((_a = figma.variables) == null ? void 0 : _a.bindVariableToAlias) === "function") {
          try {
            const boundPaints = figma.variables.bindVariableToAlias(
              node,
              fillsOrStrokes,
              variable,
              modeId
            );
            if (boundPaints) {
              node[fillsOrStrokes] = boundPaints;
              return true;
            }
          } catch (e) {
            console.error(`[Variable Checker] bindVariableToAlias failed, falling back to direct color:`, e);
          }
        }
        try {
          const aliasKey = fillsOrStrokes === "fills" ? "fill" : "stroke";
          node.boundVariables = __spreadProps(__spreadValues({}, node.boundVariables || {}), {
            [aliasKey]: [{ id: variable.id, type: "VARIABLE_ALIAS" }]
          });
          console.log(`[Variable Checker] boundVariables set directly for ${node.name}`);
          return true;
        } catch (e) {
          console.log(`[Variable Checker] boundVariables not writable on ${node.name}, using color fallback:`, e);
        }
        const resolvedValue = variable.valuesByMode[modeId];
        if (!resolvedValue || typeof resolvedValue !== "object" || !("r" in resolvedValue)) {
          console.error(`[Variable Checker] Variable ${variable.name} has no color value for mode ${modeId}`);
          return false;
        }
        const { r, g, b, a } = resolvedValue;
        const freshPaints = [{
          type: "SOLID",
          color: { r, g, b },
          opacity: a != null ? a : 1,
          blendMode: "NORMAL",
          visible: true,
          boundVariables: {
            color: {
              type: "VARIABLE_ALIAS",
              id: variable.id
            }
          }
        }];
        const origPaints = node[fillsOrStrokes];
        const origColor = Array.isArray(origPaints) && origPaints.length > 0 && origPaints[0].type === "SOLID" ? `${origPaints[0].color.r.toFixed(2)},${origPaints[0].color.g.toFixed(2)},${origPaints[0].color.b.toFixed(2)}` : "no-solid-paint";
        node[fillsOrStrokes] = freshPaints;
        const verifyPaints = node[fillsOrStrokes];
        const verifyColor = Array.isArray(verifyPaints) && verifyPaints.length > 0 ? `${verifyPaints[0].color.r.toFixed(2)},${verifyPaints[0].color.g.toFixed(2)},${verifyPaints[0].color.b.toFixed(2)}` : "no-paints";
        const changed = origColor !== verifyColor;
        console.log(`[Variable Checker] ${fillsOrStrokes} on ${node.name}: was=${origColor} set=${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)} verify=${verifyColor} changed=${changed}`);
        return true;
      } catch (e) {
        console.error(`[Variable Checker] applyBoundVariableOrColor failed for ${node.name}:`, e);
        return false;
      }
    }
    bindNumericProperty(node, property, variable, modeId) {
      try {
        const resolvedValue = variable.valuesByMode[modeId];
        if (typeof resolvedValue !== "number") {
          return false;
        }
        const value = resolvedValue;
        try {
          node.boundVariables = __spreadProps(__spreadValues({}, node.boundVariables || {}), {
            [property]: { id: variable.id, type: "VARIABLE_ALIAS" }
          });
        } catch (e) {
        }
        switch (property) {
          case "width":
          case "height": {
            if (typeof node.resize === "function") {
              const w = property === "width" ? value : node.width;
              const h = property === "height" ? value : node.height;
              node.resize(w, h);
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
              node[property] = value;
              return true;
            }
            return false;
          default:
            return false;
        }
      } catch (e) {
        return false;
      }
    }
    isInitialized() {
      return this.initialized;
    }
    clearCache() {
      this.cache.clear();
      this.allVariables = [];
      this.initialized = false;
    }
  };

  // src/core/styles/style-resolver.ts
  var StyleResolver = class {
    constructor() {
      __publicField(this, "cache", /* @__PURE__ */ new Map());
      __publicField(this, "allStyles", []);
      __publicField(this, "initialized", false);
    }
    async initialize() {
      if (this.initialized) return;
      try {
        const localStyles = this.collectLocalStyles();
        const libraryStyles = await this.collectLibraryStyles();
        this.allStyles = [...localStyles, ...libraryStyles];
        this.buildCache();
        this.initialized = true;
      } catch (error) {
        console.error("Failed to initialize StyleResolver:", error);
        throw error;
      }
    }
    collectLocalStyles() {
      var _a;
      const styles = [];
      const styleTypes = ["FILL", "TEXT", "EFFECT"];
      for (const styleType of styleTypes) {
        const figmaStyles = figma.getLocalPaintStyles ? figma.getLocalPaintStyles() : [];
        const textStyles = figma.getLocalTextStyles ? figma.getLocalTextStyles() : [];
        const effectStyles = figma.getLocalEffectStyles ? figma.getLocalEffectStyles() : [];
        let targetStyles = [];
        if (styleType === "FILL") targetStyles = figma.getLocalPaintStyles();
        else if (styleType === "TEXT") targetStyles = figma.getLocalTextStyles();
        else if (styleType === "EFFECT") targetStyles = figma.getLocalEffectStyles();
        for (const style of targetStyles) {
          styles.push({
            id: style.id,
            name: style.name,
            type: styleType,
            source: "local",
            remote: false,
            key: (_a = style.key) != null ? _a : style.id,
            description: style.description
          });
        }
      }
      return styles;
    }
    async collectLibraryStyles() {
      var _a;
      const styles = [];
      try {
        const libraries = await ((_a = figma.teamLibrary) == null ? void 0 : _a.getStylesAsync());
        if (!libraries) return styles;
        for (const libraryStyle of libraries) {
          styles.push({
            id: libraryStyle.id,
            name: libraryStyle.name,
            type: libraryStyle.styleType,
            source: "library",
            libraryName: libraryStyle.libraryName,
            remote: true,
            key: libraryStyle.key,
            description: libraryStyle.description
          });
        }
      } catch (e) {
        console.warn("Could not access team library styles");
      }
      return styles;
    }
    buildCache() {
      var _a;
      this.cache.clear();
      for (const style of this.allStyles) {
        const key = style.type;
        const existing = (_a = this.cache.get(key)) != null ? _a : [];
        existing.push(style);
        this.cache.set(key, existing);
      }
    }
    getStyles() {
      return this.allStyles;
    }
    getColorStyles() {
      return this.allStyles.filter((s) => s.type === "FILL");
    }
    getTextStyles() {
      return this.allStyles.filter((s) => s.type === "TEXT");
    }
    getEffectStyles() {
      return this.allStyles.filter((s) => s.type === "EFFECT");
    }
    getLocalStyles() {
      return this.allStyles.filter((s) => s.source === "local");
    }
    getLibraryStyles() {
      return this.allStyles.filter((s) => s.source === "library");
    }
    findExactColorMatch(color) {
      var _a;
      const colorStyles = this.getColorStyles();
      for (const style of colorStyles) {
        try {
          const paintStyle = figma.getStyleById(style.id);
          if (!paintStyle) continue;
          const paints = paintStyle.paints;
          if (paints.length === 0) continue;
          const firstPaint = paints[0];
          if (firstPaint.type !== "SOLID") continue;
          const solidPaint = firstPaint;
          if (isColorEqual(color, {
            r: solidPaint.color.r,
            g: solidPaint.color.g,
            b: solidPaint.color.b,
            a: (_a = solidPaint.opacity) != null ? _a : 1
          })) {
            return style;
          }
        } catch (e) {
          continue;
        }
      }
      return void 0;
    }
    findSimilarColorStyle(color, threshold = 0.95) {
      var _a, _b;
      const colorStyles = this.getColorStyles();
      const results = [];
      for (const style of colorStyles) {
        try {
          const paintStyle = figma.getStyleById(style.id);
          if (!paintStyle) continue;
          const paints = paintStyle.paints;
          if (paints.length === 0) continue;
          const firstPaint = paints[0];
          if (firstPaint.type !== "SOLID") continue;
          const solidPaint = firstPaint;
          const dr = color.r - solidPaint.color.r;
          const dg = color.g - solidPaint.color.g;
          const db = color.b - solidPaint.color.b;
          const da = ((_a = color.a) != null ? _a : 1) - ((_b = solidPaint.opacity) != null ? _b : 1);
          const distance = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
          const similarity = 1 - Math.min(1, distance / Math.SQRT2);
          if (similarity >= threshold) {
            results.push({ style, distance });
          }
        } catch (e) {
          continue;
        }
      }
      results.sort((a, b) => a.distance - b.distance);
      return results.map((r) => r.style);
    }
    applyStyleToNode(node, styleId) {
      try {
        const style = figma.getStyleById(styleId);
        if (!style) return false;
        if (style.type === "PAINT" && "fillStyleId" in node) {
          node.fillStyleId = styleId;
          return true;
        }
        if (style.type === "TEXT" && node.type === "TEXT") {
          node.textStyleId = styleId;
          return true;
        }
        if (style.type === "EFFECT" && "effectStyleId" in node) {
          node.effectStyleId = styleId;
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    }
    isInitialized() {
      return this.initialized;
    }
    clearCache() {
      this.cache.clear();
      this.allStyles = [];
      this.initialized = false;
    }
  };

  // src/core/bulk-apply/bulk-apply-engine.ts
  var BulkApplyEngine = class {
    constructor(variableResolver2, styleResolver2) {
      __publicField(this, "variableResolver");
      __publicField(this, "styleResolver");
      __publicField(this, "cancelled", false);
      __publicField(this, "undoStack", []);
      this.variableResolver = variableResolver2;
      this.styleResolver = styleResolver2;
    }
    cancel() {
      this.cancelled = true;
    }
    canUndo() {
      return this.undoStack.length > 0;
    }
    getUndoDescription() {
      if (this.undoStack.length === 0) return null;
      return `Undo last apply operation (${this.undoStack.length} changes)`;
    }
    clearUndoStack() {
      this.undoStack = [];
    }
    async applySingle(finding, onProgress) {
      return this.applyBatch([finding], onProgress);
    }
    async applySelected(findings, onProgress) {
      return this.applyBatch(findings, onProgress);
    }
    async applyAll(findings, onProgress) {
      const applicable = findings.filter((f) => f.suggestion !== null);
      return this.applyBatch(applicable, onProgress);
    }
    async applyBatch(findings, onProgress) {
      var _a, _b;
      this.cancelled = false;
      this.undoStack = [];
      const result = {
        success: true,
        layersUpdated: 0,
        variablesLinked: 0,
        stylesApplied: 0,
        failedUpdates: 0,
        errors: [],
        duration: 0
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
            onProgress == null ? void 0 : onProgress(i + 1, total, `Applying to "${finding.layerName}"...`);
            const success = await this.applyFinding(finding);
            if (success) {
              result.layersUpdated++;
              if (((_a = finding.suggestion) == null ? void 0 : _a.type) === "variable") {
                result.variablesLinked++;
              } else if (((_b = finding.suggestion) == null ? void 0 : _b.type) === "style") {
                result.stylesApplied++;
              }
            } else {
              result.failedUpdates++;
              result.errors.push({
                layerId: finding.layerId,
                layerName: finding.layerName,
                findingId: finding.id,
                message: "Failed to apply suggestion"
              });
            }
          } catch (error) {
            result.failedUpdates++;
            result.errors.push({
              layerId: finding.layerId,
              layerName: finding.layerName,
              findingId: finding.id,
              message: error instanceof Error ? error.message : "Unknown error"
            });
          }
        }
        await this.yieldToMainThread();
      }
      result.duration = Date.now() - startTime;
      return result;
    }
    async applyFinding(finding) {
      const suggestion = finding.suggestion;
      if (!suggestion) {
        console.log(`[Variable Checker] applyFinding: no suggestion for ${finding.id}`);
        return false;
      }
      const node = figma.getNodeById(finding.layerId);
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
    applyVariable(node, variableId, finding) {
      return this.variableResolver.bindVariableToNode(
        node,
        variableId,
        finding.property
      );
    }
    applyStyle(node, styleId, _finding) {
      return this.styleResolver.applyStyleToNode(node, styleId);
    }
    saveUndoState(node) {
      try {
        const state = {};
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
          previousState: state
        });
      } catch (e) {
        console.warn("Failed to save undo state for", node.name);
      }
    }
    async undo() {
      if (this.undoStack.length === 0) return false;
      const operations = [...this.undoStack].reverse();
      for (const op of operations) {
        try {
          const node = figma.getNodeById(op.layerId);
          if (!node) continue;
          const state = op.previousState;
          if (state.fills && "fills" in node) {
            node.fills = state.fills;
          }
          if (state.strokes && "strokes" in node) {
            node.strokes = state.strokes;
          }
        } catch (e) {
          console.warn("Failed to undo operation");
        }
      }
      this.undoStack = [];
      return true;
    }
    async yieldToMainThread() {
      return new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  };

  // src/core/reporting/report-generator.ts
  var ReportGenerator = class {
    generate(findings, summary, applyResult, scope, duration) {
      return {
        summary,
        findings,
        applyResult,
        timestamp: Date.now(),
        duration,
        scope
      };
    }
    toJson(report) {
      return JSON.stringify(report, null, 2);
    }
    toCsv(findings) {
      return generateCsv(findings);
    }
    generateSummaryText(report) {
      const lines = [
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
        "Breakdown by Category:"
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
          `  Failed Updates: ${report.applyResult.failedUpdates}`
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
    formatDuration(ms) {
      if (ms < 1e3) return `${ms}ms`;
      if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
      const minutes = Math.floor(ms / 6e4);
      const seconds = (ms % 6e4 / 1e3).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  };

  // src/plugin/main.ts
  var variableResolver;
  var styleResolver;
  var scanner;
  var matcher;
  var bulkApplyEngine;
  var reportGenerator;
  var currentScanResult = null;
  var lastApplyResult = null;
  var scanStartTime = 0;
  function initialize() {
    variableResolver = new VariableResolver();
    styleResolver = new StyleResolver();
    scanner = new Scanner(variableResolver, styleResolver);
    matcher = new Matcher(variableResolver, styleResolver);
    bulkApplyEngine = new BulkApplyEngine(variableResolver, styleResolver);
    reportGenerator = new ReportGenerator();
  }
  figma.on("run", async () => {
    initialize();
    figma.showUI(__html__, { width: 480, height: 600, title: "Variable Checker" });
  });
  figma.on("selectionchange", () => {
    figma.ui.postMessage({
      type: "selection-changed",
      payload: {
        count: figma.currentPage.selection.length
      }
    });
  });
  figma.ui.onmessage = async (message) => {
    console.log(`[Variable Checker] onmessage: ${message.type}`, JSON.stringify(message).slice(0, 200));
    switch (message.type) {
      case "start-scan":
        await handleStartScan(message.scope, message.settings);
        break;
      case "cancel-scan":
        handleCancelScan();
        break;
      case "apply-fix":
        await handleApplyFix(message.findingId);
        break;
      case "apply-selected":
        await handleApplySelected(message.findingIds);
        break;
      case "apply-all":
        await handleApplyAll();
        break;
      case "jump-to-layer":
        handleJumpToLayer(message.layerId);
        break;
      case "request-report":
        await handleRequestReport();
        break;
      case "request-findings":
        handleRequestFindings(message.filter, message.page, message.pageSize);
        break;
      case "undo-last-operation":
        await handleUndo();
        break;
      case "request-options":
        handleRequestOptions(message.category);
        break;
      case "apply-manual":
        await handleApplyManual(message.findingId, message.variableId, message.styleId);
        break;
    }
  };
  async function handleStartScan(scope, settings) {
    scanStartTime = Date.now();
    try {
      await variableResolver.initialize();
      await styleResolver.initialize();
      const finalSettings = settings != null ? settings : {
        scanColors: true,
        scanTypography: true,
        scanEffects: true,
        scanLayout: true,
        scanVariables: true,
        exactMatchOnly: false,
        similarityThreshold: 0.9,
        matchColorVariables: true,
        matchColorStyles: true,
        matchTextStyles: true,
        matchEffectStyles: true,
        matchNumberVariables: true,
        safetySkipLibraryAssets: true,
        safetySkipInstances: true,
        safetyConfirmBulkActions: true,
        performanceBatchSize: 500,
        performanceAsyncProcessing: true
      };
      if (scope === "selection" && figma.currentPage.selection.length === 0) {
        figma.ui.postMessage({
          type: "scan-error",
          payload: { message: "Nothing selected. Select a layer first." }
        });
        return;
      }
      const scanResult = await scanner.scan(
        scope,
        finalSettings,
        (progress) => {
          figma.ui.postMessage({
            type: "scan-progress",
            payload: progress
          });
        }
      );
      currentScanResult = scanResult;
      figma.ui.postMessage({
        type: "scan-complete",
        payload: currentScanResult
      });
      figma.ui.postMessage({
        type: "assets-data",
        payload: {
          variables: variableResolver.getVariables(),
          styles: styleResolver.getStyles()
        }
      });
    } catch (error) {
      figma.ui.postMessage({
        type: "scan-error",
        payload: {
          message: error instanceof Error ? error.message : "Scan failed"
        }
      });
    }
  }
  function handleCancelScan() {
    scanner.cancel();
    bulkApplyEngine.cancel();
  }
  async function handleApplyFix(findingId) {
    if (!currentScanResult) return;
    const finding = currentScanResult.findings.find((f) => f.id === findingId);
    if (!finding) return;
    const result = await bulkApplyEngine.applySingle(finding, (current, total, message) => {
      figma.ui.postMessage({
        type: "apply-progress",
        payload: { current, total, message }
      });
    });
    lastApplyResult = result;
    figma.ui.postMessage({
      type: "apply-complete",
      payload: result
    });
  }
  async function handleApplySelected(findingIds) {
    if (!currentScanResult) {
      console.log(`[Variable Checker] handleApplySelected: no scan result`);
      return;
    }
    const findings = currentScanResult.findings.filter(
      (f) => findingIds.includes(f.id)
    );
    console.log(`[Variable Checker] handleApplySelected: ${findingIds.length} requested, ${findings.length} found`);
    if (findings.length === 0) {
      figma.ui.postMessage({
        type: "apply-complete",
        payload: {
          success: false,
          layersUpdated: 0,
          variablesLinked: 0,
          stylesApplied: 0,
          failedUpdates: 0,
          errors: [{ layerId: "", layerName: "", findingId: "", message: "Findings not found, please re-scan" }],
          duration: 0
        }
      });
      return;
    }
    const result = await bulkApplyEngine.applySelected(findings, (current, total, message) => {
      figma.ui.postMessage({
        type: "apply-progress",
        payload: { current, total, message }
      });
    });
    console.log(`[Variable Checker] handleApplySelected result:`, JSON.stringify(result));
    lastApplyResult = result;
    figma.ui.postMessage({
      type: "apply-complete",
      payload: __spreadProps(__spreadValues({}, result), { appliedFindingIds: findingIds })
    });
  }
  async function handleApplyAll() {
    if (!currentScanResult) return;
    const result = await bulkApplyEngine.applyAll(
      currentScanResult.findings,
      (current, total, message) => {
        figma.ui.postMessage({
          type: "apply-progress",
          payload: { current, total, message }
        });
      }
    );
    lastApplyResult = result;
    figma.ui.postMessage({
      type: "apply-complete",
      payload: result
    });
  }
  function handleJumpToLayer(layerId) {
    try {
      const node = figma.getNodeById(layerId);
      if (node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
        const sceneNode = node;
        figma.currentPage.selection = [sceneNode];
        figma.viewport.scrollAndZoomIntoView([sceneNode]);
      }
    } catch (e) {
      console.error("Jump to layer failed:", e);
    }
  }
  async function handleRequestReport() {
    if (!currentScanResult) return;
    const duration = Date.now() - scanStartTime;
    const reportData = reportGenerator.generate(
      currentScanResult.findings,
      currentScanResult.summary,
      lastApplyResult,
      currentScanResult.scope,
      duration
    );
    figma.ui.postMessage({
      type: "report-data",
      payload: reportData
    });
  }
  function handleRequestFindings(filter, page, pageSize) {
    if (!currentScanResult) return;
    let filtered = [...currentScanResult.findings];
    if (filter.category !== "all") {
      filtered = filtered.filter((f) => f.category === filter.category);
    }
    if (filter.matchType !== "all") {
      filtered = filtered.filter((f) => f.matchType === filter.matchType);
    }
    if (filter.source !== "all") {
      if (filter.source === "both") {
        filtered = filtered.filter((f) => f.source !== null);
      } else if (filter.source === "none") {
        filtered = filtered.filter((f) => f.source === null);
      } else {
        filtered = filtered.filter((f) => f.source === filter.source);
      }
    }
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) => f.layerName.toLowerCase().includes(query) || f.currentValue.toLowerCase().includes(query) || f.suggestedValue && f.suggestedValue.toLowerCase().includes(query) || f.property.toLowerCase().includes(query)
      );
    }
    if (filter.minConfidence > 0) {
      filtered = filtered.filter((f) => f.confidence >= filter.minConfidence);
    }
    if (filter.maxConfidence < 100) {
      filtered = filtered.filter((f) => f.confidence <= filter.maxConfidence);
    }
    filtered.sort((a, b) => {
      const getSortValue = (f) => {
        switch (filter.sortBy) {
          case "confidence":
            return f.confidence;
          case "category":
            return f.category;
          case "layer":
            return f.layerName;
          case "property":
            return f.property;
          case "currentValue":
            return f.currentValue;
          default:
            return f.confidence;
        }
      };
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      if (typeof aVal === "number" && typeof bVal === "number") {
        return filter.sortOrder === "desc" ? bVal - aVal : aVal - bVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return filter.sortOrder === "desc" ? -cmp : cmp;
    });
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);
    figma.ui.postMessage({
      type: "findings-data",
      payload: {
        findings: paginated,
        total,
        page,
        pageSize
      }
    });
  }
  async function handleUndo() {
    const success = await bulkApplyEngine.undo();
    figma.ui.postMessage({
      type: "undo-status",
      payload: {
        canUndo: success,
        operationDescription: success ? "Undo completed" : "Nothing to undo"
      }
    });
  }
  function handleRequestOptions(category) {
    let variables = [];
    let styles = [];
    switch (category) {
      case "color":
        variables = variableResolver.getColorVariables();
        styles = styleResolver.getColorStyles();
        break;
      case "effects":
      case "dimension":
        variables = variableResolver.getFloatVariables();
        styles = styleResolver.getEffectStyles();
        break;
      case "typography":
        variables = [];
        styles = styleResolver.getTextStyles();
        break;
      case "variable":
      case "components":
        variables = variableResolver.getVariables();
        styles = [];
        break;
      default:
        variables = variableResolver.getVariables();
        styles = styleResolver.getStyles();
    }
    figma.ui.postMessage({
      type: "options-data",
      payload: { category, variables, styles }
    });
  }
  async function handleApplyManual(findingId, variableId, styleId) {
    if (!currentScanResult) {
      console.log(`[Variable Checker] handleApplyManual: no scan result`);
      return;
    }
    const finding = currentScanResult.findings.find((f) => f.id === findingId);
    if (!finding) {
      console.log(`[Variable Checker] handleApplyManual: finding ${findingId} not found`);
      return;
    }
    if (!finding.suggestion) {
      if (!variableId && !styleId) return;
      finding.suggestion = {
        variableId: variableId != null ? variableId : null,
        styleId: styleId != null ? styleId : null,
        name: "",
        type: variableId ? "variable" : "style",
        category: finding.category,
        confidence: 100,
        matchType: "exact",
        distance: 0,
        source: "local"
      };
    } else {
      if (variableId) finding.suggestion.variableId = variableId;
      if (styleId) finding.suggestion.styleId = styleId;
    }
    const result = await bulkApplyEngine.applySingle(finding, (current, total, message) => {
      figma.ui.postMessage({
        type: "apply-progress",
        payload: { current, total, message }
      });
    });
    figma.ui.postMessage({
      type: "apply-complete",
      payload: __spreadProps(__spreadValues({}, result), { appliedFindingIds: [findingId] })
    });
  }
})();
