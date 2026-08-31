const SELL_PARTS = [
  ["warranty", "보증서"],
  ["box", "정품 박스"],
  ["manual", "설명서/책자"],
  ["extra-link", "추가 링크"],
  ["tag", "정품 택"],
  ["receipt", "구매 영수증"],
];

export function normalizeSellParts(value) {
  const values = (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  if (values.includes("풀세트")) return ["풀세트"];

  const selected = new Set();
  const unknown = [];
  values.forEach((part) => {
    const found = SELL_PARTS.find(([code, label]) => part === code || part === label);
    if (found) selected.add(found[0]);
    else if (!unknown.includes(part)) unknown.push(part);
  });
  if (SELL_PARTS.every(([code]) => selected.has(code))) return ["풀세트"];
  return SELL_PARTS.filter(([code]) => selected.has(code)).map(([, label]) => label).concat(unknown);
}
