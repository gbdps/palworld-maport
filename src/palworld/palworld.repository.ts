import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DataTableExport, ItemDocument, ListQuery, PalDocument } from './palworld.types';

type Rows = Record<string, Record<string, unknown>>;
type TextMap = Map<string, string>;
type TextIndex = {
  exact: TextMap;
  lower: TextMap;
};

const ROOT = resolve(__dirname, '..', '..');

@Injectable()
export class PalworldRepository {
  private pals = new Map<string, PalDocument>();
  private items = new Map<string, ItemDocument>();
  private loadedAt = new Date();

  constructor() {
    this.reload();
  }

  reload() {
    const palNames = this.readTextTable('L10N/pt-BR/Pal/DataTable/Text/DT_PalNameText_Common.json', 'PAL_NAME_');
    const palDescriptions = this.readTextTable(
      'L10N/pt-BR/Pal/DataTable/Text/DT_PalLongDescriptionText.json',
      'PAL_LONG_DESC_',
    );
    const itemNames = this.readTextTable('L10N/pt-BR/Pal/DataTable/Text/DT_ItemNameText_Common.json', 'ITEM_NAME_');
    const itemDescriptions = this.readTextTable(
      'L10N/pt-BR/Pal/DataTable/Text/DT_ItemDescriptionText_Common.json',
      'ITEM_DESC_',
    );

    const palIcons = {
      ...this.readIconRows('DataTable/Character/DT_PalCharacterIconDataTable_Common.json'),
      ...this.readIconRows('DataTable/Character/DT_PalCharacterIconDataTable_SkinOverride_Common.json'),
    };
    const palModels = this.readModelRows('DataTable/Character/DT_PalBPClass_Common.json');
    const itemIcons = this.readIconRows('DataTable/Item/DT_ItemIconDataTable_Common.json');
    const itemRows = this.readRows('DataTable/Item/DT_ItemDataTable_Common.json');

    this.pals = new Map(
      Object.keys({ ...palIcons, ...palModels }).map((palId) => {
        const description = this.resolvePalText(palDescriptions, palId) ?? '';

        return [
          palId,
          {
            palId,
            name: this.resolvePalText(palNames, palId) ?? palId,
            description: this.resolveTextReferences(description, palNames, itemNames),
            icon: palIcons[palId] ?? null,
            model: palModels[palId] ?? null,
          },
        ];
      }),
    );

    this.items = new Map(
      Object.entries(itemRows).map(([itemId, row]) => {
        const iconId = typeof row.IconName === 'string' && row.IconName !== 'None' ? row.IconName : itemId;
        const nameKey = typeof row.OverrideName === 'string' && row.OverrideName !== 'None' ? row.OverrideName : itemId;
        const descKey =
          typeof row.OverrideDescription === 'string' && row.OverrideDescription !== 'None'
            ? row.OverrideDescription.replace(/^ITEM_DESC_/, '')
            : itemId;

        return [
          itemId,
          {
            itemId,
            name: this.resolveItemText(itemNames, nameKey.replace(/^ITEM_NAME_/, '')) ?? itemId,
            icon: itemIcons[iconId] ?? itemIcons[itemId] ?? null,
            description: this.resolveTextReferences(
              this.resolveItemText(itemDescriptions, descKey) ?? '',
              palNames,
              itemNames,
            ),
          },
        ];
      }),
    );

    this.loadedAt = new Date();
  }

  getStats() {
    return {
      loadedAt: this.loadedAt.toISOString(),
      pals: this.pals.size,
      items: this.items.size,
      sourceRoot: ROOT,
    };
  }

  listPals(query: ListQuery = {}) {
    return this.filter([...this.pals.values()], query);
  }

  listItems(query: ListQuery = {}) {
    return this.filter([...this.items.values()], query);
  }

  getPal(palId: string) {
    const pal = this.pals.get(palId);
    if (!pal) throw new NotFoundException(`Pal '${palId}' not found`);
    return pal;
  }

  getItem(itemId: string) {
    const item = this.items.get(itemId);
    if (!item) throw new NotFoundException(`Item '${itemId}' not found`);
    return item;
  }

  private filter<T extends { name: string }>(documents: T[], query: ListQuery) {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const search = query.search?.trim().toLowerCase();
    const filtered = search
      ? documents.filter((document) => JSON.stringify(document).toLowerCase().includes(search))
      : documents;

    return {
      total: filtered.length,
      offset,
      limit,
      data: filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).slice(offset, offset + limit),
    };
  }

  private readTextTable(relativePath: string, prefix: string): TextIndex {
    const exact = new Map<string, string>();
    const lower = new Map<string, string>();
    for (const [key, row] of Object.entries(this.readRows(relativePath))) {
      const textData = row.TextData as { LocalizedString?: unknown; SourceString?: unknown } | undefined;
      const raw = textData?.LocalizedString ?? textData?.SourceString;
      if (typeof raw === 'string') {
        const normalizedKey = key.replace(prefix, '');
        const value = this.fixMojibake(raw);
        exact.set(normalizedKey, value);
        lower.set(normalizedKey.toLowerCase(), value);
      }
    }
    return { exact, lower };
  }

  private resolvePalText(index: TextIndex, palId: string) {
    for (const candidate of this.palTextCandidates(palId)) {
      const exact = index.exact.get(candidate);
      if (exact !== undefined) return exact;

      const lower = index.lower.get(candidate.toLowerCase());
      if (lower !== undefined) return lower;
    }

    return undefined;
  }

  private resolveItemText(index: TextIndex, itemId: string) {
    return index.exact.get(itemId) ?? index.lower.get(itemId.toLowerCase());
  }

  private resolveTextReferences(value: string, palNames: TextIndex, itemNames: TextIndex) {
    return value
      .replace(/<characterName id=\|([^|]+)\|\/>/g, (_, palId: string) => this.resolvePalText(palNames, palId) ?? palId)
      .replace(/<itemName id=\|([^|]+)\|\/>/g, (_, itemId: string) => this.resolveItemText(itemNames, itemId) ?? itemId);
  }

  private palTextCandidates(palId: string) {
    const withoutBoss = palId.replace(/^(BOSS_|Boss_)/, '');
    const withoutSkin = withoutBoss.replace(/_Skin\d+$/i, '');
    const withoutEventSuffix = withoutSkin.replace(/_Oilrig$/i, '');
    const progressiveBaseIds = withoutEventSuffix
      .split('_')
      .map((_, index, parts) => parts.slice(0, parts.length - index).join('_'))
      .filter(Boolean);

    return [...new Set([palId, withoutBoss, withoutSkin, withoutEventSuffix, ...progressiveBaseIds])];
  }

  private readIconRows(relativePath: string): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.readRows(relativePath))
        .map(([id, row]) => [id, this.assetToUrl(this.getAssetPath(row.Icon))])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }

  private readModelRows(relativePath: string): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.readRows(relativePath))
        .map(([id, row]) => [id, this.getAssetPath(row.BPClass)])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }

  private readRows(relativePath: string): Rows {
    const path = join(ROOT, relativePath);
    if (!existsSync(path)) {
      throw new Error(`Required DataTable not found: ${relativePath}`);
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as DataTableExport;
    const rows = parsed[0]?.Rows;
    if (!rows) {
      throw new Error(`Required DataTable has no rows: ${relativePath}`);
    }

    return rows;
  }

  private getAssetPath(value: unknown) {
    if (!value || typeof value !== 'object') return null;
    const assetPath = (value as { AssetPathName?: unknown }).AssetPathName;
    return typeof assetPath === 'string' && assetPath !== 'None' ? assetPath : null;
  }

  private assetToUrl(assetPath: string | null) {
    if (!assetPath?.startsWith('/Game/')) return null;
    const withoutObjectName = assetPath.slice('/Game/'.length).split('.')[0];
    return `/api/assets/${withoutObjectName}.png`;
  }

  private fixMojibake(value: string) {
    return /Ã|Â/.test(value) ? Buffer.from(value, 'latin1').toString('utf8') : value;
  }
}
