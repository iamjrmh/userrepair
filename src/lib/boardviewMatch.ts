/**
 * Match scanned boardview files to board revisions by filename.
 *
 * Handles the common naming conventions without needing the user to know the
 * exact one:
 *   - "820-01700.bdv"                 (board number only)
 *   - "iPhone 12 - 820-01700.bdv"     (model + board number)
 *   - "Apple iPhone 12 (820-01700).fz"
 *   - "iPhone 12.fz"                  (model only)
 *
 * The board number (a revision's `revision` field) is the precise key, so it is
 * tried first; a model-only file falls back to an exact model-name match. The
 * matching is conservative: when a file would match more than one revision and
 * cannot be disambiguated by model, it is left unmatched rather than guessed.
 */

export interface RevisionRef {
  id: number;
  device_model: string;
  revision: string;
}

export interface ScannedFile {
  path: string;
  name: string;
}

export interface MatchResult {
  matches: { file: ScannedFile; boardId: number }[];
  unmatched: ScannedFile[];
}

/** Common boardview / schematic file extensions to look for. */
export const BOARDVIEW_EXTENSIONS = [
  "bdv", "brd", "bvr", "bv", "bv3", "fz", "cad", "tvw", "f2b", "gr", "obd", "asc", "pdf",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

const pad = (s: string): string => ` ${s} `;

/** Resolve a single filename to a board revision id, or null if no safe match. */
export function matchFile(name: string, revisions: RevisionRef[]): number | null {
  const nf = norm(baseName(name));
  if (!nf) return null;
  const nfp = pad(nf);

  // 1) Board-number (revision) match, token-boundary safe so "820 01700" does
  //    not match "820 01701" and a partial number does not match a longer one.
  const byRev = revisions.filter((r) => {
    const nr = norm(r.revision);
    return nr.length >= 4 && nfp.includes(pad(nr));
  });
  if (byRev.length === 1) return byRev[0]!.id;
  if (byRev.length > 1) {
    const withModel = byRev.filter((r) => {
      const nm = norm(r.device_model);
      return nm.length >= 3 && nfp.includes(pad(nm));
    });
    return withModel.length === 1 ? withModel[0]!.id : null;
  }

  // 2) Model-only file: require an exact model-name match (so "iPhone 12" does
  //    not grab the "iPhone 12 Pro" revision).
  const byModel = revisions.filter((r) => norm(r.device_model) === nf);
  return byModel.length === 1 ? byModel[0]!.id : null;
}

export function matchFiles(files: ScannedFile[], revisions: RevisionRef[]): MatchResult {
  const matches: { file: ScannedFile; boardId: number }[] = [];
  const unmatched: ScannedFile[] = [];
  for (const f of files) {
    const id = matchFile(f.name, revisions);
    if (id != null) matches.push({ file: f, boardId: id });
    else unmatched.push(f);
  }
  return { matches, unmatched };
}
