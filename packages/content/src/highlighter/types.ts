export interface HighlightRange {
  start: number;
  end: number;
}

export interface GenericPaintMark extends HighlightRange {
  id: string;
  className?: string;
  color?: string | number;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface StyleSegment extends HighlightRange {
  styles: string[];
  href?: string;
}

export interface SlicedMarkRun extends HighlightRange {
  activeMarks: GenericPaintMark[];
}
