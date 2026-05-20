export type DataTableExport = Array<{
  Rows?: Record<string, Record<string, unknown>>;
}>;

export interface PalDocument {
  palId: string;
  name: string;
  description: string;
  icon: string | null;
  model: string | null;
  elements: string[];
  minLevel: number | null;
  maxLevel: number | null;
  rarity: number | null;
  zukanIndex: number | null;
  zukanIndexSuffix: string;
  isBoss: boolean;
}

export interface ItemDocument {
  itemId: string;
  name: string;
  icon: string | null;
  description: string;
}

export interface ListQuery {
  limit?: number;
  offset?: number;
  search?: string;
  level?: number;
}
