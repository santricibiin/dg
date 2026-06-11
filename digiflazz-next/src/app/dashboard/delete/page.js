"use client";

import { useState } from "react";
import OperationRunner from "@/components/OperationRunner";
import CategoryPicker from "@/components/CategoryPicker";

export default function DeletePage() {
  const [only, setOnly] = useState([]);
  const [skip, setSkip] = useState([]);
  const [dryRun, setDryRun] = useState(true);

  return (
    <OperationRunner
      action="delete"
      title="Hapus Produk"
      description="Hapus produk massal per kategori, dikelompokkan brand dan tipe."
      getPayload={() => ({ only, skip, dryRun })}
    >
      <CategoryPicker
        label="Hanya kategori"
        mode="buyer"
        value={only}
        onChange={setOnly}
      />
      <CategoryPicker
        label="Lewati kategori"
        mode="buyer"
        value={skip}
        onChange={setSkip}
      />
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
        Mode simulasi (dry-run, tidak benar-benar menghapus)
      </label>
    </OperationRunner>
  );
}
