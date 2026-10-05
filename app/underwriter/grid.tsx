"use client";

import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ValueFormatterParams } from "ag-grid-community";
import type { UnderwriterData } from "@/lib/underwriter";

ModuleRegistry.registerModules([AllCommunityModule]);

// Follows the app's colour tokens, so light and dark mode come for free.
const theme = themeQuartz.withParams({
  backgroundColor: "var(--card)",
  foregroundColor: "var(--foreground)",
  headerBackgroundColor: "var(--background)",
  borderColor: "var(--border)",
  accentColor: "var(--accent)",
  fontFamily: "inherit",
  fontSize: 13,
});

const gbp = (p: ValueFormatterParams) => (p.value == null ? "" : `£${Number(p.value).toFixed(2)}`);
const date = (p: ValueFormatterParams) => (p.value ? new Date(p.value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "");
const time = (p: ValueFormatterParams) => (p.value ? new Date(p.value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const wrap = { wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.4", paddingTop: "6px", paddingBottom: "6px" } };

const COLUMNS = {
  policies: [
    { field: "name", pinned: "left", width: 110 },
    { field: "status", width: 100 },
    { field: "district", width: 120 },
    { field: "gauge", headerName: "Trigger gauge", minWidth: 200 },
    { field: "trigger", width: 150 },
    { field: "premium", headerName: "£/month", valueFormatter: gbp, width: 100, type: "numericColumn" },
    { field: "payout", headerName: "£/day", valueFormatter: gbp, width: 90, type: "numericColumn" },
    { field: "cap", headerName: "Cap", width: 70, type: "numericColumn" },
    { field: "excess", width: 80, type: "numericColumn" },
    { field: "coverStarts", headerName: "Cover starts", valueFormatter: date, width: 120 },
    { field: "paidSoFar", headerName: "Paid so far", valueFormatter: gbp, width: 110, type: "numericColumn" },
    { field: "payTo", headerName: "Pays to", minWidth: 200 },
  ],
  claims: [
    { field: "date", valueFormatter: date, width: 100, sort: "desc" },
    { field: "name", width: 100 },
    { field: "decision", width: 95 },
    { field: "status", width: 95 },
    { field: "reason", width: 130 },
    { field: "decidedBy", headerName: "Decided by", width: 105 },
    { field: "amount", valueFormatter: gbp, width: 95, type: "numericColumn" },
    { field: "explanation", headerName: "Explanation sent to roofer", flex: 1, minWidth: 360, ...wrap },
  ],
  decisions: [
    { field: "when", valueFormatter: time, width: 130, sort: "desc" },
    { field: "type", width: 130 },
    { field: "model", width: 150 },
    { field: "name", headerName: "Roofer", width: 100 },
    { field: "reasoning", headerName: "Reasoning / explanation", flex: 1, minWidth: 360, ...wrap },
  ],
} satisfies Record<string, ColDef[]>;

export function Grid<K extends keyof typeof COLUMNS>({ kind, rows, height = 380 }: { kind: K; rows: UnderwriterData[K]; height?: number }) {
  return (
    <div style={{ height }}>
      <AgGridReact
        theme={theme}
        rowData={rows as object[]}
        columnDefs={COLUMNS[kind] as ColDef[]}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        pagination
        paginationPageSize={20}
        paginationPageSizeSelector={false}
      />
    </div>
  );
}
