/** ₱1,234,567 (no decimals unless needed). */
export const php = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
