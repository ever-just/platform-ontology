import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pager({ page, pages, total, onPage, label = 'items' }: { page: number; pages: number; total: number; onPage: (p: number) => void; label?: string }) {
  return (
    <div className="pager" role="navigation" aria-label="Pagination">
      <span className="pager-count">{total} {label}</span>
      <div className="pager-ctl">
        <button className="icon-btn" aria-label="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button>
        <span className="pager-num">{page + 1} / {Math.max(1, pages)}</span>
        <button className="icon-btn" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
