"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const BAR_COLOR = "#163d82";
const PIE_COLORS = ["#163d82", "#4078c0", "#aac6e8", "#75a1d6", "#0c2350"];

export function UsageBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
          cursor={{ fill: "rgba(22,61,130,0.06)" }}
        />
        <Bar dataKey="total" fill={BAR_COLOR} radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActionPieChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
