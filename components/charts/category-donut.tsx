"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/format";

interface Slice {
  name: string;
  value: number;
}

// Neutral palette so charts match the minimalist theme.
const COLORS = [
  "oklch(0.72 0.05 280)",
  "oklch(0.55 0.06 230)",
  "oklch(0.62 0.15 150)",
  "oklch(0.68 0.14 75)",
  "oklch(0.6 0.15 20)",
  "oklch(0.55 0.08 310)",
  "oklch(0.48 0.06 200)",
  "oklch(0.75 0.04 280)",
];

export function CategoryDonut({
  data,
  currency,
}: {
  data: Slice[];
  currency: string;
}) {
  if (data.length === 0) return null;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={90}
            strokeWidth={0}
            paddingAngle={1}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, name) => [
              formatMoney(Number(value), currency),
              String(name),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
