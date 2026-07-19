/**
 * Local-filesystem avatar storage. Replaces the Supabase Storage `avatars` bucket.
 *
 * Files are stored in $AVATAR_DIR (default ./uploads/avatars) and referenced by the
 * filename stored in players.avatar. Mirrors the old behaviour: the bot writes the
 * uploaded buffer to disk, and later reads the bytes back to attach to Discord embeds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger';

const log = createLogger('avatarStorage');

const AVATAR_DIR = process.env.AVATAR_DIR
    ? path.resolve(process.env.AVATAR_DIR)
    : path.join(process.cwd(), 'uploads', 'avatars');

/** Absolute path for a stored avatar filename. */
export function avatarPath(fileName: string): string {
    return path.join(AVATAR_DIR, path.basename(fileName));
}

/**
 * Save an avatar image buffer to disk. Returns the generated filename
 * (to store in players.avatar).
 */
export async function saveAvatar(
    playerId: number | string,
    buffer: Buffer,
    ext: string
): Promise<string> {
    await fs.promises.mkdir(AVATAR_DIR, { recursive: true });
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'png';
    const fileName = `${playerId}-${Date.now()}.${safeExt}`;
    await fs.promises.writeFile(avatarPath(fileName), buffer);
    log.info({ fileName, playerId }, 'Avatar saved');
    return fileName;
}

/**
 * Read an avatar file as a Buffer (for attaching to a Discord embed).
 * Returns null if the file is missing so callers can render without a thumbnail.
 */
export async function readAvatar(fileName: string): Promise<Buffer | null> {
    if (!fileName) return null;
    try {
        return await fs.promises.readFile(avatarPath(fileName));
    } catch (err) {
        log.debug({ fileName, error: (err as Error).message }, 'Avatar not found on disk');
        return null;
    }
}

/** Best-effort deletion of an avatar file (used when a player is deleted). */
export async function deleteAvatar(fileName: string): Promise<void> {
    if (!fileName) return;
    try {
        await fs.promises.unlink(avatarPath(fileName));
    } catch {
        // ignore — file may already be gone
    }
}
