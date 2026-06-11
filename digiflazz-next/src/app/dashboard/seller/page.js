"use client";

import { useState } from "react";
import OperationRunner from "@/components/OperationRunner";
import CategoryPicker from "@/components/CategoryPicker";

export default function SellerPage() {
  const [only, setOnly] = useState([]);
  const [skip, setSkip] = useState([]);
  const [multi, setMulti] = useState("");
  const [rating, setRating] = useState("");
  const [cheapest, setCheapest] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [codePrefix, setCodePrefix] = useState("");
  const [codeLen, setCodeLen] = useState("8");
  const [dryRun, setDryRun] = useState(true);

  return (
    <OperationRunner
      action="seller"
      title="Ubah Seller"
      description="Pilih dan terapkan seller untuk produk berdasarkan filter."
      getPayload={() => ({
        only,
        skip,
        multi,
        rating: rating === "" ? null : parseFloat(rating),
        cheapest,
        overwrite,
        codePrefix,
        codeLen: parseInt(codeLen, 10) || 8,
        dryRun,
      })}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Multi</label>
          <select className="field" value={multi} onChange={(e) => setMulti(e.target.value)}>
            <option value="">Abaikan</option>
            <option value="Ya">Ya</option>
            <option value="Tidak">Tidak</option>
          </select>
        </div>
        <div>
          <label className="label">Rating minimal</label>
          <input
            className="field"
            type="number"
            step="0.1"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            placeholder="contoh 3.5"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Prefix kode</label>
          <input className="field" value={codePrefix} onChange={(e) => setCodePrefix(e.target.value)} placeholder="TSEL" />
        </div>
        <div>
          <label className="label">Panjang kode</label>
          <input className="field" type="number" value={codeLen} onChange={(e) => setCodeLen(e.target.value)} />
        </div>
      </div>
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
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={cheapest} onChange={(e) => setCheapest(e.target.checked)} />
          Pilih seller termurah
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Timpa produk yang sudah punya seller
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Mode simulasi (dry-run)
        </label>
      </div>
    </OperationRunner>
  );
}
