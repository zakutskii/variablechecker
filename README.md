# Variable Checker

A production-ready Figma plugin that audits and standardizes the usage of Variables and Styles across Figma documents.

## Features

### 1. Audit Design Consistency
- **Colors** - Detect hardcoded fills, strokes, gradients matching existing Variables/Color Styles
- **Typography** - Find text not linked to Text Styles (font family, weight, size, line height, etc.)
- **Effects** - Detect drop shadows, inner shadows, blurs, unlinked Effect Styles
- **Layout** - Find padding, gap, width, height, corner radius, auto layout values
- **Variables** - Detect values that could be linked to Color, Number, String, Boolean Variables

### 2. Smart Matching Engine
- Exact matching for perfect matches
- Similar matching for near-identical values
- Confidence scoring with distance metrics
- Priority: Local Variables → Local Styles → Library Variables → Library Styles

### 3. Review & Fix Workflow
- Data table with findings
- Row selection, bulk actions
- Sorting, filtering, search
- Pagination
- Apply single, selected, or all fixes
- Jump to layer

### 4. Bulk Apply Engine
- Variable binding
- Style application
- Progress indicators with cancellation support
- Duplicate prevention and error handling
- Undo support

### 5. Reporting
- Summary statistics
- Category breakdown
- JSON and CSV export

## Installation

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

The build output will be in the `dist/` directory:
- `dist/code.js` - Plugin code
- `dist/index.html` - Plugin UI
- `dist/assets/` - Static assets

### Install in Figma

1. Open Figma Desktop
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select the `manifest.json` file
4. The plugin will appear in **Plugins → Development → Variable Checker**

## Usage

### 1. Audit
1. Select the scan scope: **Current Selection**, **Current Page**, or **Entire File**
2. Configure scan categories and safety options
3. Click **Run Scan**
4. Wait for the scan to complete

### 2. Results
1. Review findings in the data table
2. Use filters and search to refine results
3. Select individual findings or use **Select All**
4. Click **Apply** for individual fixes or **Apply Selected** / **Apply All** for bulk operations

### 3. Report
1. View summary statistics and breakdowns
2. Export report as JSON or CSV

### 4. Settings
- Configure matching thresholds
- Toggle match sources
- Set safety preferences
- Adjust performance settings

## Architecture

```
src/
├── core/
│   ├── scanner/          # Layer scanning engines
│   │   ├── scanner.ts    # Main scanner coordinator
│   │   ├── color-scanner.ts
│   │   ├── typography-scanner.ts
│   │   ├── effects-scanner.ts
│   │   └── layout-scanner.ts
│   ├── matcher/          # Value matching engines
│   │   ├── matcher.ts    # Main matcher coordinator
│   │   ├── color-matcher.ts
│   │   ├── typography-matcher.ts
│   │   └── variable-matcher.ts
│   ├── variables/        # Variable resolution
│   ├── styles/           # Style resolution
│   ├── reporting/        # Report generation
│   └── bulk-apply/       # Bulk apply engine
├── ui/
│   ├── components/ui/    # shadcn/ui components
│   ├── features/         # Feature pages
│   │   ├── audit/
│   │   ├── results/
│   │   ├── report/
│   │   └── settings/
│   ├── hooks/            # React hooks
│   ├── providers/        # React context providers
│   └── lib/              # UI utilities
├── types/                # TypeScript types
├── shared/               # Shared constants
└── utils/                # Utility functions
```

## Tech Stack

- **Runtime**: Figma Plugin API
- **UI**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Build**: Vite + esbuild
- **Icons**: Lucide React + Radix Icons
