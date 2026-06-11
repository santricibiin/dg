"use client";

import { useState } from "react";
import OperationRunner from "@/components/OperationRunner";
import CategoryPicker from "@/components/CategoryPicker";

export default function AddPage() {
  const [only, setOnly] = useState([]);
  const [skip, setSkip] = useState([]);
  const [op, setOp] = useState("gte");
  const [threshold, setThreshold] = useState("20");
  const [dryRun, setDryRun] = useState(true);

  return (
    <OperationRunner
      action="add"
      title="Tambah Produk"
      description="Tambah produk yang lolos filter jumlah seller aktif."
      getPayload={() => ({ only, skip, op, threshold, dryRun })}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Operator</label>
          <select className="field" value={op} onChange={(e) => setOp(e.target.value)}>
            <option value="gte">&gt;= (minimal)</option>
            <option value="lte">&lt;= (maksimal)</option>
            <option value="eq">= (sama dengan)</option>
          </select>
        </div>
        <div>
          <label className="label">Ambang seller aktif</label>
          <input
            className="field"
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
      </div>
      <CategoryPicker
        label="Hanya kategori"
        mode="add"
        value={only}
        onChange={setOnly}
      />
      <CategoryPicker
        label="Lewati kategori"
        mode="add"
        value={skip}
        onChange={setSkip}
      />
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
        Mode simulasi (dry-run)
      </label>
    </OperationRunner>
  );
}
