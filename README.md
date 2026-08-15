# 100 - Signal Desk

**An analyst workbench in a single file.** Drop in any CSV and get the first hour of analysis back.

[Open the app](https://augustineiacopelli.github.io/appaday-100-signal-desk/) | [AppADay portfolio](https://augustineiacopelli.github.io/appaday/)

App 100 of [AppADay](https://augustineiacopelli.github.io/appaday/), a daily discipline project shipping one complete, functional, mobile-friendly web app every day.

---

## What it does

Signal Desk reads a spreadsheet the way an analyst would on first contact. It sniffs the delimiter, works out what every column actually holds, measures each one, scores how clean the file is, looks for relationships between the numbers, and proposes only the charts the shape of the data supports. Nothing is configured to get that first pass, and nothing is uploaded anywhere. The file is parsed in the browser.

### Parsing and typing

- Delimiter detection across comma, tab, semicolon and pipe, scored on consistency rather than raw frequency
- RFC-style CSV parsing that handles quoted delimiters, embedded newlines and escaped quotes
- Type inference against integer, decimal, currency, percent, date, boolean, category, identifier and free-text patterns
- Seven date formats including ISO, US, day-first, and named months
- Every column assigned a role of measure, dimension, time or identifier, which decides how it can be used

### Profiling and quality

- Quartiles, standard deviation, skew, and outliers by interquartile, three-sigma or percentile rule
- Freedman-Diaconis histograms sized from the spread of the data
- A quality score out of 100 built from missingness, duplicate rows, constant and empty columns, mixed types and outlier load, with every deduction shown
- Pearson correlation across every numeric pair as a diverging heatmap plus a ranked table

### Analysis

- **Charts** proposed from the shape of the data, each stating the rule that produced it, plus a builder for your own
- **Pivot** crossing two fields with row totals, column totals and a grand total
- **Compare** measuring every column across two segments and ranking the differences by effect size rather than raw gap
- **Cohorts** building a retention triangle, cumulative value per entity, average retention curve and cohort sizes from any repeating entity plus a date
- **Briefing** written by Claude from the computed profile only

### Resolving problems

Every quality flag that can be resolved carries a **resolve** button offering each sensible remedy, with the effect it would have and a note on when it is the right call. Gaps can be filled with the median, mean, zero, the most common value, or the previous row, or the rows can be dropped. Duplicates can lose their repeats or every copy. Outliers can be capped at the fences or dropped. Unreadable values can be coerced to missing so the column becomes usable. Sloppy categories can be trimmed and case-unified. Dead columns can be excluded.

Only one fix applies per issue per column, so choosing another swaps it in. The Fixes applied panel lists every fix with an on/off toggle, so you can see the analysis with and without it in one click, and a swap button to reopen the chooser.

Fixes are never destructive. They apply to the working copy only, changed cells are marked in amber wherever they appear with the original value on hover, a banner discloses how many values changed and how many rows are held out, the exported report carries a Fixes applied section, and the verifier includes a check comparing the raw rows against a signature taken at load time.

### Drill-down

Every statistic, bar, point, cell and tile opens an inspector showing how the number was calculated, a chart of just that slice, and every row that fed it, loading in chunks so large selections do not freeze the tab. From there you can filter the whole desk to that selection or download exactly those rows as CSV.

### Verification

A **Verify this analysis** button runs up to eighteen reconciliation checks against the loaded data and reports both answers side by side, not just a pass mark. It re-sums every column independently, counts values above and below the median, confirms present plus missing equals the row count, checks histogram bins account for every value, confirms grouped totals add back to the ungrouped total, tests the correlation matrix for symmetry and bounds, reproduces the duplicate count, checks the quality score equals 100 minus its penalties, confirms cohort and pivot totals reconcile three separate ways, and proves the source file is untouched by any fix.

### Control

- Day-first dates and comma decimal separators for non-US files
- Configurable missing-value tokens
- Choice of outlier rule, and the option to exclude outliers from all statistics
- Per-column overrides to rename, force a type, or exclude a column from the analysis
- Light mode and a colourblind-safe chart palette
- A workspace file saving filters, overrides, pivot, comparison, cohort choice and settings, reloadable against next month's export

### Resilience

Large files parse in chunks with a progress bar and an adjustable row limit, wide files render column cards in batches, and the render pipeline sits behind an error boundary that reports the failure and keeps the data loaded.

---

## Using it

1. Open the app and drop in a CSV, or press one of the two sample buttons
2. Read the Overview for the health check, then Columns for the detail
3. Tap any number that looks surprising
4. Press Verify this analysis before you act on anything

A built-in guide behind the `?` icon covers 54 topics, from what a histogram is telling you to why the median beats the mean on skewed money data.

## AI briefing

The Briefing tab calls the Anthropic API directly from the browser using your own key, entered through the gear icon and stored in localStorage only. It sends the computed profile, never your rows: column names, types, statistics, quality flags, correlation figures and cohort curves. The statistics are computed locally and the model only narrates them.

## Build notes

Single file, vanilla HTML, CSS and JavaScript. No frameworks, no build step, no dependencies beyond Google Fonts. All charts are drawn on hand-rolled canvas: line, bar, histogram, scatter with an OLS fit, diverging heatmap and radial gauge, all with hit-test regions so every element is clickable. Scales from a 375px phone to desktop.

Validated with 557 automated tests across seven suites covering parsing, statistics, cohorts, the inspector, the guide, pivot and comparison arithmetic, the verifier, settings and workspace round-trips, and the remediation layer, plus canvas instrumentation confirming no non-finite geometry across roughly twelve thousand draw calls at both phone and desktop widths.

## Credits

Built by Augustine Iacopelli. Fonts are Space Grotesk and IBM Plex Mono via Google Fonts.
