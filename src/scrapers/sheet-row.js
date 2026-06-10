/**
 * Normalize scraped scholarship objects into Google Sheet append rows.
 */
export function toSheetRow(item) {
  return {
    "Scholarship Name": item.name || "",
    Type: item.source || item.type || "",
    Organization: item.organization || "",
    Amount: item.amount || "",
    Deadline: item.deadline || "",
    Notes: item.description || item.notes || "",
    "Application URL": item.url || item.website || "",
    "Essay Required(Y/N)": item.essayRequired || "",
    "Document Needed": item.documents || "",
    Status: item.status || "Not Started",
    "Scraped At": item.scrapedAt || new Date().toISOString(),
  };
}

export function toSheetRows(items, source) {
  return (items || [])
    .filter((i) => i && (i.url || i.website))
    .map((i) =>
      toSheetRow({
        ...i,
        url: i.url || i.website,
        source: i.source || source,
      })
    );
}
