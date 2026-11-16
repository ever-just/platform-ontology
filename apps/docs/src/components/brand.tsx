/* Brand title for the nav: the mark plus the wordmark with an accent dot. */
export function BrandTitle() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      {/* biome-ignore lint: static export, plain img is intended */}
      <img src="/mark.svg" alt="" width={24} height={24} className="size-6" />
      <span>
        Platform<span className="po-dot">.</span>Ontology
      </span>
    </span>
  );
}
