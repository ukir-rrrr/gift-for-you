/**
 * Game modes a Share JSON can name. Phase 3 ships the platformer only. A kart race (F3-11, Won't
 * for this phase) would add an entry here, a `mode` literal in @gfy/schema, its own course data,
 * and a GameMode implementation in the player; the creator flow and the server stay as they are.
 */
export type GameModeInfo = { id: 'platformer'; name: string; available: boolean }

export const GAME_MODES: readonly GameModeInfo[] = [{ id: 'platformer', name: 'さんぽ（横スクロール）', available: true }]
